# Chat Persistence + Links Store + Tone & Markdown Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every conversation turn to a Firestore subcollection, give the admin a chat viewer at `/users/[telegramId]`, add a manageable Firestore-backed links store with admin CRUD, close the unsubstituted-placeholder and `**bold**` Known Limitations, and rewrite STAGE_PROMPTS / templates / examples to a polite register.

**Architecture:** Four phases. Phase 1 stands up the bot-side substrate — two new DB modules (`messages`, `links`), a sanitize module, and an `expandLinks` helper on the existing templates module. Phase 2 wires them into `processMessage` (which now returns a `meta` block describing how the reply was produced) and into both handlers (`message.js`, `photo.js`), which append every turn and remove the buggy first-text-overwrite. Phase 3 builds the admin side: two new API routes (`/api/messages`, `/api/links`), an extension to `/api/users` for single-user lookup, a chat viewer page at `/users/[telegramId]`, a Links CRUD page, a Sidebar entry, and a clickable UserTable. Phase 4 does the tone rewrite (STAGE_PROMPTS / templates.json / examples.json) plus the universal "no Markdown" rule, the CLAUDE.md update, and the final smoke test.

**Tech Stack:** Node.js ESM, Telegraf 4.x, `@anthropic-ai/sdk`, `firebase-admin`, Next.js 16 App Router + React 19 + Tailwind v4 + NextAuth 4 (JWT/Credentials), bespoke `node src/test-local.js` test runner.

---

## Pre-flight

```bash
git status
git branch --show-current
```

Expected: branch `main`, working tree clean (the one-word edit in `upsc-bot/src/handlers/start.js` flagged at the end of the previous plan should already be committed or reverted — confirm before proceeding).

If `start.js` is still dirty, commit it as `chore(start): tweak welcome wording` so the working tree is clean before tasks begin.

---

# Phase 1 — Bot-side substrate

## Task 1: Build `src/db/messages.js`

**Files:**
- Create: `upsc-bot/src/db/messages.js`
- Modify: `upsc-bot/src/test-local.js` (insert Test 11 before the Summary divider)

- [ ] **Step 1: Write the failing test**

Append this Test 11 block to `upsc-bot/src/test-local.js` immediately before the `// Summary` divider:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 11: Messages subcollection CRUD
// ════════════════════════════════════════════════════════════════════════
console.log('\n💬 Test 11: Messages CRUD');
try {
  const { getDb } = await import('../config/firebase.js');
  const { appendMessage, getMessages } = await import('./db/messages.js');
  const db = getDb();

  const testUserId = `__test_msg_user_${Date.now()}`;
  await db.collection('users').doc(testUserId).set({
    telegramId: Number(testUserId.slice(-12)) || 999999,
    name: 'Test',
    stage: 'new',
    createdAt: new Date().toISOString(),
  });

  // Append a user message
  const ok1 = await appendMessage(testUserId, {
    role: 'user',
    text: 'Hello',
    stage: 'new',
    source: 'user',
  });
  if (ok1) pass('appendMessage user — returned true');
  else fail('appendMessage user', 'returned false');

  // Append a bot message with meta
  const ok2 = await appendMessage(testUserId, {
    role: 'bot',
    text: 'Hi',
    stage: 'new',
    source: 'claude',
    model: 'claude-haiku-4-5',
  });
  if (ok2) pass('appendMessage bot — returned true');
  else fail('appendMessage bot', 'returned false');

  // Read them back (newest-first ordering)
  const msgs = await getMessages(testUserId, { limit: 10 });
  if (Array.isArray(msgs) && msgs.length === 2 && msgs[0].role === 'bot' && msgs[1].role === 'user') {
    pass('getMessages — returned 2 msgs, newest-first');
  } else {
    fail('getMessages', `Got ${msgs?.length} msgs: ${JSON.stringify(msgs?.map(m => m.role))}`);
  }

  // Cleanup — delete subcollection docs, then user doc
  const sub = await db.collection('users').doc(testUserId).collection('messages').get();
  for (const d of sub.docs) await d.ref.delete();
  await db.collection('users').doc(testUserId).delete();
} catch (err) {
  fail('Messages CRUD', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — Messages CRUD: Cannot find module ... messages.js`

- [ ] **Step 3: Implement `src/db/messages.js`**

```javascript
import { getDb } from '../../config/firebase.js';

const USERS = 'users';
const MESSAGES = 'messages';

/**
 * Append a message to a user's chat subcollection.
 * Append-only; never updates or deletes.
 *
 * @param {number|string} telegramId
 * @param {{role: 'user'|'bot', text: string, stage: string, source: 'user'|'claude'|'faq'|'template'|'system', faqKey?: string, model?: string}} msg
 * @returns {Promise<boolean>} true on success, false on failure (logs the error)
 */
export async function appendMessage(telegramId, msg) {
  try {
    const doc = {
      role: msg.role,
      text: msg.text ?? '',
      stage: msg.stage ?? 'unknown',
      source: msg.source ?? 'system',
      ts: new Date().toISOString(),
    };
    if (msg.faqKey) doc.faqKey = msg.faqKey;
    if (msg.model) doc.model = msg.model;

    await getDb()
      .collection(USERS)
      .doc(String(telegramId))
      .collection(MESSAGES)
      .add(doc);
    return true;
  } catch (err) {
    console.error(`[messages] appendMessage(${telegramId}) failed:`, err.message);
    return false;
  }
}

/**
 * Read messages for a user, newest-first.
 *
 * @param {number|string} telegramId
 * @param {{limit?: number, before?: string}} [opts] — before is an ISO timestamp; messages strictly older than that are returned
 * @returns {Promise<Array>} newest-first array of message docs (each includes id + fields)
 */
export async function getMessages(telegramId, opts = {}) {
  try {
    const { limit = 100, before } = opts;
    let q = getDb()
      .collection(USERS)
      .doc(String(telegramId))
      .collection(MESSAGES)
      .orderBy('ts', 'desc');
    if (before) q = q.where('ts', '<', before);
    q = q.limit(limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`[messages] getMessages(${telegramId}) failed:`, err.message);
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 3 PASS lines for the messages CRUD assertions.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/db/messages.js upsc-bot/src/test-local.js
git commit -m "feat(db): add messages subcollection appendMessage + getMessages"
```

---

## Task 2: Build `src/db/links.js`

**Files:**
- Create: `upsc-bot/src/db/links.js`
- Modify: `upsc-bot/src/test-local.js` (insert Test 12 before Summary)

- [ ] **Step 1: Write the failing test**

Append this Test 12 block to `upsc-bot/src/test-local.js` immediately before the `// Summary` divider:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 12: Links collection loader
// ════════════════════════════════════════════════════════════════════════
console.log('\n🔗 Test 12: Links loader');
try {
  const { getDb } = await import('../config/firebase.js');
  const { getAllLinks } = await import('./db/links.js');
  const db = getDb();

  const testKey = `__test_link_${Date.now()}`;
  await db.collection('links').doc(testKey).set({
    name: testKey,
    url: 'https://example.com/test',
    updatedAt: new Date().toISOString(),
  });

  const map = await getAllLinks();
  if (map && typeof map === 'object' && map[testKey] === 'https://example.com/test') {
    pass(`getAllLinks — contains ${testKey}`);
  } else {
    fail('getAllLinks', `Expected key ${testKey} mapped to URL, got: ${JSON.stringify(map?.[testKey])}`);
  }

  await db.collection('links').doc(testKey).delete();
} catch (err) {
  fail('Links loader', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — Links loader: Cannot find module ... links.js`

- [ ] **Step 3: Implement `src/db/links.js`**

```javascript
import { getDb } from '../../config/firebase.js';

const COLLECTION = 'links';

/**
 * Return all links as a flat { name: url } map.
 * Used by the templates substitution chain to expand {{link}} / {{list1_link}}
 * placeholders inside template bodies at send time.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function getAllLinks() {
  try {
    const snap = await getDb().collection(COLLECTION).get();
    const out = {};
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data?.url) out[doc.id] = data.url;
    }
    return out;
  } catch (err) {
    console.error('[links] getAllLinks failed:', err.message);
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 1 new PASS for `getAllLinks`.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/db/links.js upsc-bot/src/test-local.js
git commit -m "feat(db): add links collection loader"
```

---

## Task 3: Build `src/training/sanitize.js`

**Files:**
- Create: `upsc-bot/src/training/sanitize.js`
- Modify: `upsc-bot/src/test-local.js`

Responsibility: strip Markdown emphasis (`**bold**`, `*italic*`) from a reply before sending. Pure function, no I/O.

- [ ] **Step 1: Write the failing test**

Append this Test 13 block to `upsc-bot/src/test-local.js` before the Summary divider:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 13: stripEmphasis
// ════════════════════════════════════════════════════════════════════════
console.log('\n🧹 Test 13: stripEmphasis');
try {
  const { stripEmphasis } = await import('./training/sanitize.js');

  // Basic bold
  const r1 = stripEmphasis('Hello **bold** world');
  if (r1 === 'Hello bold world') pass('stripEmphasis — basic **bold**');
  else fail('stripEmphasis bold', `Got: "${r1}"`);

  // Basic italic
  const r2 = stripEmphasis('Hello *italic* world');
  if (r2 === 'Hello italic world') pass('stripEmphasis — basic *italic*');
  else fail('stripEmphasis italic', `Got: "${r2}"`);

  // Mixed
  const r3 = stripEmphasis('Price: **₹1499** for *combo*');
  if (r3 === 'Price: ₹1499 for combo') pass('stripEmphasis — mixed bold + italic');
  else fail('stripEmphasis mixed', `Got: "${r3}"`);

  // Unmatched asterisks are left intact
  const r4 = stripEmphasis('5 * 3 = 15 and a lone *');
  if (r4 === '5 * 3 = 15 and a lone *') pass('stripEmphasis — unmatched * untouched');
  else fail('stripEmphasis unmatched', `Got: "${r4}"`);

  // Empty / falsy input
  const r5 = stripEmphasis('');
  if (r5 === '') pass('stripEmphasis — empty string returns empty');
  else fail('stripEmphasis empty', `Got: "${r5}"`);
} catch (err) {
  fail('stripEmphasis', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — stripEmphasis: Cannot find module ... sanitize.js`

- [ ] **Step 3: Implement `src/training/sanitize.js`**

```javascript
/**
 * Strip Markdown emphasis (**bold** and *italic*) from a string.
 *
 * Telegram replies are sent as plain text (no parse_mode), so any leftover
 * asterisks from the model would render as literal characters. This is a
 * safety net — the real fix is the "no Markdown" rule in STAGE_PROMPTS.
 *
 * Unmatched single asterisks (e.g. "5 * 3") are left intact via lookbehind/
 * lookahead guards so we don't eat arithmetic.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripEmphasis(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![*\w])\*([^*\s][^*]*[^*\s]|[^*\s])\*(?![*\w])/g, '$1');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 5 new PASS lines for stripEmphasis.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/training/sanitize.js upsc-bot/src/test-local.js
git commit -m "feat(training): add stripEmphasis sanitizer for leftover Markdown"
```

---

## Task 4: Add `expandLinks` export to `src/training/templates.js`

**Files:**
- Modify: `upsc-bot/src/training/templates.js`
- Modify: `upsc-bot/src/test-local.js`

`expandLinks(text, links)` calls the existing `substitute(text, links)` under the hood — same `{{var}}` semantics, separate name to make the call sites self-documenting (`{{link}}` and friends come from the links collection, not from per-turn vars).

- [ ] **Step 1: Write the failing test**

Append this Test 14 block to `upsc-bot/src/test-local.js` before the Summary divider:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 14: expandLinks
// ════════════════════════════════════════════════════════════════════════
console.log('\n🔗 Test 14: expandLinks');
try {
  const { expandLinks } = await import('./training/templates.js');

  const links = {
    link: 'https://phon.pe/abc',
    list1_link: 'https://t.me/+aaa',
    list2_link: 'https://t.me/+bbb',
  };

  // All three placeholders substituted
  const r1 = expandLinks('Pay {{link}} | List1 {{list1_link}} | List2 {{list2_link}}', links);
  if (r1 === 'Pay https://phon.pe/abc | List1 https://t.me/+aaa | List2 https://t.me/+bbb') {
    pass('expandLinks — all placeholders substituted');
  } else {
    fail('expandLinks all', `Got: "${r1}"`);
  }

  // Unknown placeholder left intact
  const r2 = expandLinks('Unknown {{not_a_link}}', links);
  if (r2 === 'Unknown {{not_a_link}}') {
    pass('expandLinks — unknown placeholder left intact');
  } else {
    fail('expandLinks unknown', `Got: "${r2}"`);
  }

  // Empty links map: nothing substituted
  const r3 = expandLinks('Pay {{link}}', {});
  if (r3 === 'Pay {{link}}') pass('expandLinks — empty map leaves placeholders');
  else fail('expandLinks empty map', `Got: "${r3}"`);
} catch (err) {
  fail('expandLinks', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — expandLinks: ... expandLinks is not a function`

- [ ] **Step 3: Add `expandLinks` export to `src/training/templates.js`**

Append this to the bottom of `upsc-bot/src/training/templates.js` (after the existing `replaceMarkers` export):

```javascript
/**
 * Expand {{name}} link placeholders inside a template body using the
 * links map from the Firestore links collection. Thin wrapper around
 * `substitute` — distinct name so call sites read clearly.
 *
 * @param {string} text
 * @param {Record<string,string>} links
 * @returns {string}
 */
export function expandLinks(text, links = {}) {
  return substitute(text, links);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 3 new PASS lines for expandLinks.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/training/templates.js upsc-bot/src/test-local.js
git commit -m "feat(training): add expandLinks helper for {{link}} substitution"
```

---

# Phase 2 — Conversation + handler wiring

## Task 5: Update `processMessage` to return `meta`

**Files:**
- Modify: `upsc-bot/src/flows/conversation.js`

`processMessage` currently returns `{ reply, newStage, selectedCourseId }`. After this task it returns `{ reply, newStage, selectedCourseId, meta }` where `meta = { source, faqKey?, model? }`. This unlocks Task 7 (handler appends with full context).

- [ ] **Step 1: Update the FAQ short-circuit return shape**

In `upsc-bot/src/flows/conversation.js`, find the FAQ short-circuit block (early in `processMessage`, looks like `if (stage !== 'paid') { try { const [faq, templates] = await Promise.all(...); const hit = matchFaq(text, faq); if (hit) { ... return { reply: replaceMarkers(hit.reply, templates), ... }; } } catch ... } }`).

Replace the FAQ-hit return statement so it includes `meta`:

```javascript
        return {
          reply: replaceMarkers(hit.reply, templates),
          newStage: null,
          selectedCourseId: null,
          meta: { source: 'faq', faqKey: hit.key },
        };
```

- [ ] **Step 2: Update every other `return` inside `processMessage` to include `meta`**

There are 5 stage branches (`new`, `engaged`, `interested`, `payment_pending`, `paid`) plus the fallback at the end. Each currently returns `{ reply, newStage, selectedCourseId }`. Change each to add `meta: { source: 'claude', model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5' }`.

For each branch, the return statement becomes:

```javascript
      return {
        reply,
        newStage: <stage-specific>,
        selectedCourseId: <stage-specific>,
        meta: { source: 'claude', model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5' },
      };
```

The exception is the `interested` stage which has its own return with `cleanReply` / `finalReply` and `selectedCourseId`. Update it the same way:

```javascript
      return {
        reply: finalReply,
        newStage,
        selectedCourseId,
        meta: { source: 'claude', model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5' },
      };
```

The catch-block fallback at the bottom of `processMessage`:

```javascript
  } catch (err) {
    console.error(`[conversation] Error for user ${userId}:`, err.message);
    return {
      reply: 'Arre sorry yaar! Kuch technical issue aa gaya 😅 Ek baar phir try kar na!',
      newStage: null,
      selectedCourseId: null,
      meta: { source: 'system' },
    };
  }
```

- [ ] **Step 3: Run the test suite**

```bash
cd upsc-bot && npm run test
```

Expected: all existing tests still pass. No new test in this task — Task 7 will exercise the meta-flow end-to-end via the message handler.

- [ ] **Step 4: Boot smoke-check**

```bash
cd upsc-bot && timeout 8 npm run dev || true
```

Expected: clean boot through `[boot] ✅ All handlers registered`. No syntax errors.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/flows/conversation.js
git commit -m "refactor(conversation): processMessage returns meta describing how reply was produced"
```

---

## Task 6: Wire `expandLinks` + `stripEmphasis` into the reply chain

**Files:**
- Modify: `upsc-bot/src/flows/conversation.js`

The current `swap = (reply) => replaceMarkers(reply, templates)` becomes a three-stage chain: `replaceMarkers → expandLinks → stripEmphasis`. Plus `getAllLinks` is loaded in the same `Promise.all` as the existing loaders, and the FAQ short-circuit's reply also runs through the full chain.

- [ ] **Step 1: Update imports**

Replace the existing imports block at the top of `upsc-bot/src/flows/conversation.js` with:

```javascript
import { chat } from '../ai/claude.js';
import { buildConversationPrompt } from '../ai/prompts.js';
import { getAllCourses } from '../db/courses.js';
import { getAllLinks } from '../db/links.js';
import { formatPrice } from '../utils/helpers.js';
import { loadExamples, loadTemplates, loadFaq } from '../training/loader.js';
import { pickExamples } from '../training/examples.js';
import { replaceMarkers, expandLinks } from '../training/templates.js';
import { stripEmphasis } from '../training/sanitize.js';
import { matchFaq } from '../training/faq.js';
```

- [ ] **Step 2: Update the FAQ short-circuit to load + use links and to chain the full pipeline**

Find the FAQ short-circuit block and replace it with:

```javascript
  // ── FAQ short-circuit (skip for paid — they get the full tutor) ─
  if (stage !== 'paid') {
    try {
      const [faq, templates, links] = await Promise.all([loadFaq(), loadTemplates(), getAllLinks()]);
      const hit = matchFaq(text, faq);
      if (hit) {
        console.log(`[conversation] FAQ hit | user=${userId} key="${hit.key}" msg="${text.substring(0, 50)}"`);
        const expanded = stripEmphasis(expandLinks(replaceMarkers(hit.reply, templates), links));
        return {
          reply: expanded,
          newStage: null,
          selectedCourseId: null,
          meta: { source: 'faq', faqKey: hit.key },
        };
      }
    } catch (err) {
      console.error('[conversation] FAQ check failed (continuing):', err.message);
    }
  }
```

- [ ] **Step 3: Update the main try block to load links once + chain all three substitutions in `swap`**

Inside the main `try { ... }` block (after the FAQ short-circuit), replace the `const [examplesPool, templates] = await Promise.all([loadExamples(), loadTemplates()]);` line and the existing `swap` lambda with:

```javascript
    const history = getHistory(userId);
    const [examplesPool, templates, links] = await Promise.all([
      loadExamples(),
      loadTemplates(),
      getAllLinks(),
    ]);
    const examples = pickExamples(examplesPool, stage, 3);
    const swap = (reply) => stripEmphasis(expandLinks(replaceMarkers(reply, templates), links));
```

The five stage branches and the fallback all use `swap(...)` already — no change needed there.

- [ ] **Step 4: Run tests**

```bash
cd upsc-bot && npm run test
```

Expected: still 25-30 PASS / 0 FAIL (depending on Tests 11-14 from earlier tasks).

- [ ] **Step 5: Boot smoke-check**

```bash
cd upsc-bot && timeout 8 npm run dev || true
```

Expected: clean boot, no import errors.

- [ ] **Step 6: Commit**

```bash
git add upsc-bot/src/flows/conversation.js
git commit -m "feat(conversation): chain replaceMarkers → expandLinks → stripEmphasis per turn"
```

---

## Task 7: Append every turn from `handlers/message.js`

**Files:**
- Modify: `upsc-bot/src/handlers/message.js`

After this task, every user text message + every bot reply + every system-generated payment_pending block is appended to the messages subcollection. The buggy first-text-overwrite at lines 76-83 is removed.

- [ ] **Step 1: Add the `appendMessage` import**

In `upsc-bot/src/handlers/message.js`, replace the existing imports block (top 4 lines) with:

```javascript
import { getUser, createUser, updateStage, updateUser } from '../db/users.js';
import { appendMessage } from '../db/messages.js';
import { processMessage } from '../flows/conversation.js';
import { getCourse } from '../db/courses.js';
import { formatPrice } from '../utils/helpers.js';
```

- [ ] **Step 2: Replace the entire `bot.on('text', ...)` handler body**

Replace the handler body (everything inside `bot.on('text', async (ctx) => { ... });`) with this version. The changes vs. the current handler:
1. Appends user message BEFORE running `processMessage`.
2. Destructures `meta` from `processMessage` result.
3. Appends bot reply AFTER sending it.
4. Appends the payment_pending system block as `source:'system'` when it fires.
5. Removes the buggy `if (user.stage === 'new' && newStage === 'engaged') { ... }` block at the bottom.

```javascript
  bot.on('text', async (ctx) => {
    const { id, first_name, username } = ctx.from;
    const text = ctx.message.text;

    if (text.startsWith('/')) return;

    try {
      console.log(`[message] User ${id}: "${text.substring(0, 80)}"`);

      let user = await getUser(id);
      if (!user) {
        user = await createUser(id, {
          name: first_name || '',
          username: username || '',
        });
        console.log(`[message] Auto-created user ${id}`);
      }

      // Log user's incoming message before any processing so it survives a Claude crash
      await appendMessage(id, {
        role: 'user',
        text,
        stage: user.stage || 'new',
        source: 'user',
      });

      await ctx.sendChatAction('typing');

      const { reply, newStage, selectedCourseId, meta } = await processMessage(user, text);

      if (reply) {
        await ctx.reply(reply);
        await appendMessage(id, {
          role: 'bot',
          text: reply,
          stage: user.stage || 'new',
          source: meta?.source || 'claude',
          faqKey: meta?.faqKey,
          model: meta?.model,
        });
      }

      if (newStage && newStage !== user.stage) {
        await updateStage(id, newStage);
        console.log(`[message] User ${id} stage: ${user.stage} → ${newStage}`);

        if (newStage === 'payment_pending' && selectedCourseId) {
          await updateUser(id, { selectedCourseId });

          const course = await getCourse(selectedCourseId);
          if (course) {
            const paymentMsg = [
              `\n💳 Payment Details:`,
              `Course: ${course.name}`,
              `Amount: ${formatPrice(course.price)}`,
              ``,
              `Gift card ka screenshot bhej dijiye yahan 📸`,
              `Verify hote hi access mil jayega ⚡`,
            ].join('\n');
            await ctx.reply(paymentMsg);
            await appendMessage(id, {
              role: 'bot',
              text: paymentMsg,
              stage: newStage,
              source: 'system',
            });
          }
        }
      }
    } catch (err) {
      console.error(`[message] Error for user ${id}:`, err.message);
      await ctx.reply('Sorry, kuch gadbad ho gayi 😅 Please try again!');
    }
  });
```

Note two side-effect changes that match the spec's polite rewrite:
- The payment-detail block previously sent with `parse_mode: 'Markdown'` and bold asterisks. The new version drops `parse_mode` (plain text — matches the rest of the bot) and drops the asterisks. Also the wording softens to "bhej dijiye".

- [ ] **Step 3: Boot smoke-check**

```bash
cd upsc-bot && timeout 8 npm run dev || true
```

Expected: clean boot. No syntax errors.

- [ ] **Step 4: Run tests**

```bash
cd upsc-bot && npm run test
```

Expected: still all PASS (no new test — Test 11 from Task 1 covers the messages CRUD path).

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/handlers/message.js
git commit -m "feat(message): append every turn to messages subcollection + drop buggy name overwrite"
```

---

## Task 8: Append every photo turn from `handlers/photo.js`

**Files:**
- Modify: `upsc-bot/src/handlers/photo.js`

Photo handler gates on `stage==='payment_pending'` and delegates to `flows/payment.js`. We append the user side (`text:'[photo]'`) BEFORE delegating, and we append the bot's stock reply AFTER. The flow's existing `try/catch` stays unchanged; we just wrap appends around it.

- [ ] **Step 1: Read the current `photo.js` to confirm shape**

Open `upsc-bot/src/handlers/photo.js`. Identify:
- The `bot.on('photo', async (ctx) => { ... })` handler block.
- Where `processPaymentScreenshot` (or similar) is called.
- Where the bot replies to the user (e.g. `ctx.reply('Verify hone tak wait kijiye')` — exact text varies).

- [ ] **Step 2: Add the import and wrap appends around the existing flow**

At the top of `upsc-bot/src/handlers/photo.js`, add the import:

```javascript
import { appendMessage } from '../db/messages.js';
```

Inside the photo handler, immediately after fetching the user (existing logic) and BEFORE calling `processPaymentScreenshot` (or whatever the delegate is), add:

```javascript
      await appendMessage(id, {
        role: 'user',
        text: '[photo]',
        stage: user.stage || 'unknown',
        source: 'user',
      });
```

After the bot's reply is sent (find the `ctx.reply(...)` call in the photo handler), capture the reply text in a variable and append it. If the existing code already constructs the reply text as a const/let before sending, reuse that variable. If it inlines the string, lift it to a const first. Then append:

```javascript
      await appendMessage(id, {
        role: 'bot',
        text: replyText,
        stage: user.stage || 'unknown',
        source: 'system',
      });
```

Where `replyText` is the variable holding the reply string. If there are multiple reply branches (e.g. "wait for verification" vs "not in payment_pending stage"), append for each branch.

- [ ] **Step 3: Boot smoke-check**

```bash
cd upsc-bot && timeout 8 npm run dev || true
```

Expected: clean boot.

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/src/handlers/photo.js
git commit -m "feat(photo): append photo turn + bot reply to messages subcollection"
```

---

# Phase 3 — Admin API + UI

## Task 9: Bootstrap-seed the `links` collection

**Files:**
- Create: `upsc-bot/scripts/seed-links.js`

One-time script that seeds 7 placeholder link docs so the admin Links page has rows to edit on day one.

- [ ] **Step 1: Create the seed script**

Create `upsc-bot/scripts/seed-links.js`:

```javascript
/**
 * One-time bootstrap: insert placeholder rows into the Firestore `links`
 * collection. Run once after deploying chat-persistence:
 *
 *   cd upsc-bot && node scripts/seed-links.js
 *
 * Safe to re-run: uses set+merge:false only when the doc does not exist.
 */
import 'dotenv/config';
import { getDb } from '../config/firebase.js';

const SEED = {
  payment_link_phonepe: 'https://example.com/FILL_ME',
  payment_link_paytm: 'https://example.com/FILL_ME',
  payment_link_gpay: 'https://example.com/FILL_ME',
  payment_link_amazon_pay: 'https://example.com/FILL_ME',
  list1_link: 'https://example.com/FILL_ME',
  list2_link: 'https://example.com/FILL_ME',
  payment_proof: 'https://example.com/FILL_ME',
};

async function main() {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  for (const [name, url] of Object.entries(SEED)) {
    const ref = db.collection('links').doc(name);
    const existing = await ref.get();
    if (existing.exists) {
      skipped++;
      console.log(`[seed-links] skip ${name} (exists)`);
      continue;
    }
    await ref.set({
      name,
      url,
      updatedAt: new Date().toISOString(),
    });
    inserted++;
    console.log(`[seed-links] insert ${name}`);
  }
  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-links] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed script**

```bash
cd upsc-bot && node scripts/seed-links.js
```

Expected output: 7 `insert` lines followed by `Done. 7 inserted, 0 skipped.` Subsequent re-runs print `skip` lines.

- [ ] **Step 3: Verify via Test 12**

```bash
cd upsc-bot && npm run test
```

Test 12 (Links loader) still passes. It tests with a different `__test_link_*` doc — the seed rows don't interfere.

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/scripts/seed-links.js
git commit -m "chore(seed): bootstrap links collection with 7 placeholder rows"
```

---

## Task 10: Build `app/api/messages/route.js`

**Files:**
- Create: `upsc-admin/app/api/messages/route.js`

GET-only endpoint that returns a user's messages, newest-first, with optional `before` cursor for pagination.

- [ ] **Step 1: Create the route file**

Create `upsc-admin/app/api/messages/route.js`:

```javascript
/**
 * Messages API — read a user's chat history (newest-first).
 *
 * GET /api/messages?telegramId=<id>&limit=100&before=<iso-ts>
 *   - telegramId: required
 *   - limit: optional (default 100, max 500)
 *   - before: optional ISO timestamp; returns messages strictly older
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get("telegramId");
    const limitRaw = Number(searchParams.get("limit") || 100);
    const limit = Math.min(Math.max(limitRaw, 1), 500);
    const before = searchParams.get("before");

    if (!telegramId) {
      return NextResponse.json({ error: "Missing telegramId" }, { status: 400 });
    }

    const db = getDb();
    let q = db
      .collection("users")
      .doc(String(telegramId))
      .collection("messages")
      .orderBy("ts", "desc");
    if (before) q = q.where("ts", "<", before);
    q = q.limit(limit);

    const snap = await q.get();
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[Messages API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Smoke-test via curl (optional)**

If the admin is running locally on port 3001 and you have a logged-in session cookie, you can hit it. Otherwise rely on the page test in Task 13.

- [ ] **Step 3: Commit**

```bash
git add upsc-admin/app/api/messages/route.js
git commit -m "feat(api): add messages GET endpoint with pagination"
```

---

## Task 11: Extend `/api/users` to support `?telegramId=<id>`

**Files:**
- Modify: `upsc-admin/app/api/users/route.js`

Allow the chat viewer page to fetch a single user's full info in one call.

- [ ] **Step 1: Read the current `route.js`**

Open `upsc-admin/app/api/users/route.js`. Identify the `GET` export. It currently fetches up to 100 users ordered by `createdAt desc`.

- [ ] **Step 2: Add the single-user branch at the top of `GET`**

Modify the `GET` function so that if `telegramId` is present in the query string, it returns just that one user (as `{ user: {...} }` for clarity vs the list-form `{ users: [...] }`):

```javascript
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get("telegramId");

    const db = getDb();

    if (telegramId) {
      const doc = await db.collection("users").doc(String(telegramId)).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ user: { id: doc.id, ...doc.data() } });
    }

    // existing list path (preserved)
    const snapshot = await db.collection("users").orderBy("createdAt", "desc").limit(100).get();
    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[Users API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

(The exact wording of the imports/header above `GET` is whatever the current file has — preserve it.)

- [ ] **Step 3: Commit**

```bash
git add upsc-admin/app/api/users/route.js
git commit -m "feat(api): users GET supports ?telegramId for single-user lookup"
```

---

## Task 12: Build `app/api/links/route.js`

**Files:**
- Create: `upsc-admin/app/api/links/route.js`

CRUD on the `links` collection. Same pattern as `app/api/courses/route.js`.

- [ ] **Step 1: Create the file**

Create `upsc-admin/app/api/links/route.js`:

```javascript
/**
 * Links API — CRUD on the Firestore links collection.
 *
 * GET                           → list all links
 * POST   { name, url, label? }  → create
 * PATCH  { name, url?, label? } → update (name is the doc ID)
 * DELETE ?name=<name>           → delete
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/firebase";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const snap = await db.collection("links").get();
    const links = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ links });
  } catch (error) {
    console.error("[Links API GET] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, url, label } = body;
    if (!name || !url) {
      return NextResponse.json({ error: "Missing name or url" }, { status: 400 });
    }

    const db = getDb();
    const ref = db.collection("links").doc(name);
    const existing = await ref.get();
    if (existing.exists) {
      return NextResponse.json({ error: "Link with that name already exists" }, { status: 409 });
    }

    const doc = {
      name,
      url,
      ...(label ? { label } : {}),
      updatedAt: new Date().toISOString(),
    };
    await ref.set(doc);
    return NextResponse.json({ success: true, data: { id: name, ...doc } });
  } catch (error) {
    console.error("[Links API POST] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, ...updates } = body;
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const db = getDb();
    await db.collection("links").doc(name).set(
      {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Links API PATCH] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const db = getDb();
    await db.collection("links").doc(name).delete();
    return NextResponse.json({ success: true, deleted: name });
  } catch (error) {
    console.error("[Links API DELETE] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add upsc-admin/app/api/links/route.js
git commit -m "feat(api): add links CRUD endpoint"
```

---

## Task 13: Build `app/(dashboard)/users/[telegramId]/page.js` (chat viewer)

**Files:**
- Create: `upsc-admin/app/(dashboard)/users/[telegramId]/page.js`

Per the spec: user info card + chronological message bubbles + manual Refresh + "Load older" pagination.

- [ ] **Step 1: Create the page file**

Create `upsc-admin/app/(dashboard)/users/[telegramId]/page.js`:

```javascript
"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";

const sourceBadge = {
  user: "bg-slate-700 text-slate-300",
  claude: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  faq: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  template: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  system: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
};

export default function ChatViewer({ params }) {
  const { telegramId } = use(params);

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, mRes] = await Promise.all([
        fetch(`/api/users?telegramId=${telegramId}`),
        fetch(`/api/messages?telegramId=${telegramId}&limit=100`),
      ]);
      if (!uRes.ok) throw new Error(`User fetch failed: ${uRes.status}`);
      if (!mRes.ok) throw new Error(`Messages fetch failed: ${mRes.status}`);
      const uData = await uRes.json();
      const mData = await mRes.json();
      setUser(uData.user);
      // API returns newest-first; render oldest-first
      setMessages([...mData.messages].reverse());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [telegramId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOlder = async () => {
    if (messages.length === 0) return;
    const oldestTs = messages[0].ts;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/messages?telegramId=${telegramId}&limit=100&before=${encodeURIComponent(oldestTs)}`,
      );
      if (!res.ok) throw new Error(`Older fetch failed: ${res.status}`);
      const data = await res.json();
      // Prepend (still oldest-first display)
      setMessages((prev) => [...[...data.messages].reverse(), ...prev]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-400">Loading…</div>;
  }
  if (error) {
    return <div className="p-8 text-red-400">Error: {error}</div>;
  }
  if (!user) {
    return <div className="p-8 text-slate-400">User not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link href="/users" className="text-blue-400 hover:text-blue-300">← Back to Users</Link>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
        >
          🔄 Refresh
        </button>
      </div>

      {/* User info card */}
      <div className="bg-[#1e293b] border border-slate-700 rounded-lg p-4 mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-slate-100">{user.name || "Unknown"}</h2>
          {user.username && <span className="text-slate-400">@{user.username}</span>}
        </div>
        <div className="mt-2 text-sm text-slate-400 space-y-1">
          <div>Stage: <span className="text-slate-200">{user.stage}</span></div>
          <div>Joined: <span className="text-slate-200">{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</span></div>
          <div>Last seen: <span className="text-slate-200">{user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "—"}</span></div>
          <div>Paid courses: <span className="text-slate-200">{user.paidCourseIds?.length ? user.paidCourseIds.join(", ") : "—"}</span></div>
        </div>
      </div>

      {/* Load older */}
      {messages.length > 0 && (
        <div className="flex justify-center mb-4">
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50"
          >
            {loadingOlder ? "Loading…" : "Load older"}
          </button>
        </div>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No messages yet.</div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-lg p-3 ${
                m.role === "user" ? "bg-slate-800 border border-slate-700" : "bg-blue-900/30 border border-blue-800/50"
              }`}>
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
                  <span>{new Date(m.ts).toLocaleString()}</span>
                  <span>·</span>
                  <span>{m.stage}</span>
                  <span>·</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${sourceBadge[m.source] || sourceBadge.system}`}>
                    {m.source}
                  </span>
                  {m.faqKey && <span className="text-purple-300 text-[10px]">key: {m.faqKey}</span>}
                </div>
                <div className="text-slate-100 whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Notes for Next.js 16:
- `use(params)` from React unwraps the dynamic params (Next.js 16 made params a Promise).
- The page is a Client Component (`"use client"`) since it uses `useState` / `useEffect` / event handlers.

- [ ] **Step 2: Smoke-test in the admin**

```bash
cd upsc-admin && npm run dev
```

Open `http://localhost:3001`, log in, manually navigate to `/users/<some-test-telegram-id>` for a user that has at least one message in their subcollection. Confirm: user card renders, messages render with bubbles + source badges, "Refresh" button works, "Load older" appears (clicking it on a user with <100 msgs returns nothing — that's fine).

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add upsc-admin/app/\(dashboard\)/users/\[telegramId\]/page.js
git commit -m "feat(admin): add /users/[telegramId] chat viewer page"
```

---

## Task 14: Build `app/(dashboard)/links/page.js` (links CRUD)

**Files:**
- Create: `upsc-admin/app/(dashboard)/links/page.js`

- [ ] **Step 1: Create the page**

Create `upsc-admin/app/(dashboard)/links/page.js`:

```javascript
"use client";

import { useEffect, useState } from "react";

export default function LinksPage() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingName, setAddingName] = useState("");
  const [addingUrl, setAddingUrl] = useState("");
  const [addingLabel, setAddingLabel] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      setLinks([...data.links].sort((a, b) => a.id.localeCompare(b.id)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addLink = async () => {
    if (!addingName.trim() || !addingUrl.trim()) return;
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addingName.trim(), url: addingUrl.trim(), label: addingLabel.trim() || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Add failed");
      return;
    }
    setAddingName("");
    setAddingUrl("");
    setAddingLabel("");
    await load();
  };

  const startEdit = (link) => {
    setEditingId(link.id);
    setEditUrl(link.url || "");
    setEditLabel(link.label || "");
  };

  const saveEdit = async () => {
    const res = await fetch("/api/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingId, url: editUrl, label: editLabel || undefined }),
    });
    if (!res.ok) {
      alert("Update failed");
      return;
    }
    setEditingId(null);
    await load();
  };

  const deleteLink = async (name) => {
    if (!confirm(`Delete link "${name}"?`)) return;
    const res = await fetch(`/api/links?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    await load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Links</h1>

      {/* Add row */}
      <div className="bg-[#1e293b] border border-slate-700 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Add a new link</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            placeholder="name (e.g. payment_link_phonepe)"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500"
          />
          <input
            value={addingUrl}
            onChange={(e) => setAddingUrl(e.target.value)}
            placeholder="https://…"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 md:col-span-2"
          />
          <input
            value={addingLabel}
            onChange={(e) => setAddingLabel(e.target.value)}
            placeholder="label (optional)"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500"
          />
        </div>
        <button
          onClick={addLink}
          className="mt-3 px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium"
        >
          Add
        </button>
      </div>

      {loading && <div className="text-slate-400">Loading…</div>}
      {error && <div className="text-red-400">Error: {error}</div>}

      {!loading && !error && (
        <div className="bg-[#1e293b] border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-slate-200">{link.id}</td>
                  <td className="px-4 py-3 text-slate-300 break-all">
                    {editingId === link.id ? (
                      <input
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100"
                      />
                    ) : (
                      link.url
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {editingId === link.id ? (
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100"
                      />
                    ) : (
                      link.label || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {link.updatedAt ? new Date(link.updatedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {editingId === link.id ? (
                      <>
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-300">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(link)} className="text-blue-400 hover:text-blue-300">Edit</button>
                        <button onClick={() => deleteLink(link.id)} className="text-red-400 hover:text-red-300">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No links yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

Start the admin (`cd upsc-admin && npm run dev`), log in, navigate to `/links`. Should see the 7 seeded rows (after Task 9 ran). Test: Edit one row's URL → Save → URL updates and `updatedAt` bumps. Delete a row (use a test row, not a real one). Add a row.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add upsc-admin/app/\(dashboard\)/links/page.js
git commit -m "feat(admin): add /links CRUD page"
```

---

## Task 15: Add "Links" entry to Sidebar

**Files:**
- Modify: `upsc-admin/components/Sidebar.js`

- [ ] **Step 1: Add the entry**

In `upsc-admin/components/Sidebar.js`, find the `navItems` array (around line 7):

```javascript
const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/users", label: "Users", icon: "👥" },
  { href: "/courses", label: "Courses", icon: "📚" },
  { href: "/payments", label: "Payments", icon: "💳" },
  { href: "/broadcast", label: "Broadcast", icon: "📢" },
];
```

Add a new entry between Courses and Payments:

```javascript
const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/users", label: "Users", icon: "👥" },
  { href: "/courses", label: "Courses", icon: "📚" },
  { href: "/links", label: "Links", icon: "🔗" },
  { href: "/payments", label: "Payments", icon: "💳" },
  { href: "/broadcast", label: "Broadcast", icon: "📢" },
];
```

- [ ] **Step 2: Verify the link works**

Run admin, log in, click "Links" in the sidebar. Confirm `/links` opens.

- [ ] **Step 3: Commit**

```bash
git add upsc-admin/components/Sidebar.js
git commit -m "feat(admin): add Links entry to Sidebar"
```

---

## Task 16: Make UserTable rows clickable

**Files:**
- Modify: `upsc-admin/components/UserTable.js`

Each row links to `/users/[telegramId]`. The table is currently a server component (no `"use client"`). To use `next/link` or `onClick`, we need to either add `"use client"` or use a Link-wrapped cell. The cleanest approach in Next.js App Router: wrap the row in a Next.js `<Link>`, which works as a server component.

Actually since `<tr>` cannot be a child of `<Link>` (invalid HTML), the simplest fix is to add `"use client"` at the top and use `useRouter().push()` on row click.

- [ ] **Step 1: Convert UserTable to a client component with row navigation**

Replace the contents of `upsc-admin/components/UserTable.js` with:

```javascript
"use client";

import { useRouter } from "next/navigation";

export const badgeColors = {
  new: "bg-slate-700 text-slate-300",
  engaged: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  interested: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  payment_pending: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  paid: "bg-green-500/20 text-green-400 border border-green-500/30",
};

export default function UserTable({ users = [], compact = false }) {
  const router = useRouter();

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No users found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-sm text-left whitespace-nowrap">
        <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 border-b border-slate-700">
          <tr>
            <th className="px-4 md:px-6 py-3 md:py-4 font-semibold rounded-tl-lg">UserName</th>
            {!compact && <th className="px-6 py-4 font-semibold">Username</th>}
            <th className="px-4 md:px-6 py-3 md:py-4 font-semibold">Stage</th>
            {!compact && <th className="px-6 py-4 font-semibold text-center">Paid</th>}
            <th className={`px-4 md:px-6 py-3 md:py-4 font-semibold text-right ${compact ? "rounded-tr-lg" : ""}`}>Joined</th>
            {!compact && <th className="px-6 py-4 font-semibold text-right">Last Seen</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {users.map((user, i) => {
            const tid = user.telegramId || user.id;
            return (
              <tr
                key={user.id || i}
                onClick={() => tid && router.push(`/users/${tid}`)}
                className="hover:bg-slate-800/30 transition-colors cursor-pointer"
              >
                <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-slate-200">
                  {user.name || "Unknown"}
                </td>
                {!compact && (
                  <td className="px-6 py-4 text-slate-400">
                    {user.username ? `@${user.username}` : "—"}
                  </td>
                )}
                <td className="px-4 md:px-6 py-3 md:py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${badgeColors[user.stage] || badgeColors.new}`}>
                    {user.stage || "new"}
                  </span>
                </td>
                {!compact && (
                  <td className="px-6 py-4 text-center">
                    {user.isPaid ? (
                      <span className="text-green-500 font-bold">✓ Yes</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 md:px-6 py-3 md:py-4 text-right text-slate-400">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </td>
                {!compact && (
                  <td className="px-6 py-4 text-right text-slate-400 text-xs">
                    {user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

Two behavior tweaks in this rewrite (besides the click navigation):
1. The "UserName" column now shows `user.name` instead of the buggy `user.username` in the original.
2. `cursor-pointer` on rows so the click affordance is visible.

- [ ] **Step 2: Smoke-test**

Start admin, log in, navigate to `/users`. Click a row → should navigate to `/users/<telegramId>`. Click "Back to Users" on the chat viewer → returns to `/users`.

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add upsc-admin/components/UserTable.js
git commit -m "feat(admin): UserTable rows navigate to chat viewer + fix name column"
```

---

# Phase 4 — Tone polish + markdown rule

## Task 17: Rewrite STAGE_PROMPTS in polite register + no-Markdown rule

**Files:**
- Modify: `upsc-bot/src/ai/prompts.js`

Only the `STAGE_PROMPTS` object body changes. Imports, docblock, and `buildConversationPrompt` stay as-is. Every stage gets a new universal rule appended: "NEVER use Markdown / asterisks (`**bold**`, `*italic*`) for emphasis — Telegram chat is plain text."

- [ ] **Step 1: Replace the STAGE_PROMPTS object**

In `upsc-bot/src/ai/prompts.js`, replace the entire `export const STAGE_PROMPTS = { ... };` block with:

```javascript
export const STAGE_PROMPTS = {

  new: `You are "UPSC Helping Hand (Aspirant)" — a UPSC course seller chatting on Telegram. Replies are SHORT (often 1-3 words, sometimes 2-3 separate sends). Mixed register OK: bhai / aap / yaar. No formal English, no "I am an AI", no "How may I assist".

This student just messaged for the first time. Reply with a short greeting only.

RULES:
- 1-3 words is fine ("Hi", "Hiii", "Hello bhai")
- Don't ask for name or attempt year
- Don't pitch courses yet — let them ask
- Don't force a question at the end
- NEVER use Markdown or asterisks (**bold**, *italic*) for emphasis — Telegram chat is plain text
- Use polite words like "kariye", "kar dijiye", "karna" — avoid curt "kr" / "krna" shortenings`,

  engaged: `You are "UPSC Helping Hand (Aspirant)". Student has greeted and is warming up.

Reply VERY short. Match the operator's style:
- "Hi" / "Yes bhai" / "Konsa course chahiye"
- One brief polite line probing what they want (course / subject / faculty)

RULES:
- Stay short — usually under 8 words per send
- Mixed register OK but lean polite: "bhai", "aap", "yaar"
- Don't dump the catalog yet — wait for course/price/combo/optional keywords
- Use full polite verbs: "bataiye", "kariye", "kar dijiye" — avoid "kr" / "krna"
- NEVER use Markdown or asterisks for emphasis — plain text only`,

  interested: `You are "UPSC Helping Hand (Aspirant)". Student is asking about courses, prices, or combos.

Available catalog:
{{COURSE_CATALOG}}

Your job:
1. Pitch the right course/combo. For combo questions ("all coaching", "gs combo", "kitna lagega") emit {{TEMPLATE:combo_pitch_1499}}.
2. Quote prices in 1-line replies: "Price 250 for ethics", "Anthro price 400", "Karandeep Sir batch 650".
3. Negotiate politely when asked. For old member or buying multiple, soften ("500 for old members", "2500 kar dijiye for 2 IDs"). Don't go below pricing.floor.
4. When student commits to a specific course, emit [SELECTED_COURSE:<id>] in your reply. Example: "1499 wala" → "Okay\\nPayment kar dijiye\\n[SELECTED_COURSE:combo-all-1499]". The tag is stripped before the user sees it.

RULES:
- SHORT replies. Often 1 line. Sometimes 2-3 short lines split by newlines.
- Mixed register, lean polite: "bhai", "aap", "yaar"
- Prefer template markers for payment instructions over freehand
- Use polite verbs: "kar dijiye", "kariye", "karwa dijiye" — avoid "kr" / "krwa do"
- Don't overuse questions — state the offer or price
- NEVER use Markdown or asterisks for emphasis — plain text only`,

  payment_pending: `You are "UPSC Helping Hand (Aspirant)". Student has chosen a course; payment via gift card pending.

Your job:
1. If they ask how to pay → emit {{TEMPLATE:gift_card_notice}} then {{TEMPLATE:payment_mode_menu}} then {{TEMPLATE:payment_proof}}.
2. If they pick a mode (Phonepe / Paytm / GPay / Amazon pay) → emit the matching {{TEMPLATE:payment_link_<mode>}}.
3. If they're slow or asking questions → polite nudge: "Payment kar dijiye please", "Abhi kar dijiye?".
4. If they say payment done → "Code copy share kar dijiye".

RULES:
- 1-3 line replies
- Use template markers verbatim — DO NOT paraphrase the gift-card notice or payment links
- Polite: "bhai", "aap", "kar dijiye", "bhej dijiye"
- Don't claim auto-verify — just confirm receipt
- NEVER use Markdown or asterisks for emphasis — plain text only`,

  paid: `You are "UPSC Helping Hand (Aspirant)". Student has paid and is now a member.

Reply patterns from real chats:
- "Welcome bhai 👍" / "Join kar lijiye brother"
- Lifetime/updates question → {{TEMPLATE:lifetime_updates}}
- General doubts → short helpful answer
- "Thank you" → "Welcome bhai 👍"

For UPSC-content questions, give a short helpful answer referencing standard sources (Laxmikanth, Spectrum, Shankar IAS, NCERTs) when relevant. Keep replies SHORT — this operator does not lecture.

RULES:
- 1-4 short lines
- Mixed register, lean polite: "bhai", "aap"
- Polite verbs: "kar dijiye", "kariye", "padhiye"
- Don't force a question at the end
- NEVER use Markdown or asterisks for emphasis — plain text only`,
};
```

- [ ] **Step 2: Run tests + smoke-check**

```bash
cd upsc-bot && npm run test
```

Expected: all PASS. (Prompt content isn't directly tested.)

```bash
cd upsc-bot && timeout 8 npm run dev || true
```

Boot clean.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/src/ai/prompts.js
git commit -m "feat(prompts): polite -iye/karo register + universal no-Markdown rule"
```

---

## Task 18: Polite-tone rewrite of `templates.json`

**Files:**
- Modify: `upsc-bot/training/templates.json`

Soften curt phrases. Keys unchanged.

- [ ] **Step 1: Replace `templates.json` with the polite version**

Open `upsc-bot/training/templates.json`. Replace its entire contents with:

```json
{
  "combo_pitch_1499": "All Coaching GS + Optional Combo\nList 1 ~ {{list1_link}}\n\nAll subject Delhi Top Faculty Package\nList 2 ~ {{list2_link}}\n\n1499 mein dono list + ek optional subject ka access milega\n999 mein sirf list 2 milega\n\nKonsa combo chahiye, bataiye",
  "combo_pitch_999": "All subject Delhi Top Faculty Package\nList 2 ~ {{list2_link}}\n\n999 mein sirf list 2 milega",
  "gift_card_notice": "Safety reasons ki wajah se UPI / QR payment accept nahi kar paate.\nSirf gift card accept hota hai 🙏🙏",
  "lifetime_updates": "Haan ji, lifetime access hai\nUpdates 1 year ka — 2026 mains tak milte rahenge",
  "payment_link_gpay": "G Pay ~ Fk\n\nPayment Link 🖇️ ~ {{link}}\n\nFor 50, 200, 500, 1000",
  "payment_link_paytm": "Paytm App\n\nPayment Link 🖇️ ~ {{link}}",
  "payment_link_phonepe": "Phonepe App\n\nPayment Link 🖇️ ~ {{link}}\n\nLess Than 500",
  "payment_link_amazon_pay": "Amazon Pay\n\nPayment Link 🖇️ ~ {{link}}",
  "payment_mode_menu": "Konsa payment mode use karte hain aap?\n\n1) Phonepe\n2) Paytm\n3) Amazon pay",
  "payment_proof": "Payment Proof 🧾\n\nDekhne ke liye ~ {{link}}",
  "post_payment_access": "Welcome bhai 👍\nJoin link ~ {{link}}\nUpdates milte rahenge"
}
```

11 keys (same count as before). All curt phrases softened (`Krna do bhai` → `Payment kar dijiye`, `Konsa combo chahiye isme se` → `Konsa combo chahiye, bataiye`, etc.).

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('upsc-bot/training/templates.json','utf-8'))"
```

Expected: no output (silent success). Any output means JSON syntax error.

- [ ] **Step 3: Run tests**

```bash
cd upsc-bot && npm run test
```

Expected: still PASS, Test 6 reports `loadTemplates — returned object with 11 keys`.

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/training/templates.json
git commit -m "feat(training): polite-tone rewrite of templates.json"
```

---

## Task 19: Polite-tone rewrite of `examples.json`

**Files:**
- Modify: `upsc-bot/training/examples.json`

Soften the operator-side replies in each example. User-side text stays verbatim (it's how customers actually talk). `[SELECTED_COURSE:<id>]` and `{{TEMPLATE:<key>}}` markers stay intact.

- [ ] **Step 1: Replace `examples.json` with the polite version**

Open `upsc-bot/training/examples.json`. Replace contents with:

```json
[
  { "stage": "new", "user": "Hello", "reply": "Hi", "addedAt": "2026-06-09", "tags": ["greeting"] },
  { "stage": "new", "user": "Hello bhaiya", "reply": "Hi", "addedAt": "2026-06-09", "tags": ["greeting"] },
  { "stage": "new", "user": "Hello !", "reply": "Hiii", "addedAt": "2026-06-09", "tags": ["greeting"] },
  { "stage": "engaged", "user": "Course chahiye tha mujhse bhai", "reply": "Konsa course chahiye bhai, bataiye", "addedAt": "2026-06-09", "tags": ["probe"] },
  { "stage": "interested", "user": "Final amount kitna lagega", "reply": "{{TEMPLATE:combo_pitch_1499}}", "addedAt": "2026-06-09", "tags": ["combo_pitch"] },
  { "stage": "interested", "user": "Aapke pass koi gs all coaching combo hoga", "reply": "{{TEMPLATE:combo_pitch_1499}}", "addedAt": "2026-06-09", "tags": ["combo_pitch"] },
  { "stage": "interested", "user": "1499 wala", "reply": "Okay\nPayment kar dijiye\n[SELECTED_COURSE:combo-all-1499]", "addedAt": "2026-06-09", "tags": ["close"] },
  { "stage": "interested", "user": "Bhai 2k me done kardo", "reply": "Thik hai bhai\nPayment kar dijiye\nAbhi kar denge?", "addedAt": "2026-06-09", "tags": ["negotiation"] },
  { "stage": "interested", "user": "Do log le rahe. Thoda kam kar dijiye", "reply": "2500 kar dijiye bhai\nOptional bhi rahega dono ka", "addedAt": "2026-06-09", "tags": ["negotiation"] },
  { "stage": "interested", "user": "I want anthropology course. I was already a member", "reply": "Karandeep Sir batch 650\n500 for old members\nAaj ke liye", "addedAt": "2026-06-09", "tags": ["old_member"] },
  { "stage": "payment_pending", "user": "How to pay", "reply": "{{TEMPLATE:gift_card_notice}}\n\n{{TEMPLATE:payment_mode_menu}}\n\n{{TEMPLATE:payment_proof}}", "addedAt": "2026-06-09", "tags": ["payment_script"] },
  { "stage": "payment_pending", "user": "Phonepe", "reply": "{{TEMPLATE:payment_link_phonepe}}", "addedAt": "2026-06-09", "tags": ["payment_link"] },
  { "stage": "payment_pending", "user": "Paytm", "reply": "{{TEMPLATE:payment_link_paytm}}", "addedAt": "2026-06-09", "tags": ["payment_link"] },
  { "stage": "payment_pending", "user": "Google pay ke through hojaegi kya payment", "reply": "Haan bhai\n{{TEMPLATE:payment_link_gpay}}", "addedAt": "2026-06-09", "tags": ["payment_link"] },
  { "stage": "payment_pending", "user": "I've done the payment", "reply": "{{TEMPLATE:post_payment_access}}\nGift card code share kar dijiye", "addedAt": "2026-06-09", "tags": ["post_payment"] },
  { "stage": "paid", "user": "Lifetime access h na bhaii", "reply": "{{TEMPLATE:lifetime_updates}}", "addedAt": "2026-06-09", "tags": ["post_sale_qa"] },
  { "stage": "paid", "user": "Thank you bhaiya", "reply": "Welcome bhai 👍", "addedAt": "2026-06-09", "tags": ["thanks"] }
]
```

17 examples (same count). All operator-side replies softened. `addedAt` bumped to today.

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('upsc-bot/training/examples.json','utf-8'))"
```

Expected: silent success.

- [ ] **Step 3: Run tests**

```bash
cd upsc-bot && npm run test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/training/examples.json
git commit -m "feat(training): polite-tone rewrite of examples.json"
```

---

## Task 20: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Document the new artifacts and CLOSE the two Known Limitations resolved by this work.

- [ ] **Step 1: Update the Known limitations section**

In `CLAUDE.md`, find the `## Known limitations` section. Find the two bullets:

1. **"Conversation history is in-memory."** — UPDATE this bullet to say:
```markdown
- **Conversation history is now persisted to Firestore** (added 2026-06-09). Each turn writes to `users/{telegramId}/messages/{auto-id}` with full context (stage, source, faqKey, model). The legacy in-memory ring buffer in `flows/conversation.js:10` still serves the Claude history-window (last 10 messages), but durability + admin viewing now flow through Firestore.
```

2. **"Inner template placeholders are not substituted at runtime."** — UPDATE this bullet to say:
```markdown
- **Inner template placeholders are now substituted at runtime** (added 2026-06-09). `flows/conversation.js` chains `replaceMarkers → expandLinks → stripEmphasis` per turn; `expandLinks` reads the `links` Firestore collection (managed via the admin `/links` page) and swaps `{{link}}` / `{{list1_link}}` / `{{list2_link}}` etc. with live URLs.
```

- [ ] **Step 2: Insert a new section before "## Known limitations"**

Insert this section immediately before the `## Known limitations` heading:

```markdown
## Chat persistence + admin viewer (added 2026-06-09)

Every conversation turn is appended to `users/{telegramId}/messages/{auto-id}` in Firestore. Each doc carries `{ role, text, ts, stage, source, faqKey?, model? }` where `source` is one of `user | claude | faq | template | system`. Writes happen in `handlers/message.js` (user msg before processing, bot reply after) and `handlers/photo.js` (photo turn).

Admin viewer at `/users/[telegramId]`: user info card + chronological bubbles + Refresh button + "Load older" paginated by `?before=<ts>`. Click any row in `/users` to navigate.

API: `GET /api/messages?telegramId=<id>&limit=100&before=<iso>`. `GET /api/users?telegramId=<id>` returns a single user.

## Links store (added 2026-06-09)

Firestore `links/{name}` collection with `{ name, url, label?, updatedAt }`. Managed via the admin `/links` page (full CRUD). Bot's substitution chain calls `getAllLinks()` once per turn and feeds the map into `expandLinks(text, links)` after `replaceMarkers`. Bootstrap seed: `node upsc-bot/scripts/seed-links.js` inserts 7 placeholder rows (`payment_link_phonepe`, `payment_link_paytm`, `payment_link_gpay`, `payment_link_amazon_pay`, `list1_link`, `list2_link`, `payment_proof`) — operator replaces the `https://example.com/FILL_ME` URLs via the admin UI before going live.

## Bot output guarantees (added 2026-06-09)

- Every Claude reply runs through `replaceMarkers → expandLinks → stripEmphasis` before being sent.
- `stripEmphasis` (in `src/training/sanitize.js`) removes any leftover `**bold**` / `*italic*` Markdown the model produced. STAGE_PROMPTS also instruct the model not to use Markdown — plain Telegram text only.
- Tone register is polite: `kr` → `kariye` / `kar dijiye`, `krwa do` → `karwa dijiye`. Operator-side examples in `training/examples.json` reflect this.

```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): document chat persistence + links + bot output guarantees"
```

---

## Task 21: Final smoke test

**Files:** (none — verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd upsc-bot && npm run test
```

Expected output includes PASS for:
- Tests 1-10 (existing — env, courses, Firebase, Claude, helpers, training loader, templates, FAQ, examples, seeder)
- Test 11: Messages CRUD (3 assertions)
- Test 12: Links loader (1 assertion)
- Test 13: stripEmphasis (5 assertions)
- Test 14: expandLinks (3 assertions)

Total: 37+ PASS, 0 FAIL.

- [ ] **Step 2: Boot the bot**

```bash
cd upsc-bot && timeout 12 npm run dev || true
```

Expected boot log includes:
```
[boot] ✅ Firebase ready
[claude] Initialized with claude-haiku-4-5
[courses] Loaded production catalog (8 courses)
[courses] Seeding complete — N new, M updated
[boot] ✅ All handlers registered (admin → start → photo → text)
```

Stop with Ctrl+C / let timeout fire.

- [ ] **Step 3: Boot the admin**

```bash
cd upsc-admin && npm run dev
```

Navigate to `http://localhost:3001`, log in.

Verify:
- Sidebar shows the new "Links" entry.
- `/users` rows are clickable; clicking navigates to `/users/<telegramId>`.
- `/users/<telegramId>` shows user card + messages (or empty state for a user with no messages).
- "Refresh" button on the chat viewer works.
- `/links` shows the 7 seeded rows.
- Editing a link's URL persists.

Stop the dev server.

- [ ] **Step 4: Simulator dry-run (optional)**

If `ENABLE_SIMULATOR=true` in `upsc-bot/.env`, hit `http://127.0.0.1:3000/sim` and test:
- "Hello" → expect a short greeting ("Hi", "Hiii"), no `**` asterisks visible.
- "kitna lagega" → expect a 1499/999 combo pitch with `{{list1_link}}` / `{{list2_link}}` swapped for the URLs you set in `/links` (or `https://example.com/FILL_ME` if you haven't replaced them yet).
- "lifetime access?" → FAQ short-circuit hit, reply matches the lifetime template with link expansion applied.

Verify via the admin chat viewer at `/users/<simulator-user-id>` that the messages show up after a hard refresh.

- [ ] **Step 5: Git log review**

```bash
git log --oneline -25
```

Expected: ~22 commits from Task 1 through Task 20 plus the pre-flight start.js cleanup if any. All on `main`, linear, all related to this work.

- [ ] **Step 6: Working tree check**

```bash
git status
```

Expected: clean working tree (or only `.claude/settings.local.json` as a pre-existing unrelated modification).

---

## What's deliberately NOT in this plan

- Real-time Firestore listeners in the admin chat viewer (manual refresh only per spec).
- Admin reply-from-viewer (read-only per spec).
- Search/full-text across chats (out of scope).
- Message edit / delete from admin UI (append-only per spec).
- Auto-translation or sentiment.
- TTL / retention policy on the messages subcollection (deferred — see spec Risks #4).

## Post-plan follow-ups for the operator

1. Replace the 7 placeholder URLs (`https://example.com/FILL_ME`) in the `links` collection with real live payment / list links via `/links`.
2. Optionally delete the 3 orphan Firestore course docs (`prelims-2026`, `mains-answer-writing`, `current-affairs-monthly`) via Firebase console — they remain visible in the `interested` stage catalog otherwise.
3. The buggy "first text becomes name" code at the old `handlers/message.js:78-82` is gone after Task 7. If any existing users have a corrupted `name` field (e.g. `name: 'hello'`), clean those up manually in Firestore or via a one-off script.
