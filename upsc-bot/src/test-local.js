/**
 * Local test script for the UPSC Bot.
 *
 * Tests Firebase, Gemini, and course config WITHOUT a Telegram connection.
 * Run with: node src/test-local.js
 */

import 'dotenv/config';

const results = [];

function pass(name) {
  results.push({ name, status: 'PASS' });
  console.log(`  ✅ PASS — ${name}`);
}

function fail(name, error) {
  results.push({ name, status: 'FAIL', error });
  console.error(`  ❌ FAIL — ${name}: ${error}`);
}

// ════════════════════════════════════════════════════════════════════════
// Test 1: Environment variables
// ════════════════════════════════════════════════════════════════════════
console.log('\n🔧 Test 1: Environment Variables');
try {
  const required = ['BOT_TOKEN', 'ANTHROPIC_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    fail('Env vars', `Missing: ${missing.join(', ')}`);
  } else {
    pass('Env vars — all required keys present');
  }
} catch (err) {
  fail('Env vars', err.message);
}

// ════════════════════════════════════════════════════════════════════════
// Test 2: Course config
// ════════════════════════════════════════════════════════════════════════
console.log('\n📚 Test 2: Course Config');
try {
  const { default: courses } = await import('../config/courses.config.js');

  if (!Array.isArray(courses) || courses.length === 0) {
    fail('Course config', 'Courses array is empty or not an array');
  } else {
    const requiredFields = ['id', 'name', 'description', 'price', 'channelId', 'groupId', 'welcomeMessage'];
    let allValid = true;

    for (const course of courses) {
      const missingFields = requiredFields.filter((f) => course[f] === undefined);
      if (missingFields.length > 0) {
        fail(`Course "${course.id || 'unknown'}"`, `Missing fields: ${missingFields.join(', ')}`);
        allValid = false;
      }
    }

    if (allValid) {
      pass(`Course config — ${courses.length} courses loaded`);
      courses.forEach((c) => console.log(`    📖 ${c.id}: ${c.name} — ₹${c.price}`));
    }
  }
} catch (err) {
  fail('Course config', err.message);
}

// ════════════════════════════════════════════════════════════════════════
// Test 3: Firebase connection (write → read → delete)
// ════════════════════════════════════════════════════════════════════════
console.log('\n🔥 Test 3: Firebase Connection');
try {
  const { getDb } = await import('../config/firebase.js');
  const db = getDb();

  const testId = `__test_user_${Date.now()}`;
  const testData = {
    telegramId: 999999999,
    name: 'Test User',
    username: 'testbot',
    stage: 'new',
    isPaid: false,
    paidCourseIds: [],
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  // Write
  await db.collection('users').doc(testId).set(testData);
  pass('Firebase write');

  // Read
  const doc = await db.collection('users').doc(testId).get();
  if (doc.exists && doc.data().name === 'Test User') {
    pass('Firebase read — data matches');
  } else {
    fail('Firebase read', 'Document not found or data mismatch');
  }

  // Delete
  await db.collection('users').doc(testId).delete();
  const deleted = await db.collection('users').doc(testId).get();
  if (!deleted.exists) {
    pass('Firebase delete — cleanup OK');
  } else {
    fail('Firebase delete', 'Document still exists after delete');
  }
} catch (err) {
  fail('Firebase connection', err.message);
}

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

// ════════════════════════════════════════════════════════════════════════
// Test 5: Helper functions
// ════════════════════════════════════════════════════════════════════════
console.log('\n🔨 Test 5: Helper Functions');
try {
  const { chunkArray, formatPrice, formatCourseList, sleep, isAdmin } = await import('./utils/helpers.js');

  // chunkArray
  const chunks = chunkArray([1, 2, 3, 4, 5], 2);
  if (chunks.length === 3 && chunks[0].length === 2 && chunks[2].length === 1) {
    pass('chunkArray([1,2,3,4,5], 2) → 3 chunks');
  } else {
    fail('chunkArray', `Expected 3 chunks, got ${chunks.length}`);
  }

  // formatPrice
  const price = formatPrice(4999);
  if (price.includes('₹') && price.includes('4,999')) {
    pass(`formatPrice(4999) → "${price}"`);
  } else {
    fail('formatPrice', `Unexpected: "${price}"`);
  }

  // formatCourseList
  const list = formatCourseList([{ id: 'test', name: 'Test', description: 'Desc', price: 100 }]);
  if (list.includes('Test') && list.includes('₹')) {
    pass('formatCourseList — renders correctly');
  } else {
    fail('formatCourseList', 'Output missing expected content');
  }

  // sleep
  const start = Date.now();
  await sleep(50);
  const elapsed = Date.now() - start;
  if (elapsed >= 40) {
    pass(`sleep(50) — waited ${elapsed}ms`);
  } else {
    fail('sleep', `Only waited ${elapsed}ms`);
  }

} catch (err) {
  fail('Helpers', err.message);
}

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

  // Marker replacement — uppercase marker matches lowercase template key
  const reply3 = replaceMarkers('Say {{TEMPLATE:Gift_Card_Notice}}', { gift_card_notice: 'OK' });
  if (reply3 === 'Say OK') {
    pass('replaceMarkers — case-insensitive key match');
  } else {
    fail('replaceMarkers case-insensitive', `Should normalize to lowercase, got: "${reply3}"`);
  }
} catch (err) {
  fail('Templates', err.message);
}

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
  if (r1 && r1.key === 'lifetime access' && r1.reply === faq['lifetime access']) {
    pass('matchFaq — exact match with trailing punctuation');
  } else {
    fail('matchFaq exact', `Got: ${JSON.stringify(r1)}`);
  }

  // Substring match (key appears inside user message)
  const r2 = matchFaq('bhai gpay chalega ya nahi', faq);
  if (r2 && r2.key === 'gpay chalega' && r2.reply === faq['gpay chalega']) {
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

// ════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('═'.repeat(60));

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;

results.forEach((r) => {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`  ${icon} ${r.name}`);
});

console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
console.log('═'.repeat(60));

// Exit with error code if any tests failed
process.exit(failed > 0 ? 1 : 0);
