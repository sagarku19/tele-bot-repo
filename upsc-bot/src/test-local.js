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
  const required = ['BOT_TOKEN', 'GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
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
// Test 4: AI provider chat (via the active provider facade)
// ════════════════════════════════════════════════════════════════════════
console.log('\n🤖 Test 4: AI provider chat');
try {
  const { initProviders, chat, CHAT_FALLBACK_REPLY, getActiveProviderName } = await import(
    './ai/providers/index.js'
  );

  initProviders();
  const active = getActiveProviderName();
  console.log(`    Active provider: ${active}`);

  const reply = await chat(
    'You are a test assistant. Reply with exactly: "Test successful"',
    [],
    'Hello, test message',
  );

  if (!reply || reply.length === 0) {
    fail(`${active} chat`, 'Empty response');
  } else if (reply === CHAT_FALLBACK_REPLY) {
    fail(
      `${active} chat`,
      `Got the Hinglish fallback — real ${active} call failed. Check the [${active}] error log above for the 4xx/5xx.`,
    );
  } else {
    pass(`${active} chat — got reply (${reply.length} chars)`);
    console.log(`    🗣️  "${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}"`);
  }
} catch (err) {
  fail('AI provider chat', err.message);
}

// ════════════════════════════════════════════════════════════════════════
// Test 4b: xAI provider chat — skipped unless XAI_API_KEY is set
// ════════════════════════════════════════════════════════════════════════
console.log('\n🤖 Test 4b: xAI provider chat (skipped if XAI_API_KEY missing)');
if (!process.env.XAI_API_KEY) {
  console.log('  ⏭️  SKIP — XAI_API_KEY not set');
} else {
  try {
    const xai = await import('./ai/providers/xai.js');
    const { CHAT_FALLBACK_REPLY } = await import('./ai/providers/index.js');

    xai.init();

    const reply = await xai.chat(
      'You are a test assistant. Reply with exactly: "Test successful"',
      [],
      'Hello, test message',
    );

    if (!reply || reply.length === 0) {
      fail('xAI chat', 'Empty response');
    } else if (reply === CHAT_FALLBACK_REPLY) {
      fail(
        'xAI chat',
        'Got the Hinglish fallback — real xAI call failed. Check the [xAI] error log above for the 4xx/5xx.',
      );
    } else {
      pass(`xAI chat — got reply (${reply.length} chars)`);
      console.log(`    🗣️  "${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}"`);
    }
  } catch (err) {
    fail('xAI provider chat', err.message);
  }
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
