/**
 * One-time bootstrap: insert placeholder rows into the Firestore `links`
 * collection. Run once after deploying chat-persistence:
 *
 *   cd upsc-bot && node scripts/seed-links.js
 *
 * Safe to re-run: checks existence first and skips any doc that already exists.
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
