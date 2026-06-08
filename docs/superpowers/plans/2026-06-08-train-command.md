# `/train` Command + Training Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/train` slash command that ingests admin chat transcripts and proposes per-group diffs to update bot persona, courses, canned payment templates, and FAQ — plus the runtime substrate that lets the bot use those artifacts at conversation time.

**Architecture:** Three phases. Phase 1 stands up the training substrate — a new `upsc-bot/training/` directory with four JSON artifacts (examples, templates, faq, transcript corpus), a small `src/training/` module that loads/uses them, and runtime hooks in `prompts.js` + `flows/conversation.js` so the bot reads training data on every turn. Phase 2 creates `.claude/commands/train.md` — a Claude Code slash command whose body walks the ingest → parse/redact → extract → diff → approve → apply → commit pipeline with the human in the loop. Phase 3 bootstraps the live system using the operator's already-pasted chat samples — rewriting persona to "UPSC Helping Hand (Aspirant)" in the operator's actual register, importing the real catalog (1499/999 combos + faculty lectures), and extracting the gift-card payment script.

**Tech Stack:** Node.js ESM, Telegraf 4.x, `@anthropic-ai/sdk` (Claude Haiku 4.5), `firebase-admin`, file-based JSON for training data, single `node src/test-local.js` test runner (no new framework).

---

## Pre-flight

Before starting, verify the working tree is clean and on `main`:

```bash
git status
git branch --show-current
```

Expected: clean working tree, branch `main`. If not, stash or branch off before proceeding.

---

# Phase 1 — Runtime Substrate

## Task 1: Create the `training/` directory skeleton

**Files:**
- Create: `upsc-bot/training/transcripts/.gitkeep`
- Create: `upsc-bot/training/transcripts/.processed`
- Create: `upsc-bot/training/examples.json`
- Create: `upsc-bot/training/templates.json`
- Create: `upsc-bot/training/faq.json`

- [ ] **Step 1: Create directory and empty marker files**

```bash
mkdir -p upsc-bot/training/transcripts
```

Write `upsc-bot/training/transcripts/.gitkeep` (empty file, just so the empty directory is tracked by git).

Write `upsc-bot/training/transcripts/.processed`:
```
```
(literally empty — newline-delimited list of ingested filenames, will fill as `/train` runs)

- [ ] **Step 2: Write empty `examples.json` as a JSON array**

`upsc-bot/training/examples.json`:
```json
[]
```

- [ ] **Step 3: Write empty `templates.json` as a JSON object**

`upsc-bot/training/templates.json`:
```json
{}
```

- [ ] **Step 4: Write empty `faq.json` as a JSON object**

`upsc-bot/training/faq.json`:
```json
{}
```

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/training/
git commit -m "feat(training): scaffold training/ directory with empty JSON artifacts"
```

---

## Task 2: Build `src/training/loader.js`

**Files:**
- Create: `upsc-bot/src/training/loader.js`
- Modify: `upsc-bot/src/test-local.js` (append a new test block at the end before the Summary section)

- [ ] **Step 1: Write the failing test**

Append this test block to `upsc-bot/src/test-local.js` immediately before the `// Summary` divider (around line 188):

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 6: Training loader
// ════════════════════════════════════════════════════════════════════════
console.log('\n🎓 Test 6: Training Loader');
try {
  const { loadExamples, loadTemplates, loadFaq } = await import('./training/loader.js');

  const examples = await loadExamples();
  const templates = await loadTemplates();
  const faq = await loadFaq();

  if (!Array.isArray(examples)) {
    fail('loadExamples', `Expected array, got ${typeof examples}`);
  } else {
    pass(`loadExamples — returned ${examples.length}-item array`);
  }

  if (typeof templates !== 'object' || templates === null || Array.isArray(templates)) {
    fail('loadTemplates', `Expected plain object, got ${typeof templates}`);
  } else {
    pass(`loadTemplates — returned object with ${Object.keys(templates).length} keys`);
  }

  if (typeof faq !== 'object' || faq === null || Array.isArray(faq)) {
    fail('loadFaq', `Expected plain object, got ${typeof faq}`);
  } else {
    pass(`loadFaq — returned object with ${Object.keys(faq).length} keys`);
  }
} catch (err) {
  fail('Training loader', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — Training loader: Cannot find module ... loader.js`

- [ ] **Step 3: Implement `src/training/loader.js`**

```javascript
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_DIR = join(__dirname, '..', '..', 'training');

async function loadJson(filename, fallback) {
  try {
    const raw = await readFile(join(TRAINING_DIR, filename), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[training] failed to load ${filename}:`, err.message);
    return fallback;
  }
}

export async function loadExamples() {
  return loadJson('examples.json', []);
}

export async function loadTemplates() {
  return loadJson('templates.json', {});
}

export async function loadFaq() {
  return loadJson('faq.json', {});
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: all three loader assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/training/loader.js upsc-bot/src/test-local.js
git commit -m "feat(training): add JSON loader for examples/templates/faq"
```

---

## Task 3: Build `src/training/templates.js`

**Files:**
- Create: `upsc-bot/src/training/templates.js`
- Modify: `upsc-bot/src/test-local.js`

Responsibility: substitute `{{var}}` placeholders inside a template body, AND swap `{{TEMPLATE:<key>}}` markers inside a Claude reply with the verbatim template body.

- [ ] **Step 1: Write the failing test**

Append to `test-local.js` before the Summary section:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 7: Templates — placeholder + marker substitution
// ════════════════════════════════════════════════════════════════════════
console.log('\n📋 Test 7: Templates');
try {
  const { substitute, replaceMarkers } = await import('./training/templates.js');

  // Placeholder substitution
  const out = substitute('Hello {{name}}, your link is {{url}}', { name: 'Sagar', url: 'https://t.me/x' });
  if (out === 'Hello Sagar, your link is https://t.me/x') {
    pass('substitute — placeholders replaced');
  } else {
    fail('substitute', `Unexpected output: "${out}"`);
  }

  // Marker replacement — single marker
  const templates = { gift_card_notice: 'Only gift card accepted 🙏' };
  const reply1 = replaceMarkers('Okay bhai. {{TEMPLATE:gift_card_notice}}', templates);
  if (reply1 === 'Okay bhai. Only gift card accepted 🙏') {
    pass('replaceMarkers — single marker swapped');
  } else {
    fail('replaceMarkers single', `Unexpected: "${reply1}"`);
  }

  // Marker replacement — unknown key leaves marker intact and logs warning
  const reply2 = replaceMarkers('Hi {{TEMPLATE:does_not_exist}}', templates);
  if (reply2.includes('{{TEMPLATE:does_not_exist}}')) {
    pass('replaceMarkers — unknown marker left intact');
  } else {
    fail('replaceMarkers unknown', `Should have left marker intact, got: "${reply2}"`);
  }
} catch (err) {
  fail('Templates', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — Templates: Cannot find module ... templates.js`

- [ ] **Step 3: Implement `src/training/templates.js`**

```javascript
/**
 * Substitute {{key}} placeholders inside a template body.
 * Unknown placeholders are left as-is.
 *
 * @param {string} body
 * @param {Record<string,string>} vars
 * @returns {string}
 */
export function substitute(body, vars = {}) {
  if (!body) return '';
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

/**
 * Replace {{TEMPLATE:<key>}} markers in a Claude reply with the verbatim
 * template body from templates.json. Unknown keys are left intact so the
 * operator can spot the misfire in the live chat.
 *
 * @param {string} reply
 * @param {Record<string,string>} templates
 * @returns {string}
 */
export function replaceMarkers(reply, templates = {}) {
  if (!reply) return '';
  return reply.replace(/\{\{TEMPLATE:([a-z0-9_]+)\}\}/gi, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(templates, key)) {
      return templates[key];
    }
    console.warn(`[training] unknown template marker: ${key}`);
    return match;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 3 PASS lines for substitute / replaceMarkers single / replaceMarkers unknown.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/training/templates.js upsc-bot/src/test-local.js
git commit -m "feat(training): add template placeholder + marker substitution"
```

---

## Task 4: Build `src/training/faq.js`

**Files:**
- Create: `upsc-bot/src/training/faq.js`
- Modify: `upsc-bot/src/test-local.js`

Responsibility: given a user message and the FAQ map, return a canned reply if there's a confident match, else `null`. Algorithm per the spec: case-insensitive substring match against canonical FAQ key after stripping punctuation.

- [ ] **Step 1: Write the failing test**

Append to `test-local.js` before the Summary section:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 8: FAQ short-circuit matcher
// ════════════════════════════════════════════════════════════════════════
console.log('\n❓ Test 8: FAQ Matcher');
try {
  const { matchFaq } = await import('./training/faq.js');

  const faq = {
    'lifetime access': 'Haan lifetime. Update 1 year ka hai',
    'gpay chalega': 'Haan bhai, G Pay chalega',
    'demo class': 'Demo link bhej deta hoon',
  };

  // Exact match
  const r1 = matchFaq('lifetime access?', faq);
  if (r1 === faq['lifetime access']) {
    pass('matchFaq — exact match with trailing punctuation');
  } else {
    fail('matchFaq exact', `Got: ${JSON.stringify(r1)}`);
  }

  // Substring match (key appears inside user message)
  const r2 = matchFaq('bhai gpay chalega ya nahi', faq);
  if (r2 === faq['gpay chalega']) {
    pass('matchFaq — substring match');
  } else {
    fail('matchFaq substring', `Got: ${JSON.stringify(r2)}`);
  }

  // No match → null
  const r3 = matchFaq('kya haal hai', faq);
  if (r3 === null) {
    pass('matchFaq — no match returns null');
  } else {
    fail('matchFaq null', `Should be null, got: ${JSON.stringify(r3)}`);
  }

  // Empty FAQ → null
  const r4 = matchFaq('anything', {});
  if (r4 === null) {
    pass('matchFaq — empty FAQ returns null');
  } else {
    fail('matchFaq empty', `Should be null, got: ${JSON.stringify(r4)}`);
  }
} catch (err) {
  fail('FAQ matcher', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — FAQ matcher: Cannot find module ... faq.js`

- [ ] **Step 3: Implement `src/training/faq.js`**

```javascript
/**
 * Normalize a string for FAQ matching:
 * lowercase + strip punctuation + collapse whitespace.
 *
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Look for a confident FAQ hit in the user's message.
 * Returns the canned reply, or null if no key is found as a substring.
 *
 * @param {string} userMessage
 * @param {Record<string,string>} faq
 * @returns {string|null}
 */
export function matchFaq(userMessage, faq) {
  if (!userMessage || !faq) return null;
  const haystack = normalize(userMessage);
  if (!haystack) return null;

  for (const [key, reply] of Object.entries(faq)) {
    const needle = normalize(key);
    if (needle && haystack.includes(needle)) {
      return reply;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 4 PASS lines for matchFaq exact / substring / null / empty.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/training/faq.js upsc-bot/src/test-local.js
git commit -m "feat(training): add FAQ short-circuit matcher"
```

---

## Task 5: Build `src/training/examples.js`

**Files:**
- Create: `upsc-bot/src/training/examples.js`
- Modify: `upsc-bot/src/test-local.js`

Responsibility: given the full example pool, the current stage, and a count `n`, return the top `n` examples — filtered by stage tag, sorted by `addedAt` descending (newer wins). Per spec, relevance scoring defaults to simple stage-tag match.

- [ ] **Step 1: Write the failing test**

Append to `test-local.js` before the Summary section:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 9: Examples — stage-filtered + recency-sorted selection
// ════════════════════════════════════════════════════════════════════════
console.log('\n🧪 Test 9: Few-shot examples');
try {
  const { pickExamples } = await import('./training/examples.js');

  const pool = [
    { stage: 'interested', user: 'price?',      reply: 'Old reply', addedAt: '2025-01-01' },
    { stage: 'interested', user: 'kitna?',      reply: 'New reply', addedAt: '2026-06-01' },
    { stage: 'paid',       user: 'doubt hai',   reply: 'Sure',      addedAt: '2026-06-05' },
    { stage: 'interested', user: 'combo?',      reply: '1499',      addedAt: '2026-06-08' },
  ];

  // Stage filter
  const r1 = pickExamples(pool, 'paid', 3);
  if (r1.length === 1 && r1[0].user === 'doubt hai') {
    pass('pickExamples — stage filter');
  } else {
    fail('pickExamples stage', `Got ${r1.length} items: ${JSON.stringify(r1)}`);
  }

  // Recency-sorted, limit applied
  const r2 = pickExamples(pool, 'interested', 2);
  if (r2.length === 2 && r2[0].user === 'combo?' && r2[1].user === 'kitna?') {
    pass('pickExamples — recency sort + limit');
  } else {
    fail('pickExamples sort', `Got: ${JSON.stringify(r2.map((e) => e.user))}`);
  }

  // Empty pool returns []
  const r3 = pickExamples([], 'interested', 3);
  if (Array.isArray(r3) && r3.length === 0) {
    pass('pickExamples — empty pool returns []');
  } else {
    fail('pickExamples empty', `Got: ${JSON.stringify(r3)}`);
  }
} catch (err) {
  fail('Examples', err.message);
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd upsc-bot && npm run test
```

Expected: `❌ FAIL — Examples: Cannot find module ... examples.js`

- [ ] **Step 3: Implement `src/training/examples.js`**

```javascript
/**
 * Pick the top N few-shot examples for a given stage.
 * Filters by stage tag, then sorts by addedAt descending (newer first).
 * Examples without addedAt are sorted to the bottom.
 *
 * @param {Array<{stage: string, user: string, reply: string, addedAt?: string}>} pool
 * @param {string} stage
 * @param {number} n
 * @returns {Array}
 */
export function pickExamples(pool, stage, n = 3) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const filtered = pool.filter((ex) => ex && ex.stage === stage);
  filtered.sort((a, b) => {
    const ad = a.addedAt || '';
    const bd = b.addedAt || '';
    if (ad === bd) return 0;
    return ad < bd ? 1 : -1;
  });
  return filtered.slice(0, n);
}

/**
 * Render an array of picked examples as a "Past real conversations" block
 * to be injected into the system prompt.
 *
 * @param {Array<{user: string, reply: string}>} examples
 * @returns {string}
 */
export function renderExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) return '';
  const lines = ['--- Past real conversations (mimic this style) ---'];
  for (const ex of examples) {
    lines.push(`Student: ${ex.user}`);
    lines.push(`You: ${ex.reply}`);
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd upsc-bot && npm run test
```

Expected: 3 PASS lines for stage filter / recency sort / empty pool.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/training/examples.js upsc-bot/src/test-local.js
git commit -m "feat(training): add few-shot example picker + renderer"
```

---

## Task 6: Upgrade `db/courses.js` seeder to upsert with merge

**Files:**
- Modify: `upsc-bot/src/db/courses.js` (lines 55-81 — the `seedCoursesFromConfig` function)
- Modify: `upsc-bot/src/test-local.js`

- [ ] **Step 1: Write the failing test (verifies upsert behavior)**

Append to `test-local.js` before the Summary section:

```javascript
// ════════════════════════════════════════════════════════════════════════
// Test 10: Course seeder upsert behavior
// ════════════════════════════════════════════════════════════════════════
console.log('\n💾 Test 10: Seeder upsert');
try {
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();

  const testCourseId = `__test_course_${Date.now()}`;

  // Write a course with price 100
  await db.collection('courses').doc(testCourseId).set({
    id: testCourseId,
    name: 'Seed Test Course',
    description: 'Initial',
    price: 100,
    channelId: '@test',
    groupId: '@test',
    welcomeMessage: 'Welcome',
    createdAt: new Date().toISOString(),
  });

  // Simulate the seeder upsert: same id, new price
  await db.collection('courses').doc(testCourseId).set(
    { price: 200, description: 'Updated' },
    { merge: true },
  );

  const doc = await db.collection('courses').doc(testCourseId).get();
  const data = doc.data();
  if (data.price === 200 && data.description === 'Updated' && data.name === 'Seed Test Course') {
    pass('Seeder upsert — price updated, other fields preserved');
  } else {
    fail('Seeder upsert', `Unexpected doc state: ${JSON.stringify(data)}`);
  }

  // Cleanup
  await db.collection('courses').doc(testCourseId).delete();
} catch (err) {
  fail('Seeder upsert', err.message);
}
```

- [ ] **Step 2: Run test to verify it currently FAILS only if seeder is insert-only (it actually passes here because the test writes raw, but we need this test to lock in the merge behavior for the seeder change in Step 3)**

```bash
cd upsc-bot && npm run test
```

Expected: PASS. This test asserts Firestore's own `merge: true` semantics; the seeder change in the next step will use the same primitive.

- [ ] **Step 3: Modify the seeder to upsert with merge**

Replace `seedCoursesFromConfig` in `upsc-bot/src/db/courses.js` (lines 55-81) with:

```javascript
/**
 * Seed courses from courses.config.js into Firestore.
 * Upserts each course with merge:true so price/description edits land
 * on every boot (not just on first seed).
 * @returns {Promise<{inserted: number, updated: number}>}
 */
export async function seedCoursesFromConfig() {
  try {
    const db = getDb();
    const coursesConfig = await loadCoursesConfig();
    let inserted = 0;
    let updated = 0;

    for (const course of coursesConfig) {
      const ref = db.collection(COLLECTION).doc(course.id);
      const existing = await ref.get();

      if (existing.exists) {
        await ref.set(course, { merge: true });
        updated++;
        console.log(`[courses] Updated course: ${course.id}`);
      } else {
        await ref.set({
          ...course,
          createdAt: new Date().toISOString(),
        });
        inserted++;
        console.log(`[courses] Inserted course: ${course.id}`);
      }
    }

    console.log(`[courses] Seeding complete — ${inserted} new, ${updated} updated`);
    return { inserted, updated };
  } catch (err) {
    console.error('[courses] seedCoursesFromConfig failed:', err.message);
    return { inserted: 0, updated: 0 };
  }
}
```

- [ ] **Step 4: Run test suite to confirm nothing broke**

```bash
cd upsc-bot && npm run test
```

Expected: all tests still pass, including the new seeder upsert one.

- [ ] **Step 5: Commit**

```bash
git add upsc-bot/src/db/courses.js upsc-bot/src/test-local.js
git commit -m "feat(db): upgrade seedCoursesFromConfig to upsert with merge"
```

---

## Task 7: Add `/reload_courses` Telegram admin command

**Files:**
- Modify: `upsc-bot/src/handlers/admin.js` (insert new handler after the existing `/addcourse` handler around line 121)

- [ ] **Step 1: Add the import for `seedCoursesFromConfig`**

At the top of `upsc-bot/src/handlers/admin.js` (line 3 area), add:

```javascript
import { seedCoursesFromConfig } from '../db/courses.js';
```

- [ ] **Step 2: Add the handler block after `/addcourse`**

Insert immediately after the closing `});` of the `/addcourse` handler (around line 121, before `// ── /listpaid ──`):

```javascript
  // ── /reload_courses ───────────────────────────────────────────────
  bot.command('reload_courses', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 Admin-only command.');
    }

    try {
      await ctx.reply('🔄 Reloading courses from config...');
      const { inserted, updated } = await seedCoursesFromConfig();
      await ctx.reply(`✅ Done — ${inserted} new, ${updated} updated.`);
      console.log(`[admin] /reload_courses — ${inserted} new, ${updated} updated`);
    } catch (err) {
      console.error('[admin] /reload_courses error:', err.message);
      await ctx.reply('Reload failed.');
    }
  });
```

- [ ] **Step 3: Smoke-check it boots**

```bash
cd upsc-bot && npm run dev
```

Expected: `[boot] ✅ All handlers registered (admin → start → photo → text)` with no syntax errors. Stop the process (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/src/handlers/admin.js
git commit -m "feat(admin): add /reload_courses Telegram command"
```

---

## Task 8: Extend `prompts.js` to accept examples + emit template markers

**Files:**
- Modify: `upsc-bot/src/ai/prompts.js` (`buildConversationPrompt` signature and body, around lines 105-132)

This task only changes the function signature and injection logic — STAGE_PROMPTS persona rewrite is deferred to the Bootstrap phase (Task 17).

- [ ] **Step 1: Update the import header in `prompts.js`**

At the very top of `upsc-bot/src/ai/prompts.js` (above the existing docblock), add:

```javascript
import { renderExamples } from '../training/examples.js';
```

- [ ] **Step 2: Replace `buildConversationPrompt` with the extended signature**

Replace the entire function (lines 105-132) with:

```javascript
/**
 * Build the full prompt for a conversation turn.
 *
 * @param {string} stage - Current user stage
 * @param {object} user - User document from Firestore
 * @param {string} messageText - The student's message
 * @param {object} [opts]
 * @param {string} [opts.courseCatalog] - Formatted course list (for "interested" stage)
 * @param {Array} [opts.examples] - Few-shot examples picked for this stage
 * @param {Record<string,string>} [opts.templates] - Available templates by key (for marker hint)
 * @returns {string}
 */
export function buildConversationPrompt(stage, user, messageText, opts = {}) {
  const { courseCatalog = '', examples = [], templates = {} } = opts;

  let systemPrompt = STAGE_PROMPTS[stage] || STAGE_PROMPTS.engaged;

  if (stage === 'interested' && courseCatalog) {
    systemPrompt = systemPrompt.replace('{{COURSE_CATALOG}}', courseCatalog);
  }

  const templateKeys = Object.keys(templates);
  const templateHint = templateKeys.length
    ? `\n--- Available canned messages ---\nYou can emit {{TEMPLATE:<key>}} in your reply and the runtime will swap it for the verbatim canned message. Available keys: ${templateKeys.join(', ')}\n`
    : '';

  const examplesBlock = renderExamples(examples);

  const context = [
    `--- Student Info ---`,
    `Name: ${user.name || 'Pata nahi'}`,
    `Username: @${user.username || 'N/A'}`,
    `Stage: ${stage}`,
    `Paid Courses: ${user.paidCourseIds?.length ? user.paidCourseIds.join(', ') : 'None yet'}`,
  ].join('\n');

  return [
    systemPrompt,
    templateHint,
    examplesBlock,
    context,
    `--- Student ka message ---`,
    messageText,
  ].filter(Boolean).join('\n\n');
}
```

- [ ] **Step 3: Verify the test suite still passes (no test for this directly, but ensure imports resolve)**

```bash
cd upsc-bot && npm run test
```

Expected: all existing tests still pass. (No test failure means the new import + signature load cleanly.)

- [ ] **Step 4: Commit**

```bash
git add upsc-bot/src/ai/prompts.js
git commit -m "feat(prompts): extend buildConversationPrompt to inject examples + template hints"
```

---

## Task 9: Update `flows/conversation.js` — FAQ short-circuit + template marker swap + extended keywords

**Files:**
- Modify: `upsc-bot/src/flows/conversation.js` (top of file imports + `processMessage` body)

- [ ] **Step 1: Add imports at the top of `conversation.js`**

Replace lines 1-4 of `upsc-bot/src/flows/conversation.js` with:

```javascript
import { chat } from '../ai/claude.js';
import { buildConversationPrompt } from '../ai/prompts.js';
import { getAllCourses } from '../db/courses.js';
import { formatPrice } from '../utils/helpers.js';
import { loadExamples, loadTemplates, loadFaq } from '../training/loader.js';
import { pickExamples } from '../training/examples.js';
import { replaceMarkers } from '../training/templates.js';
import { matchFaq } from '../training/faq.js';
```

- [ ] **Step 2: Add the FAQ short-circuit at the top of `processMessage`**

In `processMessage`, immediately after the existing `console.log` on line 51, insert:

```javascript
    // ── FAQ short-circuit ──────────────────────────────────────────
    try {
      const faq = await loadFaq();
      const faqReply = matchFaq(text, faq);
      if (faqReply) {
        console.log(`[conversation] FAQ hit for user ${userId}`);
        return { reply: faqReply, newStage: null, selectedCourseId: null };
      }
    } catch (err) {
      console.error('[conversation] FAQ check failed (continuing):', err.message);
    }
```

- [ ] **Step 3: Load examples + templates once per turn, pass to buildConversationPrompt**

Replace the `try { const history = getHistory(userId);` line and everything down through the bottom of the `processMessage` function with this — the key changes are:
1. Load examples + templates once at the top of the try block.
2. Each `buildConversationPrompt(...)` call now takes the new `opts` object.
3. Every reply runs through `replaceMarkers(reply, templates)` before being returned.

Inside `processMessage`, replace the entire `try { ... }` block (everything from line 53 `try {` down to and including line 170 `}`) with:

```javascript
  try {
    const history = getHistory(userId);
    const [examplesPool, templates] = await Promise.all([loadExamples(), loadTemplates()]);
    const examples = pickExamples(examplesPool, stage, 3);
    const swap = (reply) => replaceMarkers(reply, templates);

    // ── Stage: NEW ─────────────────────────────────────────────────
    if (stage === 'new') {
      const systemPrompt = buildConversationPrompt('new', user, text, { examples, templates });
      const reply = swap(await chat(systemPrompt, history, text));

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      const looksLikeName = text.length >= 2 && !text.startsWith('/');
      return { reply, newStage: looksLikeName ? 'engaged' : null, selectedCourseId: null };
    }

    // ── Stage: ENGAGED ─────────────────────────────────────────────
    if (stage === 'engaged') {
      const systemPrompt = buildConversationPrompt('engaged', user, text, { examples, templates });
      const reply = swap(await chat(systemPrompt, history, text));

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      const interestKeywords = [
        'course', 'courses', 'price', 'pricing', 'fees', 'fee',
        'enroll', 'enrol', 'join', 'admission', 'subscribe',
        'kitna', 'paisa', 'cost', 'plan', 'plans',
        'batao', 'details', 'kya milega', 'syllabus',
        'haan', 'yes', 'sure', 'interested', 'bataiye',
        'dikha', 'dikhao', 'course batao', 'kya hai',
        'combo', 'optional', 'discount', 'old member',
        'gpay', 'phonepe', 'paytm', 'amazon pay',
      ];
      const lowerText = text.toLowerCase();
      const showsInterest = interestKeywords.some((kw) => lowerText.includes(kw));

      return { reply, newStage: showsInterest ? 'interested' : null, selectedCourseId: null };
    }

    // ── Stage: INTERESTED ──────────────────────────────────────────
    if (stage === 'interested') {
      const courses = await getAllCourses();
      let courseCatalog = 'Abhi koi course available nahi hai.';
      if (courses.length > 0) {
        courseCatalog = courses
          .map(
            (c, i) =>
              `${i + 1}. ${c.name} (ID: ${c.id})\n` +
              `   ${c.description}\n` +
              `   Price: ${formatPrice(c.price)}`,
          )
          .join('\n\n');
      }

      const systemPrompt = buildConversationPrompt('interested', user, text, { courseCatalog, examples, templates });
      const rawReply = await chat(systemPrompt, history, text);

      pushHistory(userId, 'user', text);

      const courseMatch = rawReply.match(/\[SELECTED_COURSE:(.+?)\]/);
      let selectedCourseId = null;
      let newStage = null;
      let cleanReply = rawReply;

      if (courseMatch) {
        selectedCourseId = courseMatch[1].trim();
        newStage = 'payment_pending';
        cleanReply = rawReply.replace(/\[SELECTED_COURSE:.+?\]/g, '').trim();
        console.log(`[conversation] Course selected: ${selectedCourseId}`);
      }

      const finalReply = swap(cleanReply);
      pushHistory(userId, 'model', finalReply);
      return { reply: finalReply, newStage, selectedCourseId };
    }

    // ── Stage: PAYMENT_PENDING ─────────────────────────────────────
    if (stage === 'payment_pending') {
      const systemPrompt = buildConversationPrompt('payment_pending', user, text, { examples, templates });
      const reply = swap(await chat(systemPrompt, history, text));

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      return { reply, newStage: null, selectedCourseId: null };
    }

    // ── Stage: PAID ────────────────────────────────────────────────
    if (stage === 'paid') {
      const systemPrompt = buildConversationPrompt('paid', user, text, { examples, templates });
      const reply = swap(await chat(systemPrompt, history, text));

      pushHistory(userId, 'user', text);
      pushHistory(userId, 'model', reply);

      return { reply, newStage: null, selectedCourseId: null };
    }

    // ── Fallback ───────────────────────────────────────────────────
    console.warn(`[conversation] Unknown stage "${stage}" for user ${userId}`);
    const systemPrompt = buildConversationPrompt('engaged', user, text, { examples, templates });
    const reply = swap(await chat(systemPrompt, history, text));
    pushHistory(userId, 'user', text);
    pushHistory(userId, 'model', reply);
    return { reply, newStage: 'engaged', selectedCourseId: null };

  } catch (err) {
    console.error(`[conversation] Error for user ${userId}:`, err.message);
    return {
      reply: 'Arre sorry yaar! Kuch technical issue aa gaya 😅 Ek baar phir try kar na!',
      newStage: null,
      selectedCourseId: null,
    };
  }
}
```

- [ ] **Step 4: Run the full test suite**

```bash
cd upsc-bot && npm run test
```

Expected: all previous tests still pass. No new test is added here — the FAQ + marker behavior was already tested at the unit level in Tasks 3 and 4.

- [ ] **Step 5: Boot smoke-check**

```bash
cd upsc-bot && npm run dev
```

Expected: clean boot log, no import errors. Ctrl+C to stop.

- [ ] **Step 6: Commit**

```bash
git add upsc-bot/src/flows/conversation.js
git commit -m "feat(conversation): FAQ short-circuit + template marker swap + extended keywords"
```

---

## Task 10: Extend `courses.config.js` schema (keep existing 3 placeholder courses for now)

**Files:**
- Modify: `upsc-bot/config/courses.config.js`

Add `kind`, `faculty`, `subject`, `demoLink`, and `pricing` as **optional** fields, documented in a comment. Do NOT replace the 3 placeholder courses yet — that happens in Task 14 (Bootstrap).

- [ ] **Step 1: Add a schema comment at the top of `courses.config.js`**

Replace the existing docblock (lines 1-4) with:

```javascript
/**
 * Course configuration for the UPSC Bot.
 *
 * Required fields:
 *   - id, name, description, price, channelId, groupId, welcomeMessage
 *
 * Optional fields (added 2026-06-08 for /train):
 *   - kind: 'combo' | 'lecture' | 'optional'
 *   - faculty: string                       (e.g. "Karandeep")
 *   - subject: string                       (e.g. "Anthropology")
 *   - demoLink: string                      (Telegram demo invite URL)
 *   - pricing: { list, floor, oldMember }   (for negotiable courses; price still required)
 */
```

- [ ] **Step 2: Run the existing course-config test**

```bash
cd upsc-bot && npm run test
```

Expected: Test 2 (Course config) still PASS — the 3 existing courses still have all required fields.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/config/courses.config.js
git commit -m "docs(courses): document extended schema fields for /train"
```

---

# Phase 2 — `/train` Slash Command

## Task 11: Create `.claude/commands/train.md`

**Files:**
- Create: `.claude/commands/train.md`

This is a Claude Code slash command — a markdown file with frontmatter. The body is the prompt Claude executes when the user types `/train`. The prompt walks Claude through all six pipeline stages (ingest → parse/redact → extract → diff → approve → apply → commit). No JavaScript implementation — the extraction logic runs in Claude's head at invocation time.

- [ ] **Step 1: Write `.claude/commands/train.md`**

```markdown
---
description: Ingest UPSC Bot admin chat transcripts and propose per-group diffs to update persona examples, courses, payment templates, and FAQ
argument-hint: <paste a transcript here OR leave empty to scan upsc-bot/training/transcripts/ for new files>
---

You are running the `/train` pipeline for the UPSC Bot project. Spec reference: `docs/superpowers/specs/2026-06-08-train-command-design.md`.

Input: $ARGUMENTS

## Stage 1 — Ingest

If `$ARGUMENTS` is non-empty (a pasted transcript):
1. Generate a timestamp slug: `YYYY-MM-DD-HHmm-paste`.
2. Write the paste to `upsc-bot/training/transcripts/<slug>.txt` (redacted version — see Stage 2).
3. Append the new filename to `upsc-bot/training/transcripts/.processed`.

If `$ARGUMENTS` is empty:
1. Glob `upsc-bot/training/transcripts/*.txt`.
2. Read `upsc-bot/training/transcripts/.processed`.
3. Pick only files not yet listed in `.processed`.
4. If none, stop with: "Nothing new to train on. Drop a `.txt` file into transcripts/ or pass a paste as `/train <text>`."

## Stage 2 — Parse & redact

Parse the raw text into a turn list. The format is `> Name:` headers followed by message text on subsequent lines. Treat any speaker named "UPSC Helping Hand" (with any suffix) as `operator`; everyone else is `user`. Result shape:

```
[ { speaker: "user"|"operator", name: "Anchal", text: "..." } ]
```

Redact in place before writing to disk:
- Telegram invite links matching `t\.me/\+[A-Za-z0-9_-]+` or `t\.me/c/\d+/\d+` → `<INVITE_LINK>`
- Phone numbers (10 consecutive digits, optionally `+91` prefixed) → `<PHONE>`
- Email addresses (standard regex) → `<EMAIL>`
- Gift-card codes — heuristic: ALL-CAPS alphanum groups separated by dashes, length ≥ 8 (e.g. `QTNG-T8TY3C-AEFA`) → `<GIFT_CODE>`

Write the **redacted** text to the transcript file. Keep the unredacted version in memory for extraction.

## Stage 3 — Extract candidates (4 buckets)

### Style examples
- Pick 5–10 operator turns per detected stage with 1–2 preceding user turns as context.
- Tag each as `{ stage, user, reply, addedAt: "<today YYYY-MM-DD>", tags: [...] }`.
- Infer the stage from surrounding context: greetings → `new`, course/price discussion → `interested`, payment-flow → `payment_pending`, post-access → `paid`. Negotiation flavor goes into `interested` with tag `negotiation`.

### Course / price candidates
- Scan for faculty + subject + price triples: "Karandeep Sir batch cost 650", "Eco price 250", "Anthro price 400".
- Slug = kebab-case of faculty + subject, e.g. `karandeep-anthropology`, `mrunal-economy`.
- Build candidate: `{ slug, name, faculty, subject, kind: 'lecture', price, pricing: {list, oldMember?, floor?}, demoLink?, mentions: [transcript-quotes] }`.
- Combo offers (1499, 999) get `kind: 'combo'` with explicit `slug: 'combo-all-1499'` / `slug: 'combo-list2-999'`.

### Template candidates
- Detect repeated multi-line operator messages keyed by intent. Standard keys: `gift_card_notice`, `payment_mode_menu`, `payment_proof`, `payment_link_phonepe`, `payment_link_paytm`, `payment_link_gpay`, `combo_pitch_1499`, `combo_pitch_999`, `post_payment_access`, `lifetime_updates`.
- Replace specific payment URLs with `{{link}}` placeholders so the template stays valid when URLs rotate.

### FAQ candidates
- Pair short repeated user questions with operator replies. Examples to look for: `lifetime access`, `gpay chalega`, `demo class`, `updates kab tak`, `notes milenge`.
- Canonical FAQ key is the normalized question text (lowercase, stripped punctuation).

## Stage 4 — Diff against current state (and collision check)

Load:
- `upsc-bot/training/examples.json`, `templates.json`, `faq.json`
- `upsc-bot/config/courses.config.js`
- Firestore `courses` collection via `firebase-admin` using `upsc-bot/config/firebase.js`'s `getDb()`. (You'll need to load `dotenv/config` from `upsc-bot/.env` first — run a one-off Node script with `cd upsc-bot && node -e "..."` and parse the JSON output.)

For each course candidate:
1. If `courses.config.js` already has the slug → compare price/description/demoLink, list diffs.
2. If Firestore has a doc with a different ID but a name within Levenshtein distance ≤ 3 of this candidate's name (case-insensitive, normalized) → **COLLISION**. Surface: `"Firestore has doc <id> name='<existing>' price=<existing>. Transcript suggests slug='<new>' name='<new>' price=<new>. (o)verwrite Firestore doc / (k)eep Firestore as-is / (s)kip this candidate"`.

For templates / FAQ: hash-compare. If a key exists with a different body, surface a side-by-side diff.

For examples: skip near-duplicates (normalized lowercased-collapsed-whitespace string equality on the reply).

Warn on contradictions: e.g., two different prices for the same slug across runs.

## Stage 5 — Per-group review

Present 4 sections in order: **Courses → Templates → FAQ → Style examples**. For each, print proposed diffs and ask the user `apply all / pick / skip group?`. If `pick`, walk item-by-item with `(y)es / (n)o / (e)dit-then-yes`.

Be transparent about counts: `"3 new courses, 2 price-change collisions, 1 contradiction warning."`

## Stage 6 — Apply & commit

Once the user approves each group:
1. Append approved style examples to `upsc-bot/training/examples.json` (preserve existing entries; sort by `addedAt` desc when writing for clean diffs).
2. Upsert approved templates into `upsc-bot/training/templates.json` (sorted keys).
3. Upsert approved FAQ entries into `upsc-bot/training/faq.json` (sorted keys).
4. Rewrite `upsc-bot/config/courses.config.js` with the merged course list. Use a deterministic formatter: 2-space indent, double quotes for keys consistent with existing file, preserve field order `id, name, description, price, channelId, groupId, welcomeMessage, kind, faculty, subject, demoLink, pricing`.
5. Append the ingested transcript filename(s) to `upsc-bot/training/transcripts/.processed`.

Single commit per run:

```
git add upsc-bot/training/ upsc-bot/config/courses.config.js
git commit -m "train: ingest <N> transcripts (<M> courses, <K> examples, <T> templates, <F> faqs)"
```

Print final message:
```
Done. Run /reload_courses in Telegram OR restart the bot to push course changes to Firestore.
```

## Safety rules

- NEVER write the unredacted transcript to disk.
- NEVER auto-apply changes without per-group approval. Stage 5 is mandatory.
- NEVER overwrite a Firestore course doc without explicit `(o)verwrite` answer to a collision prompt.
- If any step fails (parse error, Firestore unreachable, no candidates), stop and report — don't partial-apply.
```

- [ ] **Step 2: Verify the command file loads (open Claude Code, type `/train` — autocomplete should suggest it)**

There's no automated check here — visual smoke test only.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/train.md
git commit -m "feat(commands): add /train slash command for transcript ingestion"
```

---

# Phase 3 — Bootstrap

## Task 12: Write the bootstrap transcript file (redacted)

**Files:**
- Create: `upsc-bot/training/transcripts/2026-06-08-bootstrap.txt`
- Modify: `upsc-bot/training/transcripts/.processed`

Take the operator's pasted chat samples (from the original `/train` invocation in this conversation) and write them as the first archived transcript, with redactions applied per Stage 2 rules in `train.md`.

- [ ] **Step 1: Write the redacted transcript**

`upsc-bot/training/transcripts/2026-06-08-bootstrap.txt`:

```
> S k:
Hello

> UPSC Helping Hand ( Aspirant ):
Hi

> S k:
I want anthropology course

> S k:
I was already a member of

> UPSC Helping Hand ( Aspirant ):
Karandeep Sir batch cost 650

> S k:
Iconic plus

> UPSC Helping Hand ( Aspirant ):
Yes bro

> UPSC Helping Hand ( Aspirant ):
500 for old members

> UPSC Helping Hand ( Aspirant ):
Aaj ke liye

> S k:
I need PDFs only

> S k:
To update

> UPSC Helping Hand ( Aspirant ):
Already I gave it for free in previous batch

> S k:
Hello bro

> UPSC Helping Hand ( Aspirant ):
Hiii

> S k:
I need upsc courses complete for 2 of my friends

> S k:
Final amount kitna lagega

> UPSC Helping Hand ( Aspirant ):
All Coaching GS + optional Combo
List 1 ~ <INVITE_LINK>

All subject Delhi Top Faculty Package
List 2 ~ <INVITE_LINK>

> UPSC Helping Hand ( Aspirant ):
In 1499 you will get access to both list + one optional subject

> UPSC Helping Hand ( Aspirant ):
In 999 only list 2 you will get

> UPSC Helping Hand ( Aspirant ):
Konsa combo chahiye isme se

> S k:
1499 wala

> UPSC Helping Hand ( Aspirant ):
Okay

> UPSC Helping Hand ( Aspirant ):
Krwa do bhai payment

> S k:
Do log le rahe

> S k:
Thoda kam kar dijiye

> UPSC Helping Hand ( Aspirant ):
2500 kr dena bhai

> UPSC Helping Hand ( Aspirant ):
Optional v rhega dono ka

> S k:
Bhai 2k me done kardo

> S k:
Mai chahta to ek id banake bhi apse course leke 2 me share kar deta

> S k:
Mai apka bahut purana customer hu

> S k:
Isliye bas apse request kar raha

> UPSC Helping Hand ( Aspirant ):
Thik h bhai

> UPSC Helping Hand ( Aspirant ):
Kr do payment

> UPSC Helping Hand ( Aspirant ):
Avi kroge payment.?

> Mohita yadav:
Smriti shaah maam society classes

> UPSC Helping Hand ( Aspirant ):
Price 300

> UPSC Helping Hand ( Aspirant ):
2026 session

> Mohita yadav:
How to pay

> UPSC Helping Hand ( Aspirant ):
Due To safety Reasons I Can't accept
UPI/QR payments
Only gift card accepted 🙏🙏

> UPSC Helping Hand ( Aspirant ):
Which payment mode do you use ?

1) Phonepe
2) Paytm
3) Amazon pay

> UPSC Helping Hand ( Aspirant ):
Payment Proof 🧾

To Check ~ <INVITE_LINK>

> Mohita yadav:
Phonepe

> UPSC Helping Hand ( Aspirant ):
Phonepe Ap

Payment Link 🖇️ ~ <INVITE_LINK>

Less Than 500

> Anchal:
Hello !

> UPSC Helping Hand ( Aspirant ):
Hiii

> Anchal:
Do u have peeyush sir ethics lecture ?

> UPSC Helping Hand ( Aspirant ):
Peeyush sir Ethics+ essay 2025 ~

For Demo 🫳 Click Here

> Anchal:
Can I get all the lectures ?

> UPSC Helping Hand ( Aspirant ):
Yes

> UPSC Helping Hand ( Aspirant ):
Price 250 for ethics

> UPSC Helping Hand ( Aspirant ):
And 400 for both

> Anchal:
I want only ethics, I will pay you for that

> Anchal:
Notes will also be provided ?

> UPSC Helping Hand ( Aspirant ):
Yes

> Anchal:
Photo

> Anchal:
I've done the payment

> UPSC Helping Hand ( Aspirant ):
<INVITE_LINK>

> UPSC Helping Hand ( Aspirant ):
Send me copy of code

> Anchal:
Gift Card Code: <GIFT_CODE>

> ABC:
hi

> ABC:
can i get the access ?

> UPSC Helping Hand ( Aspirant ):
Yes

> UPSC Helping Hand ( Aspirant ):
Which one

> ABC:
Economic mrunal and karandeep anthro

> UPSC Helping Hand ( Aspirant ):
Eco price 250
Anthro price 400

> ABC:
atish mthur

> UPSC Helping Hand ( Aspirant ):
Price 300

> ABC:
which yeaer

> UPSC Helping Hand ( Aspirant ):
2025 26

> ABC:
which course ? the gs2?

> UPSC Helping Hand ( Aspirant ):
Yes

> Yaza Deshwal:
Hello bhaiya

> UPSC Helping Hand ( Aspirant ):
Hi

> Yaza Deshwal:
Course chahiye tha mujhse bhai

> Yaza Deshwal:
Aapke pass koi gs all coaching combo hoga

> UPSC Helping Hand ( Aspirant ):
All Coaching GS + optional 😻💯
<INVITE_LINK>

All subject Top Faculty Package 😻💯
<INVITE_LINK>

> UPSC Helping Hand ( Aspirant ):
In 1499 you will get access to both list + one optional subject

> UPSC Helping Hand ( Aspirant ):
In 999 only list 2 you will get

> Yaza Deshwal:
Lifetime access h na bhaii

> UPSC Helping Hand ( Aspirant ):
Haan lifetime

> UPSC Helping Hand ( Aspirant ):
Update 1 year ka hai 2026 mains tak

> Yaza Deshwal:
Bhai me googlepsy use karta hu phonepay ka koi access nhi h mere pass

> Yaza Deshwal:
Google pay ke through hojaegi kya payment

> UPSC Helping Hand ( Aspirant ):
Haan bhai

> UPSC Helping Hand ( Aspirant ):
G Pay ~ Fk

Payment Link 🖇️ ~ <INVITE_LINK>

For 50, 200, 500, 1000
```

- [ ] **Step 2: Append to `.processed`**

Overwrite `upsc-bot/training/transcripts/.processed` with:

```
2026-06-08-bootstrap.txt
```

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/training/transcripts/
git commit -m "feat(training): bootstrap corpus with first redacted transcript"
```

---

## Task 13: Populate `templates.json` with extracted payment scripts

**Files:**
- Modify: `upsc-bot/training/templates.json`

- [ ] **Step 1: Replace `templates.json` contents**

```json
{
  "combo_pitch_1499": "All Coaching GS + optional Combo\nList 1 ~ {{list1_link}}\n\nAll subject Delhi Top Faculty Package\nList 2 ~ {{list2_link}}\n\nIn 1499 you will get access to both list + one optional subject\nIn 999 only list 2 you will get\n\nKonsa combo chahiye isme se",
  "combo_pitch_999": "All subject Delhi Top Faculty Package\nList 2 ~ {{list2_link}}\n\nIn 999 only list 2 you will get",
  "gift_card_notice": "Due To safety Reasons I Can't accept\nUPI/QR payments\nOnly gift card accepted 🙏🙏",
  "lifetime_updates": "Haan lifetime\nUpdate 1 year ka hai 2026 mains tak",
  "payment_link_gpay": "G Pay ~ Fk\n\nPayment Link 🖇️ ~ {{link}}\n\nFor 50, 200, 500, 1000",
  "payment_link_paytm": "Paytm Ap\n\nPayment Link 🖇️ ~ {{link}}",
  "payment_link_phonepe": "Phonepe Ap\n\nPayment Link 🖇️ ~ {{link}}\n\nLess Than 500",
  "payment_mode_menu": "Which payment mode do you use ?\n\n1) Phonepe\n2) Paytm\n3) Amazon pay",
  "payment_proof": "Payment Proof 🧾\n\nTo Check ~ {{link}}",
  "post_payment_access": "Welcome bhai 👍\nJoin link ~ {{link}}\nUpdate milte rahenge"
}
```

- [ ] **Step 2: Run test suite**

```bash
cd upsc-bot && npm run test
```

Expected: Test 7 (Templates) still PASS — placeholder substitution test will work against either fixture data or whatever's now in the file.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/training/templates.json
git commit -m "feat(training): bootstrap templates with payment scripts from real chats"
```

---

## Task 14: Populate `faq.json` with extracted FAQ pairs

**Files:**
- Modify: `upsc-bot/training/faq.json`

- [ ] **Step 1: Replace `faq.json` contents**

```json
{
  "demo class": "Demo link bhej deta hoon — usme dekh ke confirm kar lena",
  "gpay chalega": "Haan bhai, G Pay chalega",
  "googlepay chalega": "Haan bhai, G Pay chalega",
  "how to pay": "{{TEMPLATE:gift_card_notice}}\n\n{{TEMPLATE:payment_mode_menu}}\n\n{{TEMPLATE:payment_proof}}",
  "lifetime access": "Haan lifetime. Update 1 year ka hai 2026 mains tak",
  "notes milenge": "Haan notes bhi included hain",
  "updates kab tak": "Updates 2026 mains tak milte rahenge bhai"
}
```

- [ ] **Step 2: Run test suite**

```bash
cd upsc-bot && npm run test
```

Expected: Test 8 (FAQ Matcher) still PASS.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/training/faq.json
git commit -m "feat(training): bootstrap FAQ pairs from real chats"
```

---

## Task 15: Populate `examples.json` with curated few-shot pool

**Files:**
- Modify: `upsc-bot/training/examples.json`

- [ ] **Step 1: Replace `examples.json` contents**

```json
[
  { "stage": "new", "user": "Hello", "reply": "Hi", "addedAt": "2026-06-08", "tags": ["greeting"] },
  { "stage": "new", "user": "Hello bhaiya", "reply": "Hi", "addedAt": "2026-06-08", "tags": ["greeting"] },
  { "stage": "new", "user": "Hello !", "reply": "Hiii", "addedAt": "2026-06-08", "tags": ["greeting"] },
  { "stage": "engaged", "user": "Course chahiye tha mujhse bhai", "reply": "Konsa course chahiye bhai, bata", "addedAt": "2026-06-08", "tags": ["probe"] },
  { "stage": "interested", "user": "Final amount kitna lagega", "reply": "{{TEMPLATE:combo_pitch_1499}}", "addedAt": "2026-06-08", "tags": ["combo_pitch"] },
  { "stage": "interested", "user": "Aapke pass koi gs all coaching combo hoga", "reply": "{{TEMPLATE:combo_pitch_1499}}", "addedAt": "2026-06-08", "tags": ["combo_pitch"] },
  { "stage": "interested", "user": "1499 wala", "reply": "Okay\nKrwa do bhai payment\n[SELECTED_COURSE:combo-all-1499]", "addedAt": "2026-06-08", "tags": ["close"] },
  { "stage": "interested", "user": "Bhai 2k me done kardo", "reply": "Thik h bhai\nKr do payment\nAvi kroge payment.?", "addedAt": "2026-06-08", "tags": ["negotiation"] },
  { "stage": "interested", "user": "Do log le rahe. Thoda kam kar dijiye", "reply": "2500 kr dena bhai\nOptional v rhega dono ka", "addedAt": "2026-06-08", "tags": ["negotiation"] },
  { "stage": "interested", "user": "I want anthropology course. I was already a member", "reply": "Karandeep Sir batch cost 650\n500 for old members\nAaj ke liye", "addedAt": "2026-06-08", "tags": ["old_member"] },
  { "stage": "payment_pending", "user": "How to pay", "reply": "{{TEMPLATE:gift_card_notice}}\n\n{{TEMPLATE:payment_mode_menu}}\n\n{{TEMPLATE:payment_proof}}", "addedAt": "2026-06-08", "tags": ["payment_script"] },
  { "stage": "payment_pending", "user": "Phonepe", "reply": "{{TEMPLATE:payment_link_phonepe}}", "addedAt": "2026-06-08", "tags": ["payment_link"] },
  { "stage": "payment_pending", "user": "Paytm", "reply": "{{TEMPLATE:payment_link_paytm}}", "addedAt": "2026-06-08", "tags": ["payment_link"] },
  { "stage": "payment_pending", "user": "Google pay ke through hojaegi kya payment", "reply": "Haan bhai\n{{TEMPLATE:payment_link_gpay}}", "addedAt": "2026-06-08", "tags": ["payment_link"] },
  { "stage": "payment_pending", "user": "I've done the payment", "reply": "{{TEMPLATE:post_payment_access}}\nSend me copy of code", "addedAt": "2026-06-08", "tags": ["post_payment"] },
  { "stage": "paid", "user": "Lifetime access h na bhaii", "reply": "{{TEMPLATE:lifetime_updates}}", "addedAt": "2026-06-08", "tags": ["post_sale_qa"] },
  { "stage": "paid", "user": "Thank you bhaiya", "reply": "Welcome bhai 👍", "addedAt": "2026-06-08", "tags": ["thanks"] }
]
```

- [ ] **Step 2: Run test suite**

```bash
cd upsc-bot && npm run test
```

Expected: Test 9 (Few-shot examples) still PASS.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/training/examples.json
git commit -m "feat(training): bootstrap few-shot example pool from real chats"
```

---

## Task 16: Replace `courses.config.js` with the real catalog

**Files:**
- Modify: `upsc-bot/config/courses.config.js`

Replace the 3 placeholder courses with the catalog extracted from the bootstrap transcript. **Telegram channel/group IDs are left as placeholders** (`<FILL_CHANNEL_ID>` etc.) — the operator must fill the real IDs before going live. The bot's `getAllCourses()` returns these for the catalog pitch; the placeholder IDs won't break `createChatInviteLink` until a payment lands, at which point a clear error surfaces.

- [ ] **Step 1: Replace the entire file with the new catalog**

```javascript
/**
 * Course configuration for the UPSC Bot.
 *
 * Required fields:
 *   - id, name, description, price, channelId, groupId, welcomeMessage
 *
 * Optional fields (added 2026-06-08 for /train):
 *   - kind: 'combo' | 'lecture' | 'optional'
 *   - faculty: string                       (e.g. "Karandeep")
 *   - subject: string                       (e.g. "Anthropology")
 *   - demoLink: string                      (Telegram demo invite URL)
 *   - pricing: { list, floor, oldMember }   (for negotiable courses; price still required)
 */
const courses = [
  {
    id: 'combo-all-1499',
    name: 'All Coaching GS + Optional Combo',
    description: 'List 1 (All Coaching GS + optional) + List 2 (Delhi Top Faculty Package) + one optional subject of choice. Lifetime access. Updates till 2026 mains.',
    price: 1499,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome bhai 👍 Join karke explore karo. Updates milte rahenge.',
    kind: 'combo',
    pricing: { list: 1499, floor: 1499 },
  },
  {
    id: 'combo-list2-999',
    name: 'Delhi Top Faculty Package (List 2 only)',
    description: 'All subject Delhi Top Faculty Package — no optional. Lifetime access. Updates till 2026 mains.',
    price: 999,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome bhai 👍 List 2 access mil gaya.',
    kind: 'combo',
    pricing: { list: 999, floor: 999 },
  },
  {
    id: 'karandeep-anthropology',
    name: 'Karandeep Sir — Anthropology Optional',
    description: 'Karandeep Sir Anthropology Optional lectures + notes. ₹500 for old members of previous batch.',
    price: 650,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Karandeep Sir Anthropology batch 👍',
    kind: 'lecture',
    faculty: 'Karandeep',
    subject: 'Anthropology',
    pricing: { list: 650, oldMember: 500, floor: 500 },
  },
  {
    id: 'mrunal-economy',
    name: 'Mrunal Patel — Economy Batches',
    description: 'Mrunal Patel Economy lectures + notes.',
    price: 250,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Mrunal Sir Economy 👍',
    kind: 'lecture',
    faculty: 'Mrunal Patel',
    subject: 'Economy',
    pricing: { list: 250, floor: 250 },
  },
  {
    id: 'peeyush-ethics',
    name: 'Peeyush Sir — Ethics 2025',
    description: 'Peeyush Sir Ethics lectures + notes (2025).',
    price: 250,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Peeyush Sir Ethics 👍',
    kind: 'lecture',
    faculty: 'Peeyush',
    subject: 'Ethics',
    pricing: { list: 250, floor: 250 },
  },
  {
    id: 'peeyush-ethics-essay',
    name: 'Peeyush Sir — Ethics + Essay 2025',
    description: 'Peeyush Sir Ethics + Essay combined (2025) + notes.',
    price: 400,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Peeyush Sir Ethics + Essay 👍',
    kind: 'combo',
    faculty: 'Peeyush',
    subject: 'Ethics + Essay',
    pricing: { list: 400, floor: 400 },
  },
  {
    id: 'atish-mathur-gs2',
    name: 'Atish Mathur — GS2 (2025-26)',
    description: 'Atish Mathur GS2 lectures + notes (2025-26 session).',
    price: 300,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Atish Sir GS2 👍',
    kind: 'lecture',
    faculty: 'Atish Mathur',
    subject: 'GS2',
    pricing: { list: 300, floor: 300 },
  },
  {
    id: 'smriti-shah-society',
    name: 'Smriti Shah Maam — Society Classes (2026)',
    description: 'Smriti Shah Maam Society classes (2026 session).',
    price: 300,
    channelId: '<FILL_CHANNEL_ID>',
    groupId: '<FILL_GROUP_ID>',
    welcomeMessage: 'Welcome to Smriti Maam Society 👍',
    kind: 'lecture',
    faculty: 'Smriti Shah',
    subject: 'Society',
    pricing: { list: 300, floor: 300 },
  },
];

export default courses;
```

- [ ] **Step 2: Run test suite — Test 2 (Course config) should still PASS**

```bash
cd upsc-bot && npm run test
```

Expected: Test 2 lists all 8 new courses with their prices.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/config/courses.config.js
git commit -m "feat(courses): replace placeholder catalog with real catalog from bootstrap transcripts"
```

---

## Task 17: Rewrite `prompts.js` STAGE_PROMPTS in the operator's actual register

**Files:**
- Modify: `upsc-bot/src/ai/prompts.js` (`STAGE_PROMPTS` object only — the `buildConversationPrompt` function from Task 8 stays)

Per spec: persona = "UPSC Helping Hand (Aspirant)", short fragmented replies (1-3 words common), freely uses "bhai" / "ap" / "aap" / "yaar", drop the strict "always end with one question" rule, model can emit `{{TEMPLATE:<key>}}` markers.

- [ ] **Step 1: Replace the `STAGE_PROMPTS` object**

In `upsc-bot/src/ai/prompts.js`, replace the `export const STAGE_PROMPTS = { ... };` block (lines 13-101 in the current file) with:

```javascript
export const STAGE_PROMPTS = {

  new: `You are "UPSC Helping Hand (Aspirant)" — a UPSC course seller who chats with students on Telegram. Your replies must look like real operator chat: SHORT, often 1-3 words, sometimes spread across 2-3 separate sends. Mixed register — "bhai", "ap", "aap", "yaar" all OK. No formal English, no "I am an AI", no "How may I assist you".

This student just messaged for the first time. Reply with a short greeting only.

RULES:
- 1-3 words is fine ("Hi", "Hiii", "Hello bhai")
- Don't ask for name or attempt year
- Don't pitch courses yet — let them ask
- Do NOT end with a question unless it's natural`,

  engaged: `You are "UPSC Helping Hand (Aspirant)" — UPSC course seller. Student has said hello and you're warming up.

Reply VERY short. Match the operator's actual style:
- "Hi" / "Yes bro" / "Which one"
- One brief line probing what they want (course / subject / faculty)

RULES:
- Stay short — usually under 6 words per send
- Mixed register OK: "bhai", "ap", "aap", "yaar"
- Don't dump the catalog yet — wait for them to mention course/price/combo/optional
- Don't end with a question every time — only if natural`,

  interested: `You are "UPSC Helping Hand (Aspirant)" — UPSC course seller. The student is asking about courses, prices, or combos.

Available catalog:
{{COURSE_CATALOG}}

Your job:
1. Pitch the right course/combo. For combo questions ("all coaching", "gs combo", "kitna lagega"), emit {{TEMPLATE:combo_pitch_1499}}.
2. Quote prices in 1-line replies: "Price 250 for ethics", "Anthro price 400", "Karandeep Sir batch cost 650".
3. Negotiate when asked. If old member or buying multiple: drop a bit ("500 for old members", "2500 kr dena bhai" for 2 IDs). Don't go below pricing.floor for any course.
4. When student commits to a specific course, emit [SELECTED_COURSE:<id>] in your reply. Example: student says "1499 wala" → reply "Okay\\nKrwa do bhai payment\\n[SELECTED_COURSE:combo-all-1499]". The tag is stripped before sending to the user.

RULES:
- SHORT replies. Often 1 line. Sometimes 2-3 short lines split by newlines.
- Mixed register: "bhai", "ap", "aap"
- Don't overuse questions — just state the offer or price
- For payment instructions, prefer template markers ({{TEMPLATE:...}}) over freehand`,

  payment_pending: `You are "UPSC Helping Hand (Aspirant)". Student has chosen a course; now they need to pay via gift card.

Your job:
1. If they ask how to pay → emit {{TEMPLATE:gift_card_notice}} then {{TEMPLATE:payment_mode_menu}} then {{TEMPLATE:payment_proof}}.
2. If they pick a mode (Phonepe / Paytm / GPay) → emit the matching {{TEMPLATE:payment_link_<mode>}}.
3. If they're slow or asking questions → short nudge: "Krwa do bhai payment", "Avi kroge payment.?".
4. If they say payment done → "Send me copy of code".

RULES:
- 1-3 line replies
- Use template markers verbatim — DO NOT paraphrase the gift-card notice or payment links
- "bhai" / "ap" friendly
- Don't claim you'll auto-verify — just confirm receipt`,

  paid: `You are "UPSC Helping Hand (Aspirant)". Student has paid and is now a member.

Reply patterns from real chats:
- "Welcome bhai 👍" / "Join brother"
- Lifetime/updates question → {{TEMPLATE:lifetime_updates}}
- General doubts → short helpful answer
- "Thank you" → "Welcome bhai 👍"

For UPSC-content questions, give a short helpful answer referencing standard sources (Laxmikanth, Spectrum, Shankar IAS, NCERTs) when relevant. Keep replies SHORT — this operator does not lecture.

RULES:
- 1-4 short lines
- Mixed register: "bhai", "ap", "aap"
- Don't force a question at the end`,
};
```

- [ ] **Step 2: Run test suite**

```bash
cd upsc-bot && npm run test
```

Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/src/ai/prompts.js
git commit -m "feat(prompts): rewrite STAGE_PROMPTS in operator's actual register (Aspirant persona)"
```

---

## Task 18: Rewrite `handlers/start.js` welcome in the new register

**Files:**
- Modify: `upsc-bot/src/handlers/start.js` (welcome message text, lines 35-45)

- [ ] **Step 1: Replace the welcome text block**

In `upsc-bot/src/handlers/start.js`, replace lines 35-45 (the `welcomeText` array) with:

```javascript
      const welcomeText = 'Hi 👋';
```

Replace lines 47 (`await ctx.reply(welcomeText);`) — no change needed, still sends the same variable.

Also update the error reply on line 50 to match the new register:

```javascript
      await ctx.reply('Arre kuch issue aa gaya bhai. /start phir try kar 🙏');
```

- [ ] **Step 2: Smoke-check boot**

```bash
cd upsc-bot && npm run dev
```

Expected: clean boot. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add upsc-bot/src/handlers/start.js
git commit -m "feat(start): rewrite /start welcome in new operator register"
```

---

## Task 19: Update `CLAUDE.md` with the training section

**Files:**
- Modify: `CLAUDE.md` (insert new section before "## Known limitations")

- [ ] **Step 1: Find the line `## Known limitations` and insert this new section immediately before it**

```markdown
## Training substrate (added 2026-06-08)

The bot learns operator chat style from real transcripts via the `/train` slash command. All training artifacts live in `upsc-bot/training/`:

| File | Purpose |
|---|---|
| `transcripts/*.txt` | Append-only redacted chat corpus. `.processed` lists ingested filenames. |
| `examples.json` | Few-shot pool. `{stage, user, reply, addedAt, tags}` array. Top 3 by recency injected per turn via `pickExamples`. |
| `templates.json` | Canned scripts keyed by intent (`gift_card_notice`, `payment_mode_menu`, `payment_link_phonepe`, …). `{{var}}` placeholders allowed. |
| `faq.json` | `"normalized question"` → `"canned reply"` map. Short-circuits Claude when matched. |

### Runtime flow with training data

1. `flows/conversation.js → processMessage` first calls `matchFaq(text, faq)`. If hit, reply is returned directly — no Claude call.
2. Otherwise, `pickExamples(pool, stage, 3)` selects the top 3 stage-matched examples, sorted by `addedAt` desc.
3. `buildConversationPrompt(stage, user, text, { courseCatalog, examples, templates })` injects the examples as a "Past real conversations" few-shot block and lists the available template keys.
4. The model can emit `{{TEMPLATE:<key>}}` markers; `replaceMarkers(reply, templates)` swaps them for verbatim template bodies before sending. Unknown markers stay intact (visible to operator as a misfire signal).

### `/train` command

`.claude/commands/train.md`. Six-stage pipeline: **ingest → parse/redact → extract (4 buckets: style/courses/templates/faq) → diff against current state (with Firestore collision check) → per-group human approval → apply + single git commit**. Input: paste as `$ARGUMENTS` OR drop new `.txt` files into `training/transcripts/`. Spec: `docs/superpowers/specs/2026-06-08-train-command-design.md`.

### `/reload_courses`

Admin Telegram command (added with /train). Re-runs `seedCoursesFromConfig` in place — picks up `courses.config.js` edits without a full bot restart. Seeder now upserts with `merge: true`.

### Extended course schema

`courses.config.js` items support optional `kind` (`combo` | `lecture` | `optional`), `faculty`, `subject`, `demoLink`, and `pricing: { list, floor, oldMember }` alongside the original required fields. Bot still reads via doc ID. After running `/train`, run `/reload_courses` (or restart) to push catalog changes to Firestore.

```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): document training substrate + /train + /reload_courses"
```

---

## Task 20: Final smoke test — end-to-end run

**Files:** (none — verification only)

- [ ] **Step 1: Run the full test suite one final time**

```bash
cd upsc-bot && npm run test
```

Expected output includes PASS for:
- Test 1: Env vars
- Test 2: Course config (8 courses listed)
- Test 3: Firebase round-trip
- Test 4: Claude chat
- Test 5: Helpers
- Test 6: Training loader (3 assertions)
- Test 7: Templates (3 assertions)
- Test 8: FAQ matcher (4 assertions)
- Test 9: Few-shot examples (3 assertions)
- Test 10: Seeder upsert

Total: 25+ PASS, 0 FAIL.

- [ ] **Step 2: Boot the bot and verify the seeder updates Firestore**

```bash
cd upsc-bot && npm run dev
```

Expected boot log includes:
```
[boot] ✅ Firebase ready
[claude] Initialized with claude-haiku-4-5
[courses] Loaded production catalog (8 courses)
[courses] Inserted course: combo-all-1499
[courses] Inserted course: combo-list2-999
... (or "Updated course:" if they already exist)
[courses] Seeding complete — N new, M updated
[boot] ✅ All handlers registered (admin → start → photo → text)
[boot] 🤖 Bot running on port 3000
```

Stop with Ctrl+C.

- [ ] **Step 3: Browser simulator dry-run (if `ENABLE_SIMULATOR=true` in `.env`)**

Set `ENABLE_SIMULATOR=true` in `upsc-bot/.env` and re-run `npm run dev`. Open `http://127.0.0.1:3000/sim`. Test:
- "Hello" → expect "Hi" or "Hiii" (short greeting, new register).
- "kitna lagega" → expect a 1499/999 combo pitch (verbatim from `templates.json`).
- "1499 wala" → expect "Okay\nKrwa do bhai payment" with stage transition to `payment_pending` (selected `combo-all-1499`).
- "lifetime access?" → FAQ short-circuit hit, reply matches `faq.json` value directly.

If any reply looks paraphrased instead of verbatim template, check that `replaceMarkers` is being called and that the model is emitting `{{TEMPLATE:<key>}}` markers.

- [ ] **Step 4: Final commit (if anything was tweaked during smoke test)**

```bash
git status
# if dirty:
git add -A
git commit -m "chore: smoke-test fixes"
```

- [ ] **Step 5: Verify the full task is on `main` with a clean history**

```bash
git log --oneline -25
```

Expected: a clean linear history of ~20 commits from Task 1 to Task 20.

---

## What's deliberately NOT in this plan

Per spec:
- No automated payment verification (gift-card OCR, Phonepe/Paytm lookup).
- No real Telegram chat IDs / live payment URLs in committed files — operator fills `<FILL_CHANNEL_ID>` placeholders and `{{link}}` template vars from a separate `payment-links.json` or env vars after this plan completes.
- No fix for the pre-existing bot-token-in-screenshot-URL leak (separate concern).
- No admin panel UI changes.
- No multi-operator support.
- No real-time learning from live chats.
- No `negotiation` as a discrete new stage — handled inline within `interested` (uses few-shot examples tagged `negotiation`).

## Post-plan follow-ups for the operator

1. Fill the 8 `<FILL_CHANNEL_ID>` / `<FILL_GROUP_ID>` placeholders in `courses.config.js` with real Telegram chat IDs (bot must be admin in each).
2. Decide on `payment-links.json` (gitignored vs. committed) and populate the `{{link}}` / `{{list1_link}}` / `{{list2_link}}` placeholders.
3. Optionally delete the 3 leftover Firestore docs (`prelims-2026`, `mains-answer-writing`, `current-affairs-monthly`) from the Firebase console to clean the catalog view.
4. Skim `upsc-bot/training/transcripts/2026-06-08-bootstrap.txt` to confirm redaction caught everything.
5. Run `/train` against future transcripts as the operator's style or pricing evolves.
