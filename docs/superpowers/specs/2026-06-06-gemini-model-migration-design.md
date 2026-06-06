# Gemini Model Migration: 1.5-flash → 2.5-flash

**Date:** 2026-06-06
**Author:** brainstormed with Claude
**Status:** Approved for implementation

## Problem

The bot calls `gemini-1.5-flash` in `upsc-bot/src/ai/gemini.js:23`. As of the v1beta endpoint's current state, Google has retired the Gemini 1.5 family — direct API probe confirms:

```
"models/gemini-1.5-flash is not found for API version v1beta"  → 404 NOT_FOUND
"models/gemini-1.5-pro-latest is not found for API version v1beta"  → 404 NOT_FOUND
```

Every Gemini call from the bot is therefore failing in production. The failures are masked by the defensive `try/catch` at `ai/gemini.js:77` and `ai/gemini.js:144`, which return a hard-coded Hinglish fallback message. From the outside the bot looks alive, but:

- The conversation brain is dead — no AI-driven replies, no stage transitions.
- `payment_pending` stage selection never fires (the `[SELECTED_COURSE:<id>]` tag is never emitted).
- Payment screenshot verification (`verifyPaymentScreenshot`) always returns the default `isValid: false`, sending every payment to the manual-verify queue.

This is a P0 outage that has been hiding behind the fallback.

## Goal

Restore Gemini functionality with the smallest safe change, and avoid introducing a cost regression in the process.

## Non-goals

- Migrate from the deprecated `@google/generative-ai` SDK to `@google/genai`. (Deferred — separate spec.)
- Add a multi-model fallback chain for 503 / UNAVAILABLE responses. (Deferred — separate spec.)
- Extract the model name to an environment variable. (Deferred — YAGNI for a one-shot fix.)
- Change the lazy singleton, the chat-history sliding window, the error-handler fallback message, or any caller of `chat()` / `verifyPaymentScreenshot()`.

## Approach

Direct probe against the user's API key showed `gemini-2.5-flash` works on the free tier (`gemini-2.5-pro` is quota=0 on free tier — not an option). The migration is a model-string swap plus one configuration knob to neutralise a known cost trap.

### The cost trap

`gemini-2.5-flash` enables "thinking" tokens by default. The user's manual probe of `gemini-2.5-flash` with an 8-token prompt produced:

```
promptTokenCount: 8
candidatesTokenCount: 10
thoughtsTokenCount: 1360   ← billed, not visible in response
totalTokenCount: 1378
```

For a conversational bot replying in 3–5 Hinglish lines, 1,360 thinking tokens per turn is pure waste — slower replies and ~100× more billed tokens than `gemini-1.5-flash` was consuming. Mitigation: disable thinking via `generationConfig.thinkingConfig.thinkingBudget = 0`.

## Changes

### `upsc-bot/src/ai/gemini.js`

Update the lazy singleton initialiser in `initGemini()` (around line 22–24):

```js
model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    thinkingConfig: { thinkingBudget: 0 },
  },
});
console.log('[Gemini] Initialized with gemini-2.5-flash (thinking disabled)');
```

Both `chat()` and `verifyPaymentScreenshot()` consume the same `getModel()` result, so they pick up the swap and the no-thinking config automatically. No other code changes in this file.

### `CLAUDE.md` (root)

Two references to update for accuracy of the project bible:

1. Tech-stack line under **Project overview** → **Tech stack:** — `(Gemini 1.5 Flash)` → `(Gemini 2.5 Flash, thinking disabled)`.
2. Boot log block under **How to run locally** → **Expected bot boot logs** — `[Gemini] Initialized with gemini-1.5-flash` → `[Gemini] Initialized with gemini-2.5-flash (thinking disabled)`.

No other doc changes.

## Pre-flight (out of band, owner's responsibility)

The user posted the active `GEMINI_API_KEY` (`AQ.Ab8R…vwlXWGvA`) in chat while debugging. Before deploying the fix:

1. Revoke the leaked key in Google AI Studio → API keys.
2. Generate a fresh key.
3. Replace `GEMINI_API_KEY` in `upsc-bot/.env`.
4. Restart the bot.

This is not a code change in this spec, but the spec is only safely deployable after the rotation.

## Test plan

1. **Smoke test:** `cd upsc-bot && npm run test`. The existing `src/test-local.js` exercises `chat()` against the live Gemini API. Pass = the swap works; fail = either the new key isn't set or the SDK rejected the config shape.
2. **Conversation round-trip:** start the bot (`npm run dev`), send `/start` then a follow-up message. Confirm the reply is a real Gemini response (look for `[Gemini] Chat reply (...)` in console), not the Hinglish error fallback (`[Gemini] Chat error`).
3. **Stage transition:** message the bot keywords like "course" / "kitna paisa" until the catalog is presented, then accept one. Confirm the `[conversation] Course selected: <id>` log fires — that proves the `[SELECTED_COURSE:<id>]` tag is being emitted again.
4. **(Optional) Vision:** in `payment_pending`, send a screenshot. Confirm `[Gemini] Payment verification result: {...}` log shows real fields, not the `Verification could not be completed` default.
5. **Cost check:** in the test run, inspect `usageMetadata.thoughtsTokenCount`. Expected value: `0` (thinking disabled). If non-zero, the `thinkingConfig` shape was not accepted by SDK 0.24 and we need to either upgrade the SDK or pass the config differently.

## Risk and rollback

- Blast radius: a single file. `git revert` (or hand-edit back) restores prior behaviour instantly.
- Failure mode if `thinkingConfig` isn't supported by SDK 0.24: the SDK will likely ignore unknown keys silently. The cost-check step (test #5 above) catches this. Mitigation if it isn't honoured: upgrade `@google/generative-ai` to the latest 0.x, or fall back to plain model-string swap and accept the cost regression for now.
- No data migration, no schema change, no admin-side change.

## Follow-ups (not in this spec)

- Replace defensive fallbacks with a richer error path that surfaces "model is down" vs "hit token budget" vs "real bug" — the current swallow-and-respond hides outages.
- Migrate to `@google/genai` SDK when the team has bandwidth.
- Make the model name a `.env` value (`GEMINI_MODEL=gemini-2.5-flash`) so the next deprecation is a config flip, not a code change.
