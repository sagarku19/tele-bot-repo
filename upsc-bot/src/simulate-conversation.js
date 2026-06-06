/**
 * One-off conversation simulator.
 *
 * Bypasses Telegram entirely and drives `processMessage()` directly with
 * fake user objects at each stage. Proves the new Gemini 2.5-flash model
 * (thinking disabled) produces real Hinglish replies and the stage router
 * still emits the [SELECTED_COURSE:<id>] tag.
 *
 * Run with: node src/simulate-conversation.js
 *
 * Delete after verification — this is not part of the production code path.
 */

import 'dotenv/config';
import { initGemini } from './ai/gemini.js';
import { processMessage } from './flows/conversation.js';

// ── Setup ─────────────────────────────────────────────────────────────
initGemini();

const FAKE_TELEGRAM_ID = 700000000 + Date.now() % 1000; // unique per run
let cursor = { ...baseUser('new') };

function baseUser(stage) {
  return {
    telegramId: FAKE_TELEGRAM_ID,
    name: 'Simulator',
    username: 'sim',
    stage,
    isPaid: stage === 'paid',
    paidCourseIds: stage === 'paid' ? ['prelims-2026'] : [],
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
}

async function step(label, message, stageOverride) {
  if (stageOverride) cursor = baseUser(stageOverride);
  console.log('\n' + '═'.repeat(70));
  console.log(`▶ ${label}`);
  console.log(`   stage:  ${cursor.stage}`);
  console.log(`   user:   "${message}"`);
  console.log('   ────');

  const t0 = Date.now();
  const result = await processMessage(cursor, message);
  const ms = Date.now() - t0;

  const isFallback = result.reply.includes('technical issue aa gaya');
  const tag = isFallback ? '❌ FALLBACK' : '✅ REAL REPLY';

  console.log(`   priya:  "${result.reply.replace(/\n/g, '\n           ')}"`);
  console.log(`   → newStage: ${result.newStage ?? '(unchanged)'}`);
  if (result.selectedCourseId) {
    console.log(`   → selectedCourseId: ${result.selectedCourseId}`);
  }
  console.log(`   ${tag} (${ms}ms)`);

  if (result.newStage) cursor.stage = result.newStage;
  if (result.selectedCourseId) cursor.selectedCourseId = result.selectedCourseId;
}

// ── Walk the stages ───────────────────────────────────────────────────
console.log('🎭 Conversation simulator — bypasses Telegram, hits real Gemini\n');

await step('Stage 1: new — user introduces themselves', 'Hi, I\'m Sagar, attempt 2026', 'new');
await step('Stage 2: engaged — user asks about courses', 'Aapke paas konse courses hain? price kya hai?');
await step('Stage 3: interested — user picks one', 'Prelims 2026 wala dikhao, woh chahiye mujhe');
await step('Stage 4: payment_pending — bot reminds for screenshot', 'haan main screenshot bhejta hoon');
await step('Stage 5: paid — full tutor mode, conceptual question', 'Bhai Article 370 kya tha, kab hata?', 'paid');

console.log('\n' + '═'.repeat(70));
console.log('🏁 Simulation done. Delete this file (src/simulate-conversation.js) after review.');
process.exit(0);
