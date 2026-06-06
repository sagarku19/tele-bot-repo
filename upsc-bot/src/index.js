import 'dotenv/config';
import { Telegraf } from 'telegraf';
import express from 'express';
import { getDb } from '../config/firebase.js';
import { initProviders } from './ai/providers/index.js';
import { seedCoursesFromConfig } from './db/courses.js';
import { registerAdminHandler } from './handlers/admin.js';
import { registerStartHandler } from './handlers/start.js';
import { registerPhotoHandler } from './handlers/photo.js';
import { registerMessageHandler } from './handlers/message.js';
import { registerSimulatorRoutes } from './simulator.js';

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    // ── 1. Load environment & validate critical vars ────────────────
    console.log('[boot] Starting UPSC Bot...');

    if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is not set in .env');
    if (!process.env.GEMINI_API_KEY) console.warn('[boot] ⚠️  GEMINI_API_KEY not set — AI features will fail');
    if (!process.env.FIREBASE_PROJECT_ID) console.warn('[boot] ⚠️  FIREBASE_PROJECT_ID not set');
    if (!process.env.ADMIN_TELEGRAM_ID) console.warn('[boot] ⚠️  ADMIN_TELEGRAM_ID not set — admin commands disabled');

    // ── 2. Initialize Firebase ──────────────────────────────────────
    console.log('[boot] Initializing Firebase...');
    getDb(); // triggers lazy init
    console.log('[boot] ✅ Firebase ready');

    // ── 3. Initialize AI providers ──────────────────────────────────
    console.log('[boot] Initializing AI providers...');
    initProviders();
    console.log('[boot] ✅ AI providers ready');

    // ── 4. Seed courses from config (idempotent) ────────────────────
    console.log('[boot] Seeding courses...');
    await seedCoursesFromConfig();
    console.log('[boot] ✅ Courses seeded');

    // ── 5. Create Telegraf bot ──────────────────────────────────────
    const bot = new Telegraf(process.env.BOT_TOKEN);
    console.log('[boot] ✅ Telegraf bot created');

    // ── 6. Register all handlers (order matters!) ───────────────────
    registerAdminHandler(bot);     // /stats, /broadcast, /addcourse, /listpaid, /verify_* — FIRST
    registerStartHandler(bot);     // /start command
    registerPhotoHandler(bot);     // photo & document messages
    registerMessageHandler(bot);   // catch-all text — MUST be LAST

    console.log('[boot] ✅ All handlers registered (admin → start → photo → text)');

    // ── 7. Express health-check server ──────────────────────────────
    const app = express();

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', bot: 'running' });
    });

    registerSimulatorRoutes(app);

    // Bind to loopback only — /health and /sim must not be reachable from
    // outside this machine.
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`[boot] ✅ Express health-check on port ${PORT} (127.0.0.1 only)`);
    });

    // ── 8. Launch bot in polling mode ───────────────────────────────
    await bot.launch();
    console.log(`[boot] 🤖 Bot running on port ${PORT}`);
    console.log(`[boot] Admin ID: ${process.env.ADMIN_TELEGRAM_ID || 'NOT SET'}`);

    // ── 9. Graceful shutdown ────────────────────────────────────────
    const shutdown = (signal) => {
      console.log(`[bot] ${signal} received — shutting down gracefully`);
      bot.stop(signal);
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('[boot] ❌ Fatal error:', err.message);
    process.exit(1);
  }
}

main();
