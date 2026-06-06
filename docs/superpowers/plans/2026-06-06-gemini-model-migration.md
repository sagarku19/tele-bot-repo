# Gemini Model Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Gemini functionality by replacing the retired `gemini-1.5-flash` model with `gemini-2.5-flash`, with "thinking" tokens disabled to avoid a cost regression.

**Architecture:** Single-file code change in `upsc-bot/src/ai/gemini.js` (the lazy singleton's `getGenerativeModel(...)` call) plus two text updates in the root `CLAUDE.md`. The bot's lazy-singleton pattern means both `chat()` and `verifyPaymentScreenshot()` automatically pick up the new model — no other call sites change.

**Tech Stack:** Node.js (ESM), `@google/generative-ai@^0.24.0` SDK, Gemini 2.5 Flash, PowerShell on Windows.

**Spec:** `docs/superpowers/specs/2026-06-06-gemini-model-migration-design.md`

---

## Prerequisites (manual, owner-only)

These are **not** plan tasks — the user does them out of band before any code change is deployable:

1. Revoke the leaked API key `AQ.Ab8R…vwlXWGvA` in Google AI Studio → API keys.
2. Generate a fresh key in Google AI Studio.
3. Replace `GEMINI_API_KEY` in `upsc-bot/.env` with the fresh key.

The engineer running this plan can assume these are done. If `npm run test` later fails at Test 1 ("Env vars") or Test 4 ("Gemini AI Connection"), check this first.

## TDD note

This plan covers a single SDK config swap. There is no new feature to test-drive — the existing `upsc-bot/src/test-local.js` Test 4 already exercises `chat()` end-to-end against the live Gemini API. We use that as the regression gate. The one piece that the existing test does **not** verify (whether `thoughtsTokenCount` is actually 0) requires inspecting the raw `usageMetadata`, so Task 1 includes a temporary `console.log` to surface it during a single manual verification, then removes the log before completion.

## Git note

`CLAUDE.md` confirms `Is a git repository: false` for this project. **Skip all "Commit" steps**. If the user later initialises a git repo, replay the diff as a single commit.

---

## File Structure

- **Modify** `upsc-bot/src/ai/gemini.js` (single edit zone, lines 22–24)
- **Modify** `CLAUDE.md` (two lines: tech-stack bullet and expected-boot-logs block)

No new files. No file moves. No file deletes.

---

## Task 1: Swap to gemini-2.5-flash with thinking disabled

**Files:**
- Modify: `upsc-bot/src/ai/gemini.js:21-27`
- Test: `upsc-bot/src/test-local.js` (existing; **do not modify**, only run)

### Step 1: Confirm starting state

- [ ] Open `upsc-bot/src/ai/gemini.js` and confirm the current `initGemini()` body matches this exactly:

```js
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('[Gemini] Initialized with gemini-1.5-flash');
  } catch (err) {
    console.error('[Gemini] Initialization failed:', err.message);
  }
```

If the file does not match, stop — the spec was written against this exact state and the diff may be wrong. Reconcile before continuing.

### Step 2: Run the existing test suite to establish baseline failure

- [ ] In PowerShell:

```powershell
cd upsc-bot; npm run test
```

Expected: **Test 4 (Gemini AI Connection) FAILS** with a 404 / "model not found" error in the Gemini API response — this confirms the bug the spec describes. Tests 1, 2, 3, 5 should pass. If Test 4 *passes* instead, something else has already changed; stop and re-read the spec.

### Step 3: Apply the model swap

- [ ] Edit `upsc-bot/src/ai/gemini.js`. Replace the two lines inside the `try` block:

Old:
```js
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('[Gemini] Initialized with gemini-1.5-flash');
```

New:
```js
    model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    console.log('[Gemini] Initialized with gemini-2.5-flash (thinking disabled)');
```

No other lines in `gemini.js` change at this step.

### Step 4: Add a temporary usage-metadata log

This is a one-time probe to verify `thinkingBudget: 0` was honoured by the SDK. It will be removed in Step 7.

- [ ] In `upsc-bot/src/ai/gemini.js`, locate the `chat()` function and find this block (~lines 71–75 after Step 3):

Old:
```js
    // Send the new message
    const result = await chatSession.sendMessage(newMessage);
    const reply = result.response.text();

    console.log(`[Gemini] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`);
```

New (one extra line added):
```js
    // Send the new message
    const result = await chatSession.sendMessage(newMessage);
    const reply = result.response.text();

    console.log(`[Gemini] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`);
    console.log('[Gemini] usageMetadata:', JSON.stringify(result.response.usageMetadata));
```

### Step 5: Run the test suite and inspect token usage

- [ ] In PowerShell:

```powershell
cd upsc-bot; npm run test
```

Expected output:
- Test 4 (Gemini AI Connection) now **PASSES** with a reply printed.
- A new line `[Gemini] usageMetadata: {"promptTokenCount":...,"candidatesTokenCount":...,"totalTokenCount":...}` appears.
- In that JSON, `thoughtsTokenCount` is **either absent or equal to 0**. If `thoughtsTokenCount` is present and greater than 0 (e.g. the ~1360 we saw in the spec's reproduction), the SDK silently ignored the `thinkingConfig` — see Step 5a.

### Step 5a: Contingency — SDK did not honour thinkingConfig

Only execute this step if Step 5 showed `thoughtsTokenCount > 0`.

- [ ] In `upsc-bot/src/ai/gemini.js`, revert the `generationConfig.thinkingConfig` shape and try the alternative top-level placement that some SDK 0.x versions accept:

Old (from Step 3):
```js
    model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
```

New:
```js
    model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        thinkingBudget: 0,
      },
    });
```

- [ ] Re-run `cd upsc-bot; npm run test` and re-check `thoughtsTokenCount`. If still > 0, stop and escalate to the user: the SDK 0.24 may not support thinking control and a separate SDK upgrade or downgrade-to-1.x-flash plan is needed. Do **not** proceed to Step 6 in that case — leave the temporary log in place so the user can see the data.

### Step 6: Confirm conversation round-trip in the running bot

- [ ] In PowerShell:

```powershell
cd upsc-bot; npm run dev
```

Expected boot log includes:
```
[Gemini] Initialized with gemini-2.5-flash (thinking disabled)
```

- [ ] Open Telegram, send `/start` to the bot, then send any short message (e.g. "hi I'm Sagar").

Expected:
- Bot replies with a real Hinglish response (not the static "Arre yaar, abhi thoda technical issue aa gaya 😅..." fallback).
- Console log shows `[Gemini] Chat reply (... chars) for: "..."` for the message — proves `chat()` succeeded.
- Console log shows `[Gemini] usageMetadata: {...}` with `thoughtsTokenCount` 0 or absent — confirms cost behaviour in a real interaction, not just the test harness.

- [ ] Stop the bot with `Ctrl+C` in the PowerShell window.

### Step 7: Remove the temporary usage-metadata log

- [ ] In `upsc-bot/src/ai/gemini.js`, remove the line added in Step 4:

Old:
```js
    console.log(`[Gemini] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`);
    console.log('[Gemini] usageMetadata:', JSON.stringify(result.response.usageMetadata));
```

New:
```js
    console.log(`[Gemini] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`);
```

### Step 8: Final regression run

- [ ] In PowerShell:

```powershell
cd upsc-bot; npm run test
```

Expected: all 5 test blocks pass; Test 4 in particular still passes; the `[Gemini] usageMetadata:` log no longer appears (proves the cleanup was complete).

### Step 9: Skip commit

- [ ] No-op. The project is not a git repo (per CLAUDE.md). Move on to Task 2.

---

## Task 2: Update root CLAUDE.md doc references

**Files:**
- Modify: `CLAUDE.md` (root) — two lines: line 10 (tech stack) and line ~183 (expected boot logs)

No test exists for documentation strings, so this task is straightforward edits + visual review.

### Step 1: Update the tech-stack bullet

- [ ] In `CLAUDE.md` find this exact text on line 10:

Old:
```
- **Bot:** Node.js (ESM, `"type": "module"`), Telegraf 4.x, `@google/generative-ai` (Gemini 1.5 Flash), `firebase-admin`, Express (only for `/health`), `axios`, `node-cron` (dependency, not yet used), `dotenv`.
```

New:
```
- **Bot:** Node.js (ESM, `"type": "module"`), Telegraf 4.x, `@google/generative-ai` (Gemini 2.5 Flash, thinking disabled), `firebase-admin`, Express (only for `/health`), `axios`, `node-cron` (dependency, not yet used), `dotenv`.
```

### Step 2: Update the expected boot-logs block

- [ ] In `CLAUDE.md` find this exact line inside the "Expected bot boot logs" fenced code block (around line 183):

Old:
```
[Gemini] Initialized with gemini-1.5-flash
```

New:
```
[Gemini] Initialized with gemini-2.5-flash (thinking disabled)
```

### Step 3: Sanity-check no other stale references remain

- [ ] In PowerShell from project root:

```powershell
Select-String -Path "CLAUDE.md","upsc-bot\src\**\*.js","upsc-bot\config\**\*.js" -Pattern "gemini-1\.5-flash|Gemini 1\.5 Flash" -SimpleMatch
```

Expected: **zero matches**. If anything still matches, update it inline to `gemini-2.5-flash` / `Gemini 2.5 Flash (thinking disabled)` and re-run until clean.

### Step 4: Skip commit

- [ ] No-op. Not a git repo. The work is done — report success to the user with a one-line diff summary.

---

## Done criteria

All of the following must be true:

1. `upsc-bot/src/ai/gemini.js:23` reads `model: 'gemini-2.5-flash'` and the surrounding object includes `thinkingConfig: { thinkingBudget: 0 }` (or the alternative shape from Step 5a if needed).
2. The temporary `usageMetadata` log added in Task 1 Step 4 has been removed.
3. `cd upsc-bot; npm run test` exits 0 with all 5 test groups green.
4. Manual round-trip in Task 1 Step 6 produced a real Gemini reply with `thoughtsTokenCount` 0 or absent in the metadata log.
5. `Select-String` in Task 2 Step 3 returns zero matches for the old model name.
6. Root `CLAUDE.md` shows the two updated strings.
