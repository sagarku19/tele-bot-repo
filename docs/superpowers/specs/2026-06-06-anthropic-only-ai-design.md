# Anthropic-only AI migration — design

**Date:** 2026-06-06
**Author:** brainstorming session (Claude Code)
**Status:** Approved, ready for implementation plan

## 1. Goal

Replace the upsc-bot's dual AI integration (Gemini + xAI) with a single Anthropic Claude integration. Vision/payment-screenshot verification stays manual — no AI verify in the payment flow. The bot's conversational persona ("Priya"), stage flow, Telegram handlers, Firestore schema (apart from one field), admin auth, and course catalog all remain unchanged.

## 2. Non-goals

- Persisting conversation history to Firestore or Redis.
- Wiring the admin "Verify & Grant Access" button to actually grant access.
- Re-introducing auto-vision payment verification.
- Adding any AI provider abstraction or multi-provider support — Claude is the only provider.
- Touching unrelated parts of the bot or admin (broadcast, courses, dashboards).

## 3. Decisions made during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| AI layer shape | **Flatten to single `src/ai/claude.js`** | One provider, no facade needed. Delete `src/ai/providers/` entirely. Re-add abstraction later if a second provider ever returns. |
| `payments.geminiAnalysis` field | **Drop field + remove admin UI block** | Field has always been `null` in the active manual-review flow. Cleanest schema state. |
| SDK choice | **Official `@anthropic-ai/sdk`** | Cleaner code, typed errors, first-class prompt caching support for the long Hinglish system prompt. |
| Default model | **`claude-haiku-4-5`** | Fast and cheap; plenty for 3–5 line Hinglish replies with one follow-up question. Overridable via `ANTHROPIC_MODEL`. |
| Payment vision | **Stays manual** | No `verifyPaymentScreenshot()` in the new module. Admin reviews screenshots in the dashboard as today. |

## 4. New AI module — `src/ai/claude.js`

Single flat module under `src/ai/`. No `providers/` folder.

### Resulting `src/ai/` layout

```
src/ai/
├── claude.js       # new
├── prompts.js      # unchanged (minus PAYMENT_VERIFICATION_PROMPT export)
└── constants.js    # unchanged
```

### Exported surface

- `init()` — lazy and idempotent. Reads `ANTHROPIC_API_KEY`, constructs the `Anthropic` SDK client once.
- `chat(systemPrompt, conversationHistory, newMessage) → Promise<string>` — same signature as the old provider contract so `flows/conversation.js` and `simulate-conversation.js` only need an import path swap.

### Implementation details

- Dependency: `@anthropic-ai/sdk` (added to `upsc-bot/package.json`).
- Model: `process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'`.
- Conversation slicing: last 10 turns of `conversationHistory` (matches today's Gemini/xAI behavior).
- Role mapping: internal `{ role: 'model'|'user', text }` → Anthropic `{ role: 'assistant'|'user', content }`.
- System prompt: passed as Anthropic's top-level `system` param **as a content block with `cache_control: { type: 'ephemeral' }`** so the long Hinglish persona prompt is cached across turns.
- `max_tokens`: `1024` (covers the longest "paid" stage tutor reply with headroom).
- Logging: `[claude] Initialized with <model>` on init; `[claude] Chat reply (<n> chars) for: "<first 40 chars>..."` on each call. Errors: `[claude] error: <msg>`.
- Defensive `try/catch`: on any failure return `CHAT_FALLBACK_REPLY` from `../constants.js` (same pattern as today).

### Not implemented

- `verifyPaymentScreenshot()` — payment verification is manual; no caller exists after this change.

## 5. Files to delete

- `upsc-bot/src/ai/providers/index.js`
- `upsc-bot/src/ai/providers/gemini.js`
- `upsc-bot/src/ai/providers/xai.js`
- The empty `upsc-bot/src/ai/providers/` directory.

`upsc-bot/test-anthropic-key.js` (already Anthropic) is **kept as-is**.

## 6. Files to update

| File | Change |
|---|---|
| `upsc-bot/src/index.js` | Replace `import { initProviders } from './ai/providers/index.js'` with `import { init as initClaude } from './ai/claude.js'`. Replace `initProviders()` boot call with `initClaude()`. Update env-var check loop: remove `GEMINI_API_KEY`, add `ANTHROPIC_API_KEY` (hard-fail if missing). Remove any active-provider log line. |
| `upsc-bot/src/flows/conversation.js` | Change `import { chat } from '../ai/providers/index.js'` → `from '../ai/claude.js'`. No logic changes. |
| `upsc-bot/src/flows/payment.js` | Drop `geminiAnalysis: null` from the `savePayment(...)` call. Update the dormant-vision comment block to reflect that vision is fully removed. |
| `upsc-bot/src/db/payments.js` | Remove `geminiAnalysis` from the document body written by `savePayment`. |
| `upsc-bot/src/test-local.js` | Drop Gemini and xAI test blocks. Add one Claude round-trip block (system prompt + "say hello" → expect non-empty string). Drop env-var checks for `GEMINI_API_KEY` / `XAI_API_KEY` / `AI_PROVIDER`; add `ANTHROPIC_API_KEY`. |
| `upsc-bot/src/simulate-conversation.js` | This file is already broken — it imports `./ai/gemini.js`, a path that hasn't existed since the providers refactor. **Delete it.** The `simulator.js` browser UI is the supported dev tool. |
| `upsc-bot/src/simulator.js` | No AI imports today, but verify after the migration that the `/sim` browser UI still works end-to-end (it calls `processMessage()`, which goes through `claude.js` after the swap). No code change expected. |
| `upsc-bot/src/ai/prompts.js` | Remove the `PAYMENT_VERIFICATION_PROMPT` export — it has no caller after this change. `STAGE_PROMPTS` and `buildConversationPrompt` are untouched. |
| `upsc-bot/.env.example` | Remove `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `XAI_API_KEY`, `XAI_MODEL`. Add `ANTHROPIC_API_KEY=` (required) and `ANTHROPIC_MODEL=claude-haiku-4-5` (optional, with comment that default is haiku). |
| `upsc-bot/package.json` | Remove `@google/generative-ai` from `dependencies`. Add `@anthropic-ai/sdk`. |
| `upsc-bot/README.md` | Replace Gemini/xAI sections with Anthropic. Update env-var table. Update expected boot logs. Remove references to `AI_PROVIDER` switching and to the dormant vision capability. |
| `CLAUDE.md` (repo root) | Update tech-stack line (drop `@google/generative-ai`, add `@anthropic-ai/sdk`). Update the AI-Prompts agent role description (single provider). Update env-vars section. Update expected boot-log block. Update "Known limitations" wording where it mentions Gemini-token leakage and provider routing. |
| `upsc-admin/components/PaymentCard.js` | Remove the JSX block that renders `payment.geminiAnalysis`. Other fields (screenshot, status, verify/reject buttons) stay. |

## 7. Env-var migration

**Remove from `.env` / `.env.example`:**

- `AI_PROVIDER`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `XAI_API_KEY`
- `XAI_MODEL`

**Add:**

- `ANTHROPIC_API_KEY` — required. Hard-fail on boot if missing.
- `ANTHROPIC_MODEL` — optional. Defaults to `claude-haiku-4-5`.

**Final boot-time required vars:** `BOT_TOKEN`, `ANTHROPIC_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `ADMIN_TELEGRAM_ID`.

The user adds `ANTHROPIC_API_KEY=…` to `upsc-bot/.env` themselves before next boot. The implementation must not touch `.env` files directly.

## 8. Firestore schema impact

- `payments.geminiAnalysis` is no longer written. Historical documents that have it set are read-tolerated (admin UI no longer renders it; bot never reads it). No backfill or cleanup required.
- All other fields on `users`, `courses`, and `payments` unchanged.

## 9. Testing

### Automated

- `cd upsc-bot && npm run test` — must pass.
  - Env-var check passes with `ANTHROPIC_API_KEY` set, no `GEMINI_API_KEY` required.
  - Courses round-trip passes.
  - Firestore round-trip passes.
  - New Claude round-trip block: builds the active-provider chat call with a tiny system prompt + "say hello", asserts a non-empty string reply.
  - Helpers test passes.

### Manual

- Start the bot — expect this boot-log shape:

  ```
  [boot] ✅ Firebase ready
  [claude] Initialized with claude-haiku-4-5
  [courses] Seeding complete — X new, Y already existed
  [boot] ✅ All handlers registered (admin → start → photo → text)
  [boot] 🤖 Bot running on port 3000
  ```

- With `ENABLE_SIMULATOR=true`, walk one user through `new → engaged → interested` in the `/sim` UI. Confirm chat replies render and the sidebar still updates stage + selectedCourseId.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing payment docs have non-null `geminiAnalysis` and the admin UI block is removed. | The block goes away cleanly — historical docs simply don't render that section. No data loss. |
| Cost shift from Gemini 2.5 Flash to Haiku 4.5. | Prompt caching on the long system prompt cuts repeat-turn input cost ~90%. For current bot volume, end-to-end impact is negligible. |
| No fallback provider — Anthropic outage means every chat call falls back to the canned `CHAT_FALLBACK_REPLY`. | Not a regression — today each request already hits one provider. If outage tolerance matters, that's a follow-up project (add provider abstraction back, but with a real failover policy). |
| `ANTHROPIC_API_KEY` not added to `.env` before boot. | Hard-fail at startup with a clear error message — same pattern as today's `BOT_TOKEN` check. |
| Leaked API key (one was visible in the source IDE selection during brainstorming). | User to rotate the key in the Anthropic Console before pushing any code. Documented here so it isn't forgotten. |

## 11. Implementation order (for the planning step)

1. Add `@anthropic-ai/sdk` to `upsc-bot/package.json`, remove `@google/generative-ai`. Run `npm install`.
2. Write `upsc-bot/src/ai/claude.js`.
3. Update `flows/conversation.js`, `flows/payment.js`, `db/payments.js`, `src/index.js`, `src/test-local.js`. Delete the broken `src/simulate-conversation.js`.
4. Trim `src/ai/prompts.js` (drop `PAYMENT_VERIFICATION_PROMPT`).
5. Delete `src/ai/providers/` directory.
6. Update `.env.example`, `README.md`, root `CLAUDE.md`.
7. Update `upsc-admin/components/PaymentCard.js`.
8. Run `npm run test` in `upsc-bot/`. Manual boot smoke-check. Simulator walkthrough.

Handed off to the writing-plans skill next.
