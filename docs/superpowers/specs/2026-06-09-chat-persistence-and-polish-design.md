# Chat Persistence + Links Store + Tone & Markdown Polish — Design

**Date:** 2026-06-09
**Owner:** sagarkushwaha5599@gmail.com
**Status:** Design approved by user, pending implementation plan

## Problem

Five concerns came up after the training-substrate rollout (commit `01f93d8`, 2026-06-08):

1. **Conversation history is in-memory only.** `flows/conversation.js:10` keeps a `Map<telegramId, history>` ring buffer. Lost on every bot restart. Already a documented Known Limitation in `CLAUDE.md`. Operator has no way to review past conversations.
2. **No admin visibility into customer chats.** The admin panel can see user records, payments, stage, and aggregate stats — but cannot read what the bot actually said to a given customer. Hard to debug "why did the bot reply that way?" complaints.
3. **Links are placeholders that never get substituted.** `templates.json` bodies contain `{{link}}`, `{{list1_link}}`, `{{list2_link}}` placeholders for live payment URLs. The bot's runtime calls `replaceMarkers` (swaps `{{TEMPLATE:<key>}}`) but never expands the inner placeholders. Documented as a Known Limitation in `CLAUDE.md`; operator must either avoid sending these templates or hand-edit the file.
4. **Bot's `**bold**` Markdown leaks as literal text.** `handlers/message.js:47` calls `ctx.reply(reply)` with no `parse_mode`. When Claude emits `**word**` for emphasis (default LLM habit), Telegram displays the literal asterisks. The real operator never bolds anything.
5. **Tone uses curt abbreviations.** STAGE_PROMPTS and `examples.json` contain `kr` / `krwa do` / `krna` shortenings copied from the real operator. Operator wants a softer, more polite register going forward (`kariye` / `karwa dijiye` / `karna`).

## Goals

1. Persist every turn (user message + bot reply + system message) to a Firestore `users/{telegramId}/messages/{auto-id}` subcollection with full per-message context (stage, source, faqKey, model).
2. Add an admin chat viewer at `/users/[telegramId]` that loads the user info card and chronological message thread, with a manual Refresh button and a "Load older" pagination control.
3. Add a Firestore `links` collection (`{name, url, label?, updatedAt}`) plus an admin `/links` CRUD page so the operator can rotate live payment/demo URLs without code changes.
4. Close the unsubstituted-placeholder gap: extend the substitution chain to `replaceMarkers → expandLinks → stripEmphasis` so `{{link}}` / `{{list1_link}}` / `{{list2_link}}` resolve at send time.
5. Strip leftover `**bold**` and `*italic*` patterns from every reply before sending, and add an explicit "no Markdown" rule to every stage prompt.
6. Rewrite STAGE_PROMPTS, `templates.json`, and `examples.json` to the polite register (full words / -iye / -karo forms). Also remove the buggy "first text becomes name" overwrite at `handlers/message.js:78-82`.

## Non-goals

- Real-time chat updates via Firestore listeners. Manual refresh only.
- Admin replying to users from the chat viewer. Read-only.
- Search across all chats, full-text search, or sentiment scoring.
- Conversation transcript export.
- Message edit / delete from the admin UI. Subcollection is append-only; deletions require manual Firestore console action.
- Auto-translation.
- Migrating off the gift-card payment model.
- Refreshing name/username on every message (kept at `/start` only).

## Architecture

### Firestore schema additions

**`users/{telegramId}/messages/{auto-id}` subcollection** — append-only per-user chat log. Each doc:

| Field | Type | Notes |
|---|---|---|
| `role` | `'user'` \| `'bot'` | Who authored the turn |
| `text` | string | Raw message text after any substitution |
| `ts` | ISO string | Append timestamp (UTC) |
| `stage` | string | User's stage at time of message |
| `source` | `'user'` \| `'claude'` \| `'faq'` \| `'template'` \| `'system'` | How the message was produced. `'user'` for user-authored; `'claude'` for Claude-generated; `'faq'` for FAQ short-circuit; `'template'` for canned templates sent directly; `'system'` for handler-generated stock messages (e.g. payment_pending auto-detail block) |
| `faqKey` | string \| absent | Present only when `source === 'faq'` |
| `model` | string \| absent | Present only when `source === 'claude'` (e.g. `'claude-haiku-4-5'`) |

**`links/{name}` top-level collection** — link store:

| Field | Type | Notes |
|---|---|---|
| `name` | string (doc ID) | e.g. `payment_link_phonepe`, `list1_link`, `payment_proof` |
| `url` | string | Live URL |
| `label` | string \| absent | Optional human label for admin UI |
| `updatedAt` | ISO string | Bumped on every write |

Bootstrap seed (run once at first deployment): `payment_link_phonepe`, `payment_link_paytm`, `payment_link_gpay`, `payment_link_amazon_pay`, `list1_link`, `list2_link`, `payment_proof` — all with URL `https://example.com/FILL_ME`. Operator replaces via admin before going live.

### Bot runtime additions

**`upsc-bot/src/db/messages.js`** (new) — `appendMessage(telegramId, msg)` and `getMessages(telegramId, { limit, before? })`. Matches the existing `db/users.js` / `db/courses.js` pattern: lazy `getDb()`, defensive `try/catch`, log prefix `[messages]`.

**`upsc-bot/src/db/links.js`** (new) — `getAllLinks()` returns a `{ name: url }` map. Same pattern. Log prefix `[links]`.

**`upsc-bot/src/training/templates.js`** — new exported `expandLinks(text, links)` using the existing `substitute()` helper.

**`upsc-bot/src/training/sanitize.js`** (new) — `stripEmphasis(text)` removes `**...**` and orphan `*...*` patterns. Single export, no other concerns.

**`upsc-bot/src/flows/conversation.js`** — `processMessage` now returns `{ reply, newStage, selectedCourseId, meta }` where `meta = { source, faqKey?, model? }`. Reply chain becomes `replaceMarkers → expandLinks → stripEmphasis` (in that order) before return. Loads links once per turn alongside the existing examples/templates `Promise.all`.

**`upsc-bot/src/handlers/message.js`**:
- Appends the user's incoming text to the messages subcollection BEFORE calling `processMessage` (so even a Claude crash leaves the user message logged).
- Appends the bot's outgoing reply to the messages subcollection AFTER `processMessage` returns, using the returned `meta` block for `source`/`faqKey`/`model`.
- If the payment_pending auto-detail block (lines ~62-71) fires, appends that block as `source: 'system'`.
- Removes the buggy `if (user.stage === 'new' && newStage === 'engaged') { ... }` first-text-overwrite block at lines 76-83.

**`upsc-bot/src/handlers/photo.js`** — appends user side as `{ role: 'user', text: '[photo]', source: 'user' }` and the bot's stock "wait for verification" reply as `source: 'system'`.

**`upsc-bot/src/ai/prompts.js`** — STAGE_PROMPTS rewritten with polite register: `kr` → `kariye` / `karo`, `krwa do` → `karwa dijiye`, `krna` → `karna`, `avi kroge` → `abhi kar dijiye`, etc. Persona name stays "UPSC Helping Hand (Aspirant)". A new universal rule appended to every stage: **"NEVER use Markdown or asterisks (`**bold**`, `*italic*`) for emphasis — Telegram chat is plain text."**

**`upsc-bot/training/templates.json`** — same polite-tone rewrites in canned bodies. Keys unchanged.

**`upsc-bot/training/examples.json`** — same polite-tone rewrites in the operator-side replies in each example. `[SELECTED_COURSE:<id>]` tags and `{{TEMPLATE:<key>}}` markers stay intact.

### Admin panel additions

**`upsc-admin/app/(dashboard)/users/[telegramId]/page.js`** (new) — chat thread viewer. On load: fetch user via `/api/users?telegramId=<id>` (route extended to support single-user query) and the most recent 100 messages via `/api/messages?telegramId=<id>&limit=100`. Renders:
- Back link to `/users`
- User info card (name, @username, stage, joined date, paid courses)
- Manual "Refresh" button
- Chronological message bubbles (oldest at top, newest at bottom). User-authored on the left, bot/system on the right. Each bubble shows: timestamp, stage at time, source badge (`claude` / `faq` / `template` / `system`).
- "Load older" button at the top that fetches the previous 100 via `?before=<oldest-ts>`.

**`upsc-admin/app/api/messages/route.js`** (new) — `GET ?telegramId=<id>&limit=100&before=<iso-ts>` returns messages array sorted by `ts` desc, limited. Standard NextAuth session check.

**`upsc-admin/app/api/users/route.js`** — extend the existing `GET` to optionally accept `?telegramId=<id>` and return a single doc.

**`upsc-admin/app/(dashboard)/links/page.js`** (new) — table with columns `Name | URL | Updated | Actions`. "Add link" inline form, edit/delete per row. Pattern matches existing `/courses` exactly.

**`upsc-admin/app/api/links/route.js`** (new) — `GET / POST / PATCH / DELETE` on the `links` collection. NextAuth session check.

**`upsc-admin/components/Sidebar.js`** — add "Links" entry after "Courses".

**`upsc-admin/components/UserTable.js`** — each row links to `/users/[telegramId]` (either whole row clickable or a "View chat" button — pick whichever feels less accidental).

### Data flow per turn

**Text turn:**

1. `handlers/message.js` receives text. Skip if it starts with `/`.
2. Get-or-create user. (Existing logic, minus the buggy name-overwrite.)
3. `appendMessage(id, { role:'user', text, ts, stage: user.stage, source:'user' })`.
4. `await processMessage(user, text)` → returns `{ reply, newStage, selectedCourseId, meta }`.
5. `ctx.reply(reply)` (plain text, no `parse_mode`).
6. `appendMessage(id, { role:'bot', text: reply, ts, stage: user.stage, source: meta.source, faqKey: meta.faqKey, model: meta.model })`.
7. If stage changed → `updateStage` (existing). If transition to `payment_pending` with `selectedCourseId`, send the payment-detail block and append it as `source:'system'`.

**Photo turn:** parallel pattern with `text: '[photo]'` on the user side; bot's stock reply is `source:'system'`.

**Reply chain inside `processMessage`:** load examples/templates/faq/links via one `Promise.all`. FAQ short-circuit applies `replaceMarkers → expandLinks → stripEmphasis` before returning. Claude branches do the same after the SELECTED_COURSE tag is stripped (in the `interested` stage).

### Admin read path

- `/users` table now has clickable rows → `/users/[telegramId]`.
- `/users/[telegramId]` fetches user + messages on mount. "Refresh" re-fetches both. "Load older" fetches `?before=<oldest visible ts>` and prepends.
- `/links` fetches all links on mount; mutations call POST/PATCH/DELETE then re-fetch.

### Failure handling

- **`appendMessage` Firestore write failure** → log `[messages] append failed: ...` and continue. The user-facing send must NOT fail because of a missed log write. The existing defensive `try/catch + return false` pattern in `db/*.js` extends here.
- **`getAllLinks` Firestore read failure** → return `{}`. `expandLinks` leaves placeholders as literal text — same intentional behavior as `replaceMarkers` for unknown template markers. Operator sees the literal `{{link}}` in the live chat and knows to fix it.
- **No messages yet for a user** → admin viewer shows "No messages yet" empty state.
- **`stripEmphasis` over-strip**: a URL containing `**` would be mangled. Acceptable tradeoff — links almost never contain `**`.
- **Stage at time of message** is captured from `user.stage` at append time, NOT updated retroactively. A transition that fires later (`updateStage` after `processMessage`) does not rewrite earlier message stage fields. Correct: each message's `stage` field reflects the stage when the turn started.

## Testing

`upsc-bot/src/test-local.js` extended with:

- **Test 11: Messages CRUD** — append a message to a `__test_user_<ts>` doc, read it back, assert role/text/stage/source fields, clean up the test user + subcollection.
- **Test 12: Links loader** — write a `__test_link_<ts>` link doc, call `getAllLinks()`, assert the map contains the key/value, clean up.
- **Test 13: expandLinks substitution** — pure-function test using a fixture: `expandLinks('Click {{link}} or {{list1_link}}', { link: 'A', list1_link: 'B' })` → `'Click A or B'`.
- **Test 14: stripEmphasis** — `stripEmphasis('Hello **bold** and *italic* text')` → `'Hello bold and italic text'`. Edge cases: nested asterisks, unmatched `*`, asterisks inside URLs.

No new test framework. Same `node src/test-local.js` style.

Admin pages are not unit-tested today (`/courses`, `/users`, etc. all rely on manual smoke-testing); the new pages follow the same convention. Boot smoke-test for the admin: `cd upsc-admin && npm run dev` on port 3001, login, click through `/users → user → chat`, `/links`.

## Cost

| Op | Firestore writes/turn | Firestore reads/turn |
|---|---|---|
| Existing | 1-2 (user lastSeen + optional stage) | ~5 (user, courses) |
| Added by this work | +2 (user msg + bot msg) | +1 (links collection) |
| Worst-case turn | ~4 writes | ~6 reads |

At sustained 1 turn/sec: ~14.4K writes/hour — within paid tier (~50K-100K writes/day common). Realistic operator volume is 100-500 turns/day. Not a concern.

Admin viewer reads: ~100 docs per page load × 50 views/day = 5K reads. Trivial.

## Risks & mitigations

1. **PII in stored messages** — user-typed text gets stored as-is in Firestore. If a user pastes phone numbers, addresses, or screenshot descriptions, it lives in the DB. Acceptable for an internal admin tool gated by service-account creds + NextAuth login. To flag in CLAUDE.md Known limitations after rollout.
2. **Polite tone divergence from real operator** — `kr` → `kariye` shifts the bot above the source transcript register. Some customers expect casual hustle-tone. If conversion drops post-rollout, the prompts/examples/templates can be reverted in one commit.
3. **Links collection empty on day one** — bootstrap seed inserts placeholder URLs (`https://example.com/FILL_ME`) so the admin sees rows to edit instead of blank state. Operator MUST replace placeholders before going live or customers receive the literal `https://example.com/FILL_ME` URL.
4. **Unbounded message growth** — no TTL on messages subcollection. A chatty user could accumulate thousands of docs. Pagination prevents UI hangs; storage cost is negligible (~250 bytes × 10K msgs = 2.5MB per user). Out of scope to add retention here.
5. **No edit / delete on messages** — append-only by design. GDPR-style deletion requires manual Firestore console.
6. **Existing 3 orphan course docs** (`prelims-2026`, `mains-answer-writing`, `current-affairs-monthly`) from before the 2026-06-08 catalog replacement — still in Firestore, still appear in the `interested` stage catalog. Unrelated to this work but worth removing via Firebase console before chat persistence makes their presence more user-visible.
7. **No test for the integration path** in `conversation.js` (FAQ → swap → expand → strip → append). Each step is unit-tested; the chain wiring is verified by boot smoke. If a regression slips, the admin chat viewer makes it immediately visible (operator sees the bad output in the chat thread).

## Open items deferred to implementation

- Pin the exact `stripEmphasis` regex pair. Proposed default: `/\*\*([^*]+)\*\*/g → '$1'` then `/(?<!\*)\*([^*]+)\*(?!\*)/g → '$1'`. Lookbehind/lookahead avoid eating asterisks adjacent to other asterisks. Confirm Node.js version supports lookbehind (it does on Node 10+; the project is on a modern Node).
- Pin the bubble layout decision: user-left/bot-right vs both-left-with-color-coded-borders. Defer to the implementer matching the existing dark-theme palette in `PaymentCard.js`.
- Confirm whether the buggy `message.js:78-82` block should be deleted entirely or just the overwrite portion. Proposed: delete entirely (the block adds no value with the new no-name-asking persona).
- Confirm log prefix for the new `messages` and `links` modules. Proposed: `[messages]` and `[links]` to match the existing per-module prefix convention.
