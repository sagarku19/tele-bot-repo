---
name: run-and-test
description: "How to start the bot and admin locally, what to expect, how to test bot wiring without Telegram"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

## Bot (`upsc-bot/`)
- `npm run dev` — `node --watch src/index.js` (auto-restart on file change).
- `npm run start` — plain `node src/index.js`.
- `npm run test` — runs `src/test-local.js`, a no-Telegram smoke test: env vars present, courses config valid, Firestore write/read/delete round-trip on `__test_user_<ts>`, Gemini chat round-trip, helpers (`chunkArray`, `formatPrice`, `formatCourseList`, `sleep`). Exits 1 on any failure.

Expected stdout on boot (in order):
```
[boot] Starting UPSC Bot...
[boot] Initializing Firebase...
[Firebase] Initialized successfully
[boot] ✅ Firebase ready
[boot] Initializing Gemini AI...
[Gemini] Initialized with gemini-1.5-flash
[boot] ✅ Gemini ready
[boot] Seeding courses...
[courses] Seeding complete — X new, Y already existed
[boot] ✅ Courses seeded
[boot] ✅ Telegraf bot created
[boot] ✅ All handlers registered (admin → start → photo → text)
[boot] ✅ Express health-check on port 3000
[boot] 🤖 Bot running on port 3000
```

Health probe: `GET http://localhost:3000/health` → `{ "status": "ok", "bot": "running" }`.

Polling mode — no webhook setup needed. Bot will fail to launch if another instance is already polling the same token (Telegram returns 409 Conflict).

## Admin (`upsc-admin/`)
- `npm run dev` — Next.js dev server on **port 3001**.
- `npm run build` — production build.
- `npm run start` — production server on port 3001.
- `npm run lint` — ESLint.

Browse to `http://localhost:3001` → redirected to `/login` → enter `ADMIN_EMAIL` + `ADMIN_PASSWORD` from `.env.local`. After login: dashboard loads `/api/stats` + `/api/users`, polls every 30s.

## Running both together
The user's CLAUDE.md suggests two terminals (one for each). Both must point to the **same Firebase project** via matching `FIREBASE_*` vars or they'll see different data. The bot does not need the admin to be running, and vice versa — the admin reads/writes Firestore directly.

**How to apply:** if asked to "run the app" or "test it works," the bot's `npm run test` is the quickest answer for non-UI verification. For UI changes in admin, use `npm run dev` and visit `http://localhost:3001`.

Related: [[bot-architecture]], [[admin-architecture]], [[env-variables]]
