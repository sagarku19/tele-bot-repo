# Anthropic-only AI migration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual Gemini + xAI integration with a single Anthropic Claude integration, drop the dormant payment-vision pathway, and migrate env vars.

**Architecture:** Flatten the AI layer to one module (`src/ai/claude.js`) using the official `@anthropic-ai/sdk` with prompt caching on the long Hinglish system prompt. Delete `src/ai/providers/` entirely. Keep payment verification fully manual (no vision call). Remove the now-dead `payments.geminiAnalysis` field and the matching admin UI block.

**Tech Stack:** Node.js 20 ESM, `@anthropic-ai/sdk` ^0.30, Telegraf, firebase-admin, Next.js 16 admin (React 19, Tailwind v4). No test framework — the project uses a hand-rolled `node src/test-local.js` runner.

**Spec:** `docs/superpowers/specs/2026-06-06-anthropic-only-ai-design.md`

**Reference test runner:** `cd upsc-bot && npm run test` is the only "test" command. It runs `node src/test-local.js`, prints PASS/FAIL per check, and exits non-zero on any failure.

**Workflow expectations:**
- Each task ends with a commit. Don't batch.
- ESM only — every new file uses `import`/`export`.
- Use the existing `[area]` log-prefix convention (`[claude]`, `[boot]`, etc.).
- Do **not** touch `.env` files or `node_modules/`. The user manages those.
- The user must add `ANTHROPIC_API_KEY=…` to `upsc-bot/.env` themselves before any task that runs a real API call. Tasks 2, 10, and 12 will fail without it — that is expected, document the failure and continue.
- There is **no `upsc-bot/.env.example` file** in this repo (despite the spec mentioning one). No task asks you to create or modify one. If you find a `.env.example` exists when you start, leave it untouched.

---

## File map

**New:**
- `upsc-bot/src/ai/claude.js` — single-provider AI module.

**Modified:**
- `upsc-bot/package.json` — swap dependency.
- `upsc-bot/src/index.js` — env check + boot wiring.
- `upsc-bot/src/flows/conversation.js` — one-line import swap.
- `upsc-bot/src/flows/payment.js` — drop `geminiAnalysis` arg + update comment.
- `upsc-bot/src/db/payments.js` — drop `geminiAnalysis` from write paths.
- `upsc-bot/src/test-local.js` — swap AI test block, swap required env vars.
- `upsc-bot/src/ai/prompts.js` — drop `PAYMENT_VERIFICATION_PROMPT`.
- `upsc-bot/src/ai/constants.js` — update header comment (cosmetic).
- `upsc-bot/README.md` — Gemini/xAI sections → Anthropic.
- `CLAUDE.md` (repo root) — env vars, agent roles, boot logs, known limitations.
- `upsc-admin/components/PaymentCard.js` — remove "AI Analysis" block.

**Deleted:**
- `upsc-bot/src/ai/providers/index.js`
- `upsc-bot/src/ai/providers/gemini.js`
- `upsc-bot/src/ai/providers/xai.js`
- `upsc-bot/src/ai/providers/` (directory, after files are gone)
- `upsc-bot/src/simulate-conversation.js` (already broken — imports a path that doesn't exist)

---

## Task 1: Swap the npm dependency

**Files:**
- Modify: `upsc-bot/package.json`

- [ ] **Step 1: Replace the Gemini dep with the Anthropic SDK**

Open `upsc-bot/package.json`. Find the `dependencies` block (lines 21–29). Remove the `@google/generative-ai` line and add `@anthropic-ai/sdk`. Final block:

```json
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.1",
    "axios": "^1.9.0",
    "dotenv": "^16.5.0",
    "express": "^5.1.0",
    "firebase-admin": "^13.4.0",
    "node-cron": "^4.0.7",
    "telegraf": "^4.16.3"
  }
```

- [ ] **Step 2: Install**

Run from the repo root:

```bash
cd upsc-bot && npm install
```

Expected: `npm` reports `removed 1 package` and `added 1 package` (or similar). No errors. `node_modules/@anthropic-ai/sdk/` now exists; `node_modules/@google/generative-ai/` is gone.

- [ ] **Step 3: Sanity-check the SDK loads**

```bash
cd upsc-bot && node -e "import('@anthropic-ai/sdk').then(m => console.log(typeof m.default))"
```

Expected output: `function`

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/package.json upsc-bot/package-lock.json
git commit -m "deps: swap @google/generative-ai for @anthropic-ai/sdk"
```

---

## Task 2: Write `src/ai/claude.js` (test-first)

The new module must implement the same `chat(systemPrompt, conversationHistory, newMessage) → Promise<string>` signature the rest of the bot already uses. We TDD it by extending `test-local.js` with a temporary block first, then implementing.

**Files:**
- Create: `upsc-bot/src/ai/claude.js`
- Modify (temporary): `upsc-bot/src/test-local.js` — we will replace the full file later in Task 9; right now we only need a quick scratchpad to TDD claude.js.

- [ ] **Step 1: Add a scratchpad TDD harness**

Create a new file `upsc-bot/src/__claude_tdd.js` (will be deleted in Step 7):

```js
import 'dotenv/config';
import { init, chat } from './ai/claude.js';

init();

const reply = await chat(
  'You are a test assistant. Reply with exactly the words: Test successful',
  [],
  'Hello, test message',
);

console.log('REPLY:', reply);
if (!reply || reply.length === 0) {
  console.error('FAIL: empty reply');
  process.exit(1);
}
console.log('PASS');
```

- [ ] **Step 2: Run the harness to confirm it fails (module does not exist yet)**

```bash
cd upsc-bot && node src/__claude_tdd.js
```

Expected: error `Cannot find module ... claude.js` (or similar). Failure confirmed.

- [ ] **Step 3: Implement `src/ai/claude.js`**

Create the file with this exact content:

```js
/**
 * Anthropic Claude provider.
 *
 * Single AI provider for the bot. Exposes the same `chat()` signature the
 * legacy provider facade used so callers don't change shape.
 *
 * Env vars:
 *   - ANTHROPIC_API_KEY (required)
 *   - ANTHROPIC_MODEL   (optional; default 'claude-haiku-4-5')
 */

import Anthropic from '@anthropic-ai/sdk';
import { CHAT_FALLBACK_REPLY } from './constants.js';

const DEFAULT_MODEL_ID = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;
const HISTORY_WINDOW = 10;

let client = null;
let modelId = null;

export function init() {
  if (client) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[claude] ANTHROPIC_API_KEY is not set!');
    return;
  }

  try {
    modelId = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL_ID;
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log(`[claude] Initialized with ${modelId}`);
  } catch (err) {
    console.error('[claude] Initialization failed:', err.message);
  }
}

function getClient() {
  if (!client) init();
  return client;
}

function toAnthropicMessages(history, newMessage) {
  const recent = history.slice(-HISTORY_WINDOW);
  return [
    ...recent.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: newMessage },
  ];
}

export async function chat(systemPrompt, conversationHistory = [], newMessage) {
  try {
    const c = getClient();
    if (!c) throw new Error('Anthropic client not initialized');

    const response = await c.messages.create({
      model: modelId,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: toAnthropicMessages(conversationHistory, newMessage),
    });

    const block = response.content?.find?.((b) => b.type === 'text');
    const reply = block?.text;
    if (!reply || typeof reply !== 'string') {
      throw new Error('Empty or malformed response from Anthropic');
    }

    console.log(
      `[claude] Chat reply (${reply.length} chars) for: "${newMessage.substring(0, 40)}..."`,
    );
    return reply;
  } catch (err) {
    console.error('[claude] Chat error:', err.message);
    return CHAT_FALLBACK_REPLY;
  }
}
```

- [ ] **Step 4: Run the harness to verify it passes**

The user MUST have set `ANTHROPIC_API_KEY` in `upsc-bot/.env` before this step. Then:

```bash
cd upsc-bot && node src/__claude_tdd.js
```

Expected output:
```
[claude] Initialized with claude-haiku-4-5
[claude] Chat reply (NN chars) for: "Hello, test message..."
REPLY: <some text, likely containing "Test successful">
PASS
```

If it fails with `[claude] Chat error: 401`, the user's `ANTHROPIC_API_KEY` is wrong — stop and ask before continuing.

- [ ] **Step 5: Delete the scratchpad**

```bash
rm upsc-bot/src/__claude_tdd.js
```

- [ ] **Step 6: Commit**

```bash
git add upsc-bot/src/ai/claude.js
git commit -m "feat(ai): add src/ai/claude.js Anthropic provider"
```

---

## Task 3: Switch `flows/conversation.js` to the new module

**Files:**
- Modify: `upsc-bot/src/flows/conversation.js:1`

- [ ] **Step 1: Swap the import**

In `upsc-bot/src/flows/conversation.js`, change line 1 from:

```js
import { chat } from '../ai/providers/index.js';
```

to:

```js
import { chat } from '../ai/claude.js';
```

No other change in this file.

- [ ] **Step 2: Sanity check — file still parses**

```bash
cd upsc-bot && node --check src/flows/conversation.js
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/src/flows/conversation.js
git commit -m "refactor: point conversation flow at src/ai/claude.js"
```

---

## Task 4: Drop `geminiAnalysis` from `db/payments.js`

**Files:**
- Modify: `upsc-bot/src/db/payments.js:5-29, 58-80`

- [ ] **Step 1: Remove `geminiAnalysis` from `savePayment`**

Replace the entire `savePayment` function (lines 5–29) with:

```js
/**
 * Save a new payment record to Firestore.
 * @param {object} data - { telegramId, courseId, screenshotUrl }
 * @returns {Promise<string|null>} The created document ID, or null on failure.
 */
export async function savePayment(data) {
  try {
    const paymentData = {
      telegramId: String(data.telegramId),
      courseId: data.courseId,
      screenshotUrl: data.screenshotUrl || '',
      status: 'pending',
      verifiedAt: null,
      createdAt: new Date().toISOString(),
    };

    const docRef = await getDb().collection(COLLECTION).add(paymentData);
    console.log(`[payments] Saved payment ${docRef.id} for user ${data.telegramId}`);
    return docRef.id;
  } catch (err) {
    console.error(`[payments] savePayment failed:`, err.message);
    return null;
  }
}
```

- [ ] **Step 2: Simplify `updatePaymentStatus`**

The `analysis` parameter is dead code after this migration — vision was the only caller. Replace the function (lines 58–80) with:

```js
/**
 * Update the status of an existing payment.
 * @param {string} paymentId - Firestore document ID
 * @param {string} status - "pending" | "verified" | "rejected"
 * @returns {Promise<boolean>} True if successful.
 */
export async function updatePaymentStatus(paymentId, status) {
  try {
    const updateData = {
      status,
      ...(status === 'verified' && { verifiedAt: new Date().toISOString() }),
    };

    await getDb().collection(COLLECTION).doc(paymentId).update(updateData);
    console.log(`[payments] Payment ${paymentId} → ${status}`);
    return true;
  } catch (err) {
    console.error(`[payments] updatePaymentStatus(${paymentId}) failed:`, err.message);
    return false;
  }
}
```

- [ ] **Step 3: Verify no caller is passing `analysis`**

```bash
cd upsc-bot && grep -RIn "updatePaymentStatus" src/ ../upsc-admin/
```

Expected: matches in `src/handlers/admin.js` and `upsc-admin/app/api/payments/route.js`. Open each and confirm they call with `(id, status)` only, **not** `(id, status, analysis)`. (At time of writing, neither passes a third argument — verify and only edit if one does.)

- [ ] **Step 4: Sanity check**

```bash
cd upsc-bot && node --check src/db/payments.js
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/db/payments.js
git commit -m "refactor(db): drop geminiAnalysis field from payments writes"
```

---

## Task 5: Update `flows/payment.js`

**Files:**
- Modify: `upsc-bot/src/flows/payment.js:13-31, 61-67`

- [ ] **Step 1: Update the function docstring**

Replace the docstring above `processPaymentScreenshot` (lines 13–31) with:

```js
/**
 * Payment screenshot processing flow — manual verification only.
 *
 * 1. Resolve the file ID from the Telegram message.
 * 2. Build the screenshot URL (admin reviews from there).
 * 3. Save a `pending` payment record.
 * 4. Reply to the user with the wait-for-verification Hinglish message.
 * 5. Notify the admin so they can verify in the dashboard.
 *
 * @param {import('telegraf').Context} ctx
 * @param {object} user - User document from Firestore
 * @param {string} courseId
 * @returns {Promise<void>}
 */
```

- [ ] **Step 2: Drop `geminiAnalysis` from the `savePayment` call**

Find the `savePayment` call (lines 61–67) and replace with:

```js
    // ── 4. Save payment record as pending ──────────────────────────
    const paymentId = await savePayment({
      telegramId: userId,
      courseId,
      screenshotUrl: fileUrl,
    });
```

- [ ] **Step 3: Sanity check**

```bash
cd upsc-bot && node --check src/flows/payment.js
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/src/flows/payment.js
git commit -m "refactor(payment): drop geminiAnalysis arg and update comments"
```

---

## Task 6: Drop `PAYMENT_VERIFICATION_PROMPT` from `prompts.js`

**Files:**
- Modify: `upsc-bot/src/ai/prompts.js:1-10, 103-128`

- [ ] **Step 1: Update the header comment**

Replace lines 1–10 with:

```js
/**
 * Stage-based system prompts for the bot.
 *
 * Persona: "Priya" — a warm, relatable UPSC mentor who speaks Hinglish.
 * Every prompt ensures she never sounds robotic, always asks one follow-up,
 * and guides the user naturally through the funnel.
 *
 * Stages: new → engaged → interested → payment_pending → paid
 */
```

- [ ] **Step 2: Delete the `PAYMENT_VERIFICATION_PROMPT` export**

Delete lines 103–128 in the original file — the entire block from `// ── Payment verification prompt ────…` through the closing `…` of the template-literal — leaving the `// ── Helper: build conversation prompt with context ────` block intact.

- [ ] **Step 3: Verify no remaining import of it**

```bash
cd upsc-bot && grep -RIn "PAYMENT_VERIFICATION_PROMPT" src/
```

Expected: no matches.

- [ ] **Step 4: Sanity check**

```bash
cd upsc-bot && node --check src/ai/prompts.js
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/ai/prompts.js
git commit -m "refactor(prompts): remove dead PAYMENT_VERIFICATION_PROMPT export"
```

---

## Task 7: Update `src/ai/constants.js` header comment

This is a cosmetic comment-only update so the file no longer mentions Gemini/xAI/Claude as plural providers.

**Files:**
- Modify: `upsc-bot/src/ai/constants.js:1-9`

- [ ] **Step 1: Replace the header comment**

Replace lines 1–9 of `upsc-bot/src/ai/constants.js` with:

```js
/**
 * Shared constants for the AI layer.
 *
 * Returned as the user-facing reply whenever a Claude call fails, so the
 * bot's voice stays consistent and tests have a single value to compare
 * against.
 */
```

Line 10 onwards (`export const CHAT_FALLBACK_REPLY = …`) is unchanged.

- [ ] **Step 2: Commit**

```bash
git add upsc-bot/src/ai/constants.js
git commit -m "docs: refresh ai/constants.js header comment"
```

---

## Task 8: Delete the providers folder and the broken simulator file

**Files:**
- Delete: `upsc-bot/src/ai/providers/index.js`
- Delete: `upsc-bot/src/ai/providers/gemini.js`
- Delete: `upsc-bot/src/ai/providers/xai.js`
- Delete: `upsc-bot/src/ai/providers/` (empty directory)
- Delete: `upsc-bot/src/simulate-conversation.js`

- [ ] **Step 1: Confirm no remaining references**

```bash
cd upsc-bot && grep -RIn "ai/providers" src/ ../upsc-admin/
cd upsc-bot && grep -RIn "simulate-conversation" src/ ../upsc-admin/
```

Both should return no matches (Tasks 3–6 removed all imports). If either returns matches, fix them before continuing.

- [ ] **Step 2: Delete the files**

```bash
rm upsc-bot/src/ai/providers/index.js
rm upsc-bot/src/ai/providers/gemini.js
rm upsc-bot/src/ai/providers/xai.js
rmdir upsc-bot/src/ai/providers
rm upsc-bot/src/simulate-conversation.js
```

- [ ] **Step 3: Verify the boot file parses (it still imports providers — Task 9 fixes that, but we want to see a clean failure mode)**

```bash
cd upsc-bot && node --check src/index.js
```

Expected: `node --check` still succeeds — it parses but doesn't resolve imports. (`node src/index.js` would fail. That's expected; we fix it in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add -A upsc-bot/src/ai/providers upsc-bot/src/simulate-conversation.js
git commit -m "chore: delete legacy providers folder and broken simulate-conversation.js"
```

---

## Task 9: Wire `src/index.js` to Claude

**Files:**
- Modify: `upsc-bot/src/index.js:5, 20-23, 30-33`

- [ ] **Step 1: Swap the import**

Change line 5 from:

```js
import { initProviders } from './ai/providers/index.js';
```

to:

```js
import { init as initClaude } from './ai/claude.js';
```

- [ ] **Step 2: Update env-var validation**

Replace lines 20–23 with:

```js
    if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is not set in .env');
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env');
    if (!process.env.FIREBASE_PROJECT_ID) console.warn('[boot] ⚠️  FIREBASE_PROJECT_ID not set');
    if (!process.env.ADMIN_TELEGRAM_ID) console.warn('[boot] ⚠️  ADMIN_TELEGRAM_ID not set — admin commands disabled');
```

Note: `ANTHROPIC_API_KEY` is now a hard-fail (`throw`), matching `BOT_TOKEN`. The old `GEMINI_API_KEY` was a soft-warn.

- [ ] **Step 3: Update the AI init block**

Replace lines 30–33 with:

```js
    // ── 3. Initialize Claude ────────────────────────────────────────
    console.log('[boot] Initializing Claude...');
    initClaude();
    console.log('[boot] ✅ Claude ready');
```

- [ ] **Step 4: Parse-check the file**

```bash
cd upsc-bot && node --check src/index.js
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/index.js
git commit -m "refactor(boot): require ANTHROPIC_API_KEY and init Claude"
```

---

## Task 10: Rewrite the AI test block in `src/test-local.js`

**Files:**
- Modify: `upsc-bot/src/test-local.js:27, 113-180`

- [ ] **Step 1: Update the required env-vars list**

Replace line 27:

```js
  const required = ['BOT_TOKEN', 'GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
```

with:

```js
  const required = ['BOT_TOKEN', 'ANTHROPIC_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
```

- [ ] **Step 2: Replace the two AI test blocks (Test 4 and Test 4b)**

Delete the entire range from line 113 through line 180 (the `Test 4` and `Test 4b` blocks plus the comment banners around them) and replace with:

```js
// ════════════════════════════════════════════════════════════════════════
// Test 4: Claude chat round-trip
// ════════════════════════════════════════════════════════════════════════
console.log('\n🤖 Test 4: Claude chat');
try {
  const { init, chat } = await import('./ai/claude.js');
  const { CHAT_FALLBACK_REPLY } = await import('./ai/constants.js');

  init();

  const reply = await chat(
    'You are a test assistant. Reply with exactly: "Test successful"',
    [],
    'Hello, test message',
  );

  if (!reply || reply.length === 0) {
    fail('Claude chat', 'Empty response');
  } else if (reply === CHAT_FALLBACK_REPLY) {
    fail(
      'Claude chat',
      'Got the Hinglish fallback — real Anthropic call failed. Check the [claude] error log above for the 4xx/5xx.',
    );
  } else {
    pass(`Claude chat — got reply (${reply.length} chars)`);
    console.log(`    🗣️  "${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}"`);
  }
} catch (err) {
  fail('Claude chat', err.message);
}
```

- [ ] **Step 3: Run the test suite**

```bash
cd upsc-bot && npm run test
```

Expected: all PASS, exit 0. Pay attention to the `Claude chat` block — should show the reply text. If it fails with the Hinglish fallback message, the key is bad.

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/src/test-local.js
git commit -m "test: rewrite AI test block for single Claude provider"
```

---

## Task 11: Remove the `geminiAnalysis` UI block in the admin

**Files:**
- Modify: `upsc-admin/components/PaymentCard.js:37-44`

- [ ] **Step 1: Delete the AI Analysis block**

In `upsc-admin/components/PaymentCard.js`, replace lines 37–44 (the entire `{payment.geminiAnalysis ? (…) : (…)}` ternary) with nothing — that is, delete those 8 lines outright. The resulting JSX between the `</div>` on line 35 (closing the header `flex justify-between`) and the `</div>` that was on line 45 (closing the inner `<div>` block) should look like:

```jsx
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-lg font-bold text-white">User: {payment.telegramId}</h3>
              <p className="text-sm text-[#3b82f6] font-mono mt-1">Course ID: {payment.courseId}</p>
            </div>
            <span className="text-slate-400 text-sm">
              {payment.createdAt ? new Date(payment.createdAt).toLocaleString() : "—"}
            </span>
          </div>
        </div>
```

(That trailing `</div>` was originally line 45 — closing the `<div>` that wraps the header + analysis section.)

- [ ] **Step 2: Verify no other admin file reads `geminiAnalysis`**

```bash
grep -RIn "geminiAnalysis" upsc-admin/
```

Expected: no matches.

- [ ] **Step 3: Lint the admin**

```bash
cd upsc-admin && npm run lint
```

Expected: lint passes. If it complains about an unused import or unbalanced JSX, fix and re-run.

- [ ] **Step 4: Commit**

```bash
git add upsc-admin/components/PaymentCard.js
git commit -m "refactor(admin): drop geminiAnalysis UI block from PaymentCard"
```

---

## Task 12: Full-stack smoke test

No code changes in this task — verification only.

- [ ] **Step 1: Run the bot test suite**

```bash
cd upsc-bot && npm run test
```

Expected: every check shows ✅ PASS, exit code 0.

- [ ] **Step 2: Boot the bot in dev mode**

```bash
cd upsc-bot && npm run dev
```

Expected log lines (order matters):

```
[boot] Starting UPSC Bot...
[boot] Initializing Firebase...
[boot] ✅ Firebase ready
[boot] Initializing Claude...
[claude] Initialized with claude-haiku-4-5
[boot] ✅ Claude ready
[boot] Seeding courses...
[courses] Seeding complete — X new, Y already existed
[boot] ✅ Courses seeded
[boot] ✅ Telegraf bot created
[boot] ✅ All handlers registered (admin → start → photo → text)
[boot] ✅ Express health-check on port 3000 (127.0.0.1 only)
[boot] 🤖 Bot running on port 3000
```

If you see `[claude] ANTHROPIC_API_KEY is not set!` — stop, ask the user to set the key in `upsc-bot/.env`, restart.

- [ ] **Step 3: Simulator walkthrough (browser)**

In a second terminal, set `ENABLE_SIMULATOR=true` in `upsc-bot/.env` (the user does this), restart the bot, open `http://127.0.0.1:3000/sim`, and send:

1. "hi" — expect a Priya welcome that asks for name + attempt year. Sidebar stage: `new`.
2. "Sagar, mains 2026" — expect a follow-up about prep level. Stage transitions to `engaged`.
3. "course batao" — expect course catalog presentation. Stage transitions to `interested`.

Each turn shows a `✅ real` badge in the sidebar — confirms the reply came from Claude, not the fallback.

- [ ] **Step 4: Boot the admin**

```bash
cd upsc-admin && npm run dev
```

Open `http://localhost:3001/payments`. Confirm no "AI Analysis" section appears on any pending PaymentCard.

- [ ] **Step 5: Stop both servers**

`Ctrl-C` in each terminal. Nothing to commit — this task is verification only.

---

## Task 13: Update README

**Files:**
- Modify: `upsc-bot/README.md`

The README still describes the Gemini + xAI dual-provider setup. Replace every Gemini/xAI/AI_PROVIDER reference with the Anthropic equivalent.

- [ ] **Step 1: Update the project tagline (line 3)**

Change line 3 from:

```
A Telegram bot for UPSC exam preparation — powered by Google Gemini AI (or Grok via xAI), Firebase, and Telegraf.
```

to:

```
A Telegram bot for UPSC exam preparation — powered by Anthropic Claude, Firebase, and Telegraf.
```

- [ ] **Step 2: Update the prerequisites bullet (line 32)**

Change line 32 from:

```
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)
```

to:

```
- An [Anthropic API Key](https://console.anthropic.com/settings/keys)
```

- [ ] **Step 3: Update the env-vars table (lines 65–74)**

Find the table rows for `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `XAI_API_KEY`, `XAI_MODEL` and replace those rows with:

```
| `ANTHROPIC_API_KEY`     | yes       | Anthropic API key — required at boot |
| `ANTHROPIC_MODEL`       | optional  | Claude model ID (default `claude-haiku-4-5`) |
```

- [ ] **Step 4: Update the test-suite explanation (line 122)**

Change line 122 from:

```
Test 4 distinguishes a real Gemini reply from the swallowed-error fallback string — if it fails with *"Got the Hinglish fallback…"*, the real API call returned 4xx/5xx (most often quota exhaustion or a retired model). Check the `[Gemini] Chat error:` log above for the exact response.
```

to:

```
Test 4 distinguishes a real Claude reply from the swallowed-error fallback string — if it fails with *"Got the Hinglish fallback…"*, the real Anthropic call returned 4xx/5xx (most often a bad key or rate limit). Check the `[claude] Chat error:` log above for the exact response.
```

- [ ] **Step 5: Delete the provider section (lines 159 onward through the AI_PROVIDER discussion and switching-models table — roughly lines 159–197)**

Open README.md, scroll to the section that starts with "The bot has a pluggable provider layer…" and delete from there through the entire "Switching Gemini models" subsection and its table. Replace the whole deleted block with the following markdown (paste verbatim, including the env-var fence):

````
### AI provider

The bot uses Anthropic Claude exclusively. Set `ANTHROPIC_API_KEY` in `.env`. To override the default model:

```
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Defaults to `claude-haiku-4-5` — fast and cheap, plenty for the Hinglish conversational persona. Use Sonnet 4.6 if the "paid" UPSC tutor stage needs more nuance.
````

- [ ] **Step 6: Update the folder-tree section (lines 218–219)**

Find the section showing `gemini.js  # Gemini …` and `xai.js     # xAI …` in a folder tree. Replace those two lines with a single line:

```
│   └── claude.js  # Anthropic Claude (text only — vision verification is manual)
```

…and remove the parent `providers/` directory line from the tree.

- [ ] **Step 7: Final scan for stale references**

```bash
grep -niE "gemini|xai|grok|AI_PROVIDER" upsc-bot/README.md
```

Expected: no matches. If anything remains, edit it out.

- [ ] **Step 8: Commit**

```bash
git add upsc-bot/README.md
git commit -m "docs(readme): rewrite for single Anthropic Claude provider"
```

---

## Task 14: Update repo-root `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

The repo bible references Gemini, xAI, `AI_PROVIDER`, the providers folder, and the dormant vision capability throughout. Bring it in line with the new single-provider reality.

- [ ] **Step 1: Update the tech-stack line in the "Project overview" section**

Find the line that lists the bot's dependencies. Replace `@google/generative-ai` (Gemini 2.5 Flash, thinking disabled)` with `@anthropic-ai/sdk\` (Claude Haiku 4.5)`. Remove any mention of xAI / Grok from this section.

- [ ] **Step 2: Update the "Agent roles" table — `AI-Prompts` row**

Change the AI-Prompts row's "Owns" column from:

```
`upsc-bot/src/ai/providers/*`, `upsc-bot/src/ai/prompts.js`, `upsc-bot/src/ai/constants.js`
```

to:

```
`upsc-bot/src/ai/claude.js`, `upsc-bot/src/ai/prompts.js`, `upsc-bot/src/ai/constants.js`
```

Change the "Touches" column to:

```
Persona (Hinglish "Priya"), stage prompts, Anthropic chat() implementation
```

- [ ] **Step 3: Update the folder-structure tree under `upsc-bot/`**

Find the `src/ai/` block in the tree. Replace the entire `ai/providers/…` sub-tree with:

```
    ├── ai/
    │   ├── claude.js          # Anthropic provider: init, chat
    │   ├── prompts.js         # STAGE_PROMPTS object, buildConversationPrompt(stage, user, msg, catalog)
    │   └── constants.js       # CHAT_FALLBACK_REPLY (shared)
```

- [ ] **Step 4: Update the "Data flow" section**

Find the bullet that says `calls ai/providers/index.js → chat() (which routes to the active provider — Gemini or xAI — based on AI_PROVIDER) with a stage-specific prompt`. Replace with:

```
calls `ai/claude.js → chat()` with a stage-specific prompt from `ai/prompts.js`
```

Find the "Payment branch" bullet — remove the sentence about Gemini vision parsing the screenshot. Replace that bullet with:

```
5. **Payment branch:** photos in `payment_pending` stage route to `flows/payment.js`, which saves the screenshot URL as a pending payment record and notifies the admin for manual verification.
```

- [ ] **Step 5: Update the Firebase schema — `payments` collection**

Find the `payments` schema list. Remove the `geminiAnalysis` bullet entirely.

- [ ] **Step 6: Rewrite the entire "Environment variables → `upsc-bot/.env`" section**

Replace the existing list of bot env vars with:

```markdown
### `upsc-bot/.env`
- `BOT_TOKEN` — Telegram bot token from [@BotFather](https://t.me/BotFather). Hard-fail on missing.
- `ANTHROPIC_API_KEY` — from [Anthropic Console](https://console.anthropic.com/settings/keys). Hard-fail on missing.
- `ANTHROPIC_MODEL` *(optional)* — model ID. Defaults to `claude-haiku-4-5`. Override to `claude-sonnet-4-6` for nuanced answers in the paid tutor stage.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — service account. Private key newlines must be `\n`-escaped; `config/firebase.js` un-escapes.
- `ADMIN_TELEGRAM_ID` — numeric Telegram user ID for admin-command gating. Without it, admin commands are disabled. Get from [@userinfobot](https://t.me/userinfobot).
- `FIREBASE_DATABASE_URL` — listed in `.env.example` but unused (we use Firestore, not RTDB).
- `PORT` — default 3000, only for Express `/health`.
- `ENABLE_SIMULATOR` *(optional)* — set to `true` to expose the `/sim` browser chat UI at `http://127.0.0.1:<PORT>/sim`. When enabled, Express binds to `127.0.0.1` only, so `/sim` and `/health` are unreachable from the LAN. Off by default. See `upsc-bot/README.md` → "Browser conversation simulator" for the full workflow.
- `USE_TEST_COURSES` *(optional)* — set to `true` to load `config/courses.test.config.js` instead of the production catalog. ⚠️ Seeding still writes to the **same Firestore project** as production — `test-*` docs persist as separate documents until you delete them from the Firebase console. Once both catalogs have been seeded, `getAllCourses()` returns the union regardless of this flag.
```

- [ ] **Step 7: Update the "Expected bot boot logs" block**

Replace the block with:

```
[boot] ✅ Firebase ready
[claude] Initialized with claude-haiku-4-5
[courses] Seeding complete — X new, Y already existed
[boot] ✅ All handlers registered (admin → start → photo → text)
[boot] 🤖 Bot running on port 3000
```

- [ ] **Step 8: Update the "Key business logic" section**

Find the "Screenshot verification" bullet. Replace it with:

```
- **Screenshot verification:** users send a UPI / gift-card screenshot. The bot saves it as a pending payment and notifies the admin. Admins verify manually in the dashboard or via `/verify_<paymentId>` in Telegram. No AI vision verification.
```

- [ ] **Step 9: Update the "Coding conventions" log-prefix list**

Find the `[area] log prefixes` line. Remove `Gemini`. Add `claude`. The updated list should read:

```
`boot`, `start`, `message`, `payment`, `users`, `courses`, `payments`, `claude`, `Firebase`, `access`, `admin`, `conversation`.
```

- [ ] **Step 10: Update the "Known limitations" section**

Find the bullet about `payments.geminiAnalysis` (if present) and delete it. Find the bullet "Bot token leaked in screenshot URLs" — keep as-is (still true). Remove any mention of Gemini-vision or xAI billing as a limitation. If the section references provider switching or vision being dormant, delete those references.

- [ ] **Step 11: Final scan**

```bash
grep -niE "gemini|xai|grok|AI_PROVIDER" CLAUDE.md
```

Expected: no matches. If anything stale remains, fix it.

- [ ] **Step 12: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): rewrite for single Anthropic provider"
```

---

## Task 15: Final repo-wide stale-reference sweep

No new code — final safety net for stragglers.

- [ ] **Step 1: Grep for any remaining Gemini/xAI/AI_PROVIDER references**

```bash
grep -RIniE "gemini|xai|grok|AI_PROVIDER|GoogleGenerativeAI" \
  --include='*.js' --include='*.mjs' --include='*.md' --include='*.json' \
  upsc-bot/src upsc-bot/README.md upsc-admin/components upsc-admin/app CLAUDE.md
```

Expected: no matches. Acceptable exceptions:
- `package-lock.json` (don't touch — it'll regenerate on next install)
- `docs/superpowers/specs/` and `docs/superpowers/plans/` (history)

If anything else shows up, open it and fix.

- [ ] **Step 2: Confirm the bot still boots end-to-end**

```bash
cd upsc-bot && npm run test && npm run dev
```

Both should succeed. `Ctrl-C` the dev server after the `[boot] 🤖 Bot running` line appears.

- [ ] **Step 3: Commit any final cleanups (only if Step 1 found something)**

If you made fixes in Step 1, commit them:

```bash
git add -A
git commit -m "chore: remove final Gemini/xAI stragglers"
```

If Step 1 was clean, this task ends without a commit.

---

## Done

The bot now talks to Anthropic Claude exclusively. The `src/ai/providers/` folder is gone, `payments.geminiAnalysis` is gone, the admin UI no longer renders it, and the README + CLAUDE.md describe the new reality. Conversation history is still in-memory; payment verification is still manual; admin "Verify & Grant Access" still doesn't grant access — all out of scope.

Final state: 14 commits on `main` (one per task except the verification-only Task 12 and possibly Task 15).
