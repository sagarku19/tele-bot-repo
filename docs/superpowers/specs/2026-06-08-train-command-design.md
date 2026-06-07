# `/train` Command + Training Substrate — Design

**Date:** 2026-06-08
**Owner:** sagarkushwaha5599@gmail.com
**Status:** Design approved by user, pending implementation plan

## Problem

The UPSC Bot's persona, course catalog, pricing, payment flow, and conversation style today are all hardcoded in different files:

- Persona / tone lives in `upsc-bot/src/ai/prompts.js` (currently "Helper" speaking strict polite "aap" in 2-3 line replies — not how the real operator chats).
- Course catalog and prices live in `upsc-bot/config/courses.config.js` (3 placeholder courses — `prelims-2026`, `mains-answer-writing`, `current-affairs-monthly`). The real business sells a much larger catalog of faculty-specific lectures and combos with negotiable pricing.
- Payment scripts (gift-card-only notice, payment-mode menu, per-app payment links, payment-proof reference, post-payment access link) don't exist at all — the operator sends them verbatim from memory in real chats.
- Stage transitions in `upsc-bot/src/flows/conversation.js` rely on a small hardcoded keyword list that misses combo / optional / discount / old-member / gpay phrasing.
- The seeder `upsc-bot/src/db/courses.js → seedCoursesFromConfig` is **insert-if-not-exists only**, so price/description edits never propagate to Firestore even after editing the config file.

The owner has real chat transcripts (admin selling courses to students) and wants the bot to mimic that voice. They want a `/train` slash command that ingests new transcripts on demand and updates everything — style, catalog, templates, FAQ — with a per-group human approval gate.

## Goals

1. Build a `/train` slash command at `.claude/commands/train.md` that ingests chat transcripts (pasted as argument or dropped as files) and proposes file-level diffs.
2. Stand up a `upsc-bot/training/` directory as the source of truth for learned behavior: corpus, few-shot example pool, canned templates, FAQ pairs.
3. Refactor the bot's runtime so `prompts.js` injects relevant few-shot examples and so `flows/conversation.js` can send `templates.json` entries verbatim and short-circuit FAQ matches.
4. Extend `courses.config.js` schema to support combos, faculty-based lectures, demo links, and negotiable pricing tiers.
5. Bootstrap the substrate today by running `/train` against the user's pasted transcripts — rewriting persona to **"UPSC Helping Hand (Aspirant)"** in the operator's actual register (fragmented short replies, "bhai" / "ap" / "aap" / "yaar" mixed, no forced "always end with a question" rule), importing the real catalog, and extracting the gift-card payment script.
6. Upgrade `seedCoursesFromConfig` to upsert with `merge: true`, and add a `/reload_courses` Telegram admin command so price edits land without a full bot restart.

## Non-goals

- Automated payment verification (gift-card OCR, Phonepe/Paytm lookup). Still manual via admin panel + `/verify_<id>`.
- Multi-operator / multi-persona training. One operator voice.
- Real-time learning from live customer chats. Training is operator-initiated on curated transcripts only.
- Admin panel UI for browsing training artifacts. JSON files + git diff is the review surface.
- Migrating off the gift-card payment model.
- Multilingual support beyond Hinglish/English.
- Fixing the pre-existing CLAUDE.md "Known limitation" that bot tokens leak in `payments.screenshotUrl`.

## Architecture

### New directory: `upsc-bot/training/`

| File | Purpose | Updated by |
|---|---|---|
| `transcripts/YYYY-MM-DD-HHmm-<slug>.txt` | Raw chat dumps, append-only corpus (redacted) | `/train` (archives every paste) |
| `transcripts/.processed` | Newline-delimited list of ingested filenames | `/train` |
| `examples.json` | Few-shot pool — array of `{stage, user, reply, tags, addedAt}` exchanges | `/train` |
| `templates.json` | Canned scripts keyed by intent (`gift_card_notice`, `payment_mode_menu`, `payment_proof`, `payment_link_phonepe`, `payment_link_paytm`, `payment_link_gpay`, `combo_pitch_1499`, `combo_pitch_999`, `post_payment_access`, `lifetime_updates`) | `/train` |
| `faq.json` | Quick-reply pairs keyed by canonical user-question pattern | `/train` |
| `payment-links.json` | Live payment URLs as `{key: url}` (gitignored or kept in repo per user preference — confirm during implementation) | manual |

### Runtime changes in the bot

**`upsc-bot/src/ai/prompts.js`**
- `STAGE_PROMPTS` rewritten in the operator's actual register: persona = **"UPSC Helping Hand (Aspirant)"**, short fragmented replies (1-3 words common), freely uses "bhai" / "ap" / "aap" / "yaar", drops the strict "always end with one question" rule, allows the model to emit `{{TEMPLATE:<key>}}` markers and `{{FAQ:<key>}}` markers that the runtime swaps for verbatim entries.
- `buildConversationPrompt(stage, user, messageText, courseCatalog, examples, templates)` gains two new injections:
  - Top-3 relevant `examples.json` entries for the current stage rendered as a "Past real conversations" few-shot section.
  - List of available template keys (`gift_card_notice`, `payment_mode_menu`, …) the model can request via the `{{TEMPLATE:<key>}}` marker.

**`upsc-bot/src/flows/conversation.js`**
- Adds a `faq.json` short-circuit at the top of `processMessage` — if the user message matches a known FAQ pattern with high confidence, reply from FAQ directly without a Claude call.
- Adds `sendTemplate(ctx, key, vars)` helper that pulls from `templates.json` and substitutes `{{var}}` placeholders.
- After Claude returns a reply, scan for `{{TEMPLATE:<key>}}` markers and replace each with the verbatim template body before sending.
- Stage keyword list extended: `combo`, `optional`, `discount`, `old member`, `gpay`, `phonepe`, `paytm`.

**`upsc-bot/config/courses.config.js`**
- Schema extended with optional fields: `kind` (`combo` | `lecture` | `optional`), `faculty`, `subject`, `demoLink`, and `pricing: {list, floor, oldMember}` for negotiable items. Legacy flat `price` still accepted.
- Bootstrap replaces the 3 placeholder courses with the real catalog: `combo-all-1499`, `combo-list2-999`, `karandeep-anthropology` (650), `mrunal-economy` (250), `peeyush-ethics` (250), `peeyush-ethics-essay` (400), `atish-mathur-gs2` (300), `smriti-shah-society` (300). Telegram chat IDs left as placeholders for the user to fill before going live.

**`upsc-bot/src/db/courses.js`**
- `seedCoursesFromConfig` upgraded from insert-only to upsert with `{ merge: true }`. Existing `prelims-2026` / `mains-answer-writing` / `current-affairs-monthly` Firestore docs are left alone (new slugs coexist); user can delete them from Firebase console at leisure.

**`upsc-bot/src/handlers/admin.js`**
- New `/reload_courses` Telegram admin command (gated by `isAdmin`) that calls `seedCoursesFromConfig()` in place and reports `<N> upserted`.

**`upsc-bot/src/handlers/start.js`**
- `/start` welcome rewritten in the new short operator register. No more "main Priya hoon" or "main Helper hoon". Just a casual "Hii / Hi bhai" matching the transcripts.

**`upsc-admin/components/UserTable.js`**
- No changes — `negotiation` is handled inline within the `interested` stage rather than as a new stage (avoids the 6-file checklist).

**`CLAUDE.md`**
- New section documenting `training/` directory, `/train` command, `/reload_courses`, the new course schema fields, the few-shot injection, and the `{{TEMPLATE:<key>}}` / `{{FAQ:<key>}}` markers.

### No database schema changes

Firestore `users` / `courses` / `payments` collections unchanged. Training data is file-based and committed to git.

## `/train` Pipeline

Six stages, all driven from `.claude/commands/train.md` (a Claude Code slash command, human in the loop):

**Stage 1 — Ingest**
- If `$ARGUMENTS` is non-empty: write verbatim to `training/transcripts/YYYY-MM-DD-HHmm-paste.txt`.
- Else: glob `training/transcripts/*.txt`, diff against `.processed`, pick up only new files.
- Hard-fail if nothing new found.

**Stage 2 — Parse & redact**
- Normalize into a turn list `[{speaker: "user"|"operator", name, text}]` by parsing the `> Name:` blocks via regex.
- Redact: Telegram invite links (`t.me/+...` and `t.me/c/...`), gift-card codes (alphanum-with-dashes patterns like `QTNG-T8TY3C-AEFA`), 10-digit phone numbers, email addresses. Replace with `<INVITE_LINK>`, `<GIFT_CODE>`, `<PHONE>`, `<EMAIL>`.
- The archived `transcripts/*.txt` is the redacted version. Raw text stays in memory for extraction only.

**Stage 3 — Extract candidates (4 buckets, one Claude call each)**
- **Style examples** → 5-10 operator turns per stage with 1-2 turns of preceding user context. Tagged with stage and `addedAt: 2026-06-08`.
- **Course/price candidates** → `{slug, name, faculty, subject, price, demoLink, mentions: [transcript-quotes]}`. Slug derived deterministically from faculty + subject.
- **Template candidates** → repeated multi-line operator messages keyed by intent.
- **FAQ candidates** → user-question → operator-reply pairs where the question is a short repeated pattern.

**Stage 4 — Diff against current state (and collision check)**
- Load current `examples.json`, `templates.json`, `faq.json`, `courses.config.js` from disk.
- Load current Firestore `courses` collection via `firebase-admin` (same env as bot).
- For each course candidate: match by slug → if file has it, compare prices/description; if Firestore has a doc with a different ID but matching name (fuzzy), flag as **collision** with an explicit per-row prompt.
- For each template/FAQ candidate: hash-compare to existing entries.
- For each style example: skip near-duplicates against `examples.json` (normalized-string compare).
- Warn if a new candidate contradicts an existing one (different price for same course, different reply to same FAQ).

**Stage 5 — Per-group review**
- Print 4 sections (Style / Courses / Templates / FAQ) with proposed diffs and rationale.
- Each course collision: `"Firestore has doc <id> name='X' price=4999. Transcript suggests price=1499. (o)verwrite / (k)eep firestore / (s)kip"`.
- User answers y/n per group via inline conversation responses.

**Stage 6 — Apply & commit**
- Approved style examples → append to `examples.json`.
- Approved templates/FAQ → upsert in `templates.json` / `faq.json`.
- Approved courses → rewrite `courses.config.js` using a deterministic formatter for clean diffs.
- Mark transcript filenames in `.processed`.
- Single `git commit` per run: `train: ingest <N> transcripts (<M> courses, <K> examples, <T> templates, <F> faqs)`.
- Final message: `Done. Run /reload_courses in Telegram or restart bot to apply course changes.`

## Bootstrap (one-time first run during this build)

**Created**
- `upsc-bot/training/transcripts/2026-06-08-bootstrap.txt` (redacted paste).
- `upsc-bot/training/transcripts/.processed`.
- `upsc-bot/training/examples.json` — ~12-15 cherry-picked exchanges across stages including a `negotiation`-flavored one (2500 → 2000 for old member).
- `upsc-bot/training/templates.json` — `gift_card_notice`, `payment_mode_menu`, `payment_proof`, `payment_link_phonepe`, `payment_link_paytm`, `payment_link_gpay`, `combo_pitch_1499`, `combo_pitch_999`, `post_payment_access`, `lifetime_updates`. Payment URLs as `{{link}}` placeholders.
- `upsc-bot/training/faq.json` — `lifetime access`, `gpay chalega`, `demo class`, `updates kab tak`.
- `.claude/commands/train.md`.

**Modified**
- `upsc-bot/src/ai/prompts.js` (persona + register + few-shot + template marker support).
- `upsc-bot/src/flows/conversation.js` (FAQ short-circuit + sendTemplate + marker replacement + extended keywords).
- `upsc-bot/config/courses.config.js` (extended schema + real catalog).
- `upsc-bot/src/db/courses.js` (upsert with merge).
- `upsc-bot/src/handlers/admin.js` (`/reload_courses`).
- `upsc-bot/src/handlers/start.js` (new register).
- `CLAUDE.md` (training section).

**Deliberately not touched**
- Firestore data (user reloads / restarts when ready).
- Real Telegram chat IDs and live payment URLs (sensitive, rotating — user fills after review).
- Admin panel UI.
- `flows/payment.js` and `flows/access.js`.

## Testing

`upsc-bot/src/test-local.js` extended with new cases:
- `examples.json` schema validity (required fields, valid stage values).
- `templates.json` placeholder substitution (`{{var}}` swap).
- FAQ short-circuit hits on canonical and near-miss queries.
- Seeder upsert behavior (write → modify config → re-seed → assert Firestore reflects the change).
- `{{TEMPLATE:<key>}}` marker replacement in a reply string.

No new test framework. Same `node src/test-local.js` style. Telegram/Claude not required for any of these.

## Risks & mitigations

1. **PII / payment-data leakage into git.** Heuristic redaction in Stage 2 catches the obvious patterns; user reviews each commit. The archived transcript is the redacted version.
2. **Payment-link rot.** URLs stored as `{{link}}` placeholders with `payment-links.json` sibling so they rotate without retraining.
3. **Few-shot pool drift.** Examples tagged with `addedAt`; ranker weights recent ones higher. `/train` warns on contradicting candidates.
4. **Collision with admin-panel-created Firestore courses.** Stage 4 explicit per-row prompt on fuzzy name match across different doc IDs.
5. **No automated tests for prompt quality.** Bot's voice is only verifiable by reading actual replies. Mitigation is the human-in-the-loop `/train` review gate and operator periodically checking live chats.

## Open items deferred to implementation

- Confirm whether `payment-links.json` should be gitignored or committed (sensitive vs. convenient).
- Confirm relevance scoring for few-shot example selection (simple stage-tag match, or richer embedding-based).
- Confirm whether the existing 3 placeholder Firestore course docs should be auto-deleted by bootstrap, or left for manual cleanup (current default: leave them).
- Pin concrete algorithm for **FAQ short-circuit "high confidence" match** — proposed default: case-insensitive substring match against canonical FAQ key after stripping punctuation; fall through to Claude on no match.
- Pin concrete algorithm for **example near-duplicate dedup** — proposed default: normalized-string equality (lowercase + collapse whitespace) on the operator's reply text.
- Pin concrete algorithm for **course-collision fuzzy match** — proposed default: case-insensitive Levenshtein distance ≤ 3 on normalized `name` field across all Firestore course docs.
