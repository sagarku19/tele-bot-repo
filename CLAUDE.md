# UPSC Bot — Project Bible

## Project overview
An automated AI-powered Telegram chatbot (UPSC Bot) that engages users, guides them through UPSC current-affairs and exam preparation, and sells courses using conversational Hinglish. Split into two integrated codebases:

1. **upsc-bot** — Telegraf-based Node.js Telegram bot. Customer-facing. Conversation engine powered by Claude, payment screenshot processing, channel/group access provisioning.
2. **upsc-admin** — Next.js 16 admin dashboard on port 3001. Operator-facing. Reads/writes the same Firestore as the bot. Used to verify payments, manage courses, broadcast messages, and watch funnel metrics.

**Tech stack:**
- **Bot:** Node.js (ESM, `"type": "module"`), Telegraf 4.x, `@anthropic-ai/sdk` (Claude Haiku 4.5), `firebase-admin`, Express (only for `/health`), `axios`, `node-cron` (dependency, not yet used), `dotenv`.
- **Admin:** Next.js **16.2.7** (App Router), React 19.2, Tailwind CSS **v4** (CSS-based config — no `tailwind.config.js`), NextAuth 4 (JWT + Credentials), `firebase-admin`, Recharts.
- **Shared DB:** Firebase Firestore via `firebase-admin` service-account credentials.

⚠️ **Next.js 16 warning:** `upsc-admin/AGENTS.md` says "This is NOT the Next.js you know — APIs, conventions, and file structure may differ from your training data. Read `node_modules/next/dist/docs/` before writing any code." Treat v16 + Tailwind v4 as breaking from older patterns.

## Agent roles (use these when scoping a task)

| Role | Owns | Touches |
|---|---|---|
| **Bot** | `upsc-bot/src/handlers/*`, `upsc-bot/src/flows/*`, `upsc-bot/src/index.js` | Telegraf commands, message routing, payment flow, access grant |
| **Admin** | `upsc-admin/app/(dashboard)/*`, `upsc-admin/app/api/*`, `upsc-admin/components/*` | Next.js pages, API routes, dashboard UI, dark Tailwind theme |
| **AI-Prompts** | `upsc-bot/src/ai/claude.js`, `upsc-bot/src/ai/prompts.js`, `upsc-bot/src/ai/constants.js` | Persona (Hinglish "Priya"), stage prompts, Anthropic chat() implementation |
| **Database** | `upsc-bot/src/db/{users,courses,payments}.js`, `upsc-bot/config/firebase.js`, `upsc-admin/lib/firebase.js` | Firestore schema and CRUD; affects both sides |

A stage-flow change usually crosses **Bot + AI-Prompts + Admin** (the badge color + chart). A "verify payment manually" change is usually **Admin** alone — except today the verify endpoint doesn't actually grant access (see Known limitations).

## Architecture

### Folder structure

#### upsc-bot/
```
upsc-bot/
├── config/
│   ├── courses.config.js        # 3 seeded courses (prelims-2026, mains-answer-writing, current-affairs-monthly)
│   ├── courses.test.config.js   # alternate catalog loaded when USE_TEST_COURSES=true (test-* IDs)
│   └── firebase.js              # lazy getDb() singleton
└── src/
    ├── index.js              # boot: env check → Firebase → Claude → seed courses → handlers → Express /health → bot.launch (polling)
    ├── test-local.js         # smoke tests: env vars, courses, Firestore write/read/delete, Claude chat, helpers
    ├── simulator.js          # optional /sim browser chat UI (gated by ENABLE_SIMULATOR=true)
    ├── ai/
    │   ├── claude.js         # Anthropic provider: init, chat
    │   ├── prompts.js        # STAGE_PROMPTS object, buildConversationPrompt(stage, user, msg, catalog)
    │   └── constants.js      # CHAT_FALLBACK_REPLY (shared)
    ├── db/
    │   ├── users.js          # getUser, createUser, updateUser, updateStage, getAllUsers
    │   ├── courses.js        # getCourse, getAllCourses (no active filter), seedCoursesFromConfig
    │   └── payments.js       # savePayment, getPayment(telegramId, courseId), updatePaymentStatus
    ├── handlers/
    │   ├── admin.js          # /stats, /broadcast, /addcourse, /listpaid, /verify_<paymentId>  (gated by isAdmin)
    │   ├── start.js          # /start — create/refresh user, reset stage to "new", send Hinglish welcome
    │   ├── photo.js          # gates on stage==="payment_pending", delegates to flows/payment.js
    │   └── message.js        # catch-all text — delegates to flows/conversation.js, persists stage transitions
    ├── flows/
    │   ├── conversation.js   # processMessage(user, text) — the real stage router (NOT a "stageManager.js")
    │   ├── payment.js        # processPaymentScreenshot — save screenshot as pending, reply "wait for verification", notify admin (manual review only)
    │   └── access.js         # grantAccess — single-use invite links, mark user paid, send welcome
    └── utils/
        ├── helpers.js        # isAdmin, escapeMarkdownV2, formatPrice (₹ + en-IN), sleep, chunkArray, formatCourseList
        └── logger.js         # log(level, msg, data) — most code uses raw console.log with [area] prefix instead
```

#### upsc-admin/
```
upsc-admin/
├── middleware.js                            # withAuth — protects everything except /login, /api/auth, _next/*
├── next.config.mjs
├── postcss.config.mjs
├── eslint.config.mjs
├── jsconfig.json                            # @/* path alias = project root
├── AGENTS.md                                # Next.js 16 warning (load-bearing)
├── lib/
│   ├── auth.js                              # NextAuth CredentialsProvider, JWT, signIn=/login
│   └── firebase.js                          # lazy getDb() — same pattern as bot
├── components/
│   ├── Providers.js                         # client SessionProvider
│   ├── Sidebar.js                           # Dashboard / Users / Courses / Payments / Broadcast + Logout
│   ├── StatsCard.js                         # metric card, colored left border
│   ├── UserTable.js                         # exports badgeColors map for stages
│   └── PaymentCard.js                       # screenshot thumb + Verify/Reject buttons
└── app/                                     # NOTE: no `src/` directory — files live at app root
    ├── layout.js                            # Geist fonts, wraps with Providers
    ├── globals.css                          # Tailwind v4 + dark theme variables
    ├── (auth)/login/page.js                 # client form → signIn('credentials')
    ├── (dashboard)/
    │   ├── layout.js                        # useSession({required:true}); fixed 64-wide Sidebar + ml-64 main
    │   ├── page.js                          # / — 4 StatsCards + Recharts BarChart + recent users (polls every 30s)
    │   ├── users/page.js                    # search + stage filter
    │   ├── courses/page.js                  # grid + inline create/edit; DELETE = soft (active:false)
    │   ├── payments/page.js                 # tabs pending/verified/rejected, PaymentCard list
    │   └── broadcast/page.js                # target stage, message textarea, estimated count
    └── api/
        ├── auth/[...nextauth]/route.js
        ├── stats/route.js                   # GET — counts, stage breakdown, naive revenue
        ├── users/route.js                   # GET — orderBy createdAt desc, limit 100
        ├── courses/route.js                 # GET/POST/PATCH/DELETE (soft)
        ├── payments/route.js                # GET (?status=), PATCH — only flips status; does NOT grant access (TODO in code)
        └── broadcast/route.js               # POST — sequential, 50ms sleep between sends
```

### Data flow
1. **User message:** text or photo arrives via Telegram.
2. **Routing:** `handlers/message.js` (text) or `handlers/photo.js` (image) fetches the user from Firestore via `db/users.js`.
3. **Stage logic:** `flows/conversation.js → processMessage(user, text)` picks the stage branch, calls `ai/claude.js → chat()` with a stage-specific prompt from `ai/prompts.js`, returns `{ reply, newStage, selectedCourseId }`.
4. **Persistence:** the handler writes the new stage / selectedCourseId back to Firestore.
5. **Payment branch:** photos in `payment_pending` stage route to `flows/payment.js` — the bot saves the screenshot as a pending payment and notifies the admin for manual review.
6. **Admin observation:** `upsc-admin` reads Firestore directly; no shared service runtime.

⚠️ **Conversation history is in-memory only.** `flows/conversation.js:10` keeps a `Map<telegramId, history>` as a ring buffer of 20 messages, but `claude.js chat()` slices to the **last 10** before sending to the model — so the model sees 10, not 20. Firestore stores stage but not chat transcripts. History is lost on bot restart.

## Firebase schema

### `users` (doc ID = stringified Telegram user ID)
- `telegramId` (number) — same as doc ID, but as a number.
- `name` (string) — Telegram first+last, or whatever the user typed on first message.
- `username` (string) — Telegram `@handle` (no `@`).
- `stage` (string) — `new | engaged | interested | payment_pending | paid`.
- `isPaid` (boolean) — true once any course is granted.
- `paidCourseIds` (string[]) — course IDs the user owns.
- `selectedCourseId` (string, optional) — set on transition to `payment_pending`, used by photo handler.
- `createdAt`, `lastSeen` (ISO strings).

### `courses` (doc ID = course slug for seeded courses; auto-ID for admin-created)
- `id` (string) — slug like `prelims-2026`. **Seeded courses have it; admin-created courses do NOT have an `id` field** because `app/api/courses/route.js` POST doesn't set it.
- `name`, `description`, `welcomeMessage` (strings).
- `price` (number, INR rupees).
- `channelId`, `groupId` (string) — `@handle` or `-100…` chat ID. **Bot must be admin of these chats** for `createChatInviteLink` to work.
- `active` (boolean) — soft-delete flag. **The bot does NOT filter on this** — `db/courses.js → getAllCourses()` returns everything.
- `createdAt` (ISO string).

### `payments` (auto-generated doc ID)
- `telegramId` (string) — stored as string to match `users` doc IDs.
- `courseId` (string).
- `screenshotUrl` (string) — a `https://api.telegram.org/file/bot<BOT_TOKEN>/...` URL. ⚠️ **Embeds the live bot token** and expires after ~1h.
- `status` (string) — `pending | verified | rejected`.
- `verifiedAt`, `createdAt` (ISO strings).

### Stage flow
`new` → `engaged` → `interested` → `payment_pending` → `paid`

Transitions (in `flows/conversation.js`):
- `new → engaged`: any non-`/` message of length ≥ 2 (assumed to be the user's name).
- `engaged → interested`: message contains any of a Hinglish/English keyword list (`course`, `price`, `kitna`, `paisa`, `haan`, `interested`, `dikha`, …).
- `interested → payment_pending`: Claude embeds `[SELECTED_COURSE:<id>]` in its reply. The flow strips the tag, captures the id, persists to `users.selectedCourseId`.
- `payment_pending → paid`: **text never triggers it.** Only a successful payment verification in `flows/payment.js → grantAccess` flips it.

## Environment variables

### `upsc-bot/.env`
- `BOT_TOKEN` — Telegram bot token from [@BotFather](https://t.me/BotFather). Hard-fail on missing.
- `ANTHROPIC_API_KEY` — from [Anthropic Console](https://console.anthropic.com/settings/keys). Hard-fail on missing.
- `ANTHROPIC_MODEL` *(optional)* — model ID. Defaults to `claude-haiku-4-5`. Override to `claude-sonnet-4-6` for nuanced answers in the paid tutor stage.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — service account. Private key newlines must be `\n`-escaped; `config/firebase.js` un-escapes.
- `ADMIN_TELEGRAM_ID` — numeric Telegram user ID for admin-command gating. Without it, admin commands are disabled. Get from [@userinfobot](https://t.me/userinfobot).
- `FIREBASE_DATABASE_URL` — listed in `.env.example` but unused (we use Firestore, not RTDB).
- `PORT` — default 3000, only for Express `/health`.
- `ENABLE_SIMULATOR` *(optional)* — set to `true` to expose the `/sim` browser chat UI at `http://127.0.0.1:<PORT>/sim`. When enabled, Express binds to `127.0.0.1` only, so `/sim` and `/health` are unreachable from the LAN. Off by default.
- `USE_TEST_COURSES` *(optional)* — set to `true` to load `config/courses.test.config.js` instead of the production catalog. ⚠️ Seeding still writes to the **same Firestore project** as production — `test-*` docs persist as separate documents until you delete them from the Firebase console. Once both catalogs have been seeded, `getAllCourses()` returns the union regardless of this flag.

### `upsc-admin/.env.local`
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`.
- `NEXTAUTH_URL` — e.g. `http://localhost:3001`.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — plain-text comparison via `===`. No hashing.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — same Firebase as bot.
- `BOT_TOKEN` — used by `/api/broadcast` to call `api.telegram.org/sendMessage`. ⚠️ **Use `BOT_TOKEN`, not `TELEGRAM_BOT_TOKEN`** (the example file's name is misleading — the code in `app/api/broadcast/route.js` reads `process.env.BOT_TOKEN`).

## How to run locally

1. **Install:**
   ```bash
   cd upsc-bot && npm install
   cd ../upsc-admin && npm install
   ```
2. **Fill env files** (`upsc-bot/.env` and `upsc-admin/.env.local`) — see Environment variables above.
3. **Smoke-test the bot** (no Telegram needed):
   ```bash
   cd upsc-bot && npm run test
   ```
   Tests env vars, courses config, Firestore round-trip, Claude round-trip, helpers.
4. **Start both** (two terminals):
   - Bot: `cd upsc-bot && npm run dev` → polls Telegram; Express health on port 3000.
   - Admin: `cd upsc-admin && npm run dev` → `http://localhost:3001`, login with `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Expected bot boot logs:
```
[boot] ✅ Firebase ready
[claude] Initialized with claude-haiku-4-5
[courses] Seeding complete — X new, Y already existed
[boot] ✅ All handlers registered (admin → start → photo → text)
[boot] 🤖 Bot running on port 3000
```

### Dev tools (no Telegram required)
- **Browser simulator** — set `ENABLE_SIMULATOR=true` and open `http://127.0.0.1:3000/sim` to chat with Priya from the browser. Uses the real `processMessage()` + real Firestore-read for courses, but the simulator user is ephemeral (no `users` writes) and chat history resets on bot restart. Sidebar shows current stage, `selectedCourseId`, message count, and a `✅ real` / `❌ fallback` badge per turn.
- **Test course catalog** — set `USE_TEST_COURSES=true` to seed/use `config/courses.test.config.js` (IDs are `test-*` so they don't collide). Boot log will show `[courses] Loaded 🧪 TEST catalog (N courses)`. Delete the `test-*` docs in Firestore when you're done so `getAllCourses()` doesn't keep returning them.
- Full walkthroughs and caveats: `upsc-bot/README.md` → "Dev tools".

## Bot conversation flow

Persona: **Priya** — warm Hinglish UPSC mentor. Every prompt enforces: 3–5 line replies, Hinglish style, ALWAYS ends with ONE follow-up question, never says "I am an AI".

- **new** — `/start` resets here. Bot greets, asks for name + attempt year. → `engaged` on any reply.
- **engaged** — probe preparation level; gently steer toward courses. → `interested` on course/price/`haan` keywords.
- **interested** — present catalog (injected as `{{COURSE_CATALOG}}`), recommend, confirm. → `payment_pending` when Claude emits `[SELECTED_COURSE:<id>]`.
- **payment_pending** — remind to send screenshot. Only photos in `flows/payment.js` advance the stage.
- **paid** — full UPSC tutor mode: MCQs, answer evaluation, book references (Laxmikanth, Spectrum, Shankar IAS, NCERTs).

## Admin panel

### Pages
- `/login` — credentials form.
- `/` — Dashboard: 4 StatsCards (Total / Paid / Today new / Revenue), Recharts BarChart of stage breakdown, recent 5 users. Polls every 30s.
- `/users` — table with search + stage filter.
- `/courses` — card grid with inline create/edit form. DELETE is soft (`active:false`).
- `/payments` — tabs Pending / Verified / Rejected. PaymentCard shows screenshot + Verify/Reject buttons.
- `/broadcast` — target stage select, message textarea, estimated recipient count, confirm + send.

### Admin Telegram commands (in the bot)
- `/stats` — total/paid/today users, stage breakdown, uptime.
- `/broadcast <message>` — loops all users, no inter-message delay (the web `/api/broadcast` does 50ms).
- `/addcourse` — instructs to edit `config/courses.config.js` and restart.
- `/listpaid` — lists `isPaid === true` users with their `paidCourseIds`.
- `/verify_<paymentId>` — flips that payment to `verified`. TODO: also auto-grant access (not implemented).

All gated by `isAdmin(ctx.from.id)` against `process.env.ADMIN_TELEGRAM_ID`.

## Key business logic

- **Screenshot verification:** users send a UPI / gift-card screenshot. The bot saves it as a pending payment and notifies the admin. Admins verify manually in the dashboard or via `/verify_<paymentId>` in Telegram. No AI vision verification.
- **Access grant:** single-use Telegram invite links via `ctx.telegram.createChatInviteLink(chatId, { member_limit: 1, name: '<user> - <courseId>' })`. Bot must be admin of the channel/group.
- **Broadcast rate limiting:** web endpoint sleeps 50ms between sends (~20 msg/sec, under Telegram's ~30/sec cap). Sequential, no concurrency, no 429 retry.

## Coding conventions

- **ESM only.** Bot has `"type": "module"`. Both projects use `import`/`export`.
- **Named exports** for utilities, DB, AI; **default exports** for React components and Next.js pages.
- **Defensive `try/catch`** on every async DB / network call, returning a safe fallback (null / [] / false) and a `[area] error: ...` log instead of throwing.
- **`[area]` log prefixes**: `boot`, `start`, `message`, `payment`, `users`, `courses`, `payments`, `claude`, `Firebase`, `access`, `admin`, `conversation`.
- **Lazy singletons:** `getDb()` for Firestore, `getClient()` for Anthropic — init on first use.
- **Admin API routes** always start with `const session = await getServerSession(authOptions); if (!session) return 401;`. Don't add a route without it.
- **Admin client pages** are `"use client"` + vanilla `fetch`. No SWR, no React Query.
- **Admin dark theme palette:** `bg-[#0f172a]` (page), `bg-[#1e293b]` (card), `border-slate-700`, `text-slate-100/300/400`, accent `#3b82f6`. Hex literals, not Tailwind named colors.
- **Path alias `@/`** in admin maps to project root (e.g. `@/components/Sidebar`, `@/lib/auth`).
- **No TypeScript, no Jest/Vitest, no Redux/Zustand, no `tailwind.config.js`.** Don't introduce any of these without asking.

### Adding a new conversation stage
1. Add the stage's persona prompt to `upsc-bot/src/ai/prompts.js → STAGE_PROMPTS`.
2. Add the stage branch + transition logic to `upsc-bot/src/flows/conversation.js`.
3. Add the badge color to `upsc-admin/components/UserTable.js → badgeColors`.
4. Add the stage to the hardcoded chart list in `upsc-admin/app/(dashboard)/page.js`.
5. Add `<option>` entries in `upsc-admin/app/(dashboard)/users/page.js` and `broadcast/page.js`.
6. Add the stage key to `stageBreakdown` initial object in `upsc-admin/app/api/stats/route.js`.
7. Update this CLAUDE.md.

### Adding a new admin page
1. `upsc-admin/app/(dashboard)/<feature>/page.js` with `"use client"`.
2. `upsc-admin/app/api/<feature>/route.js` with session check.
3. Add nav entry to `upsc-admin/components/Sidebar.js`.
4. Match the dark theme palette above.

### Adding a new course
1. Edit `upsc-bot/config/courses.config.js`, add an object with `id`, `name`, `description`, `price`, `channelId`, `groupId`, `welcomeMessage`. (Optionally `active: true`.)
2. Restart the bot — `seedCoursesFromConfig()` writes new courses idempotently.
3. Alternative: add via `/courses` in the admin panel — but admin-created courses lack the `id` field (auto-Firestore-ID), and the bot still reads them by doc ID, so functionally OK.

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

## Known limitations

- **Conversation history is in-memory.** Ring buffer of 20 in `flows/conversation.js:10`; only the last 10 reach the model (sliced inside `claude.js chat()`). Lost on every bot restart.
- **Admin "Verify & Grant Access" does NOT grant access.** The PATCH only sets `status:'verified'`; `console.log("TODO: trigger bot access grant for payment ${paymentId}")`. User's `isPaid` and `stage` remain unchanged unless the bot's automatic path fires.
- **Naive revenue calculation** on the dashboard: `paidUsers × avg(coursePrice)`, not the actual sum of `paidCourseIds × price`.
- **Soft-delete inconsistency:** `/api/courses DELETE` flips `active:false`, but `db/courses.js → getAllCourses()` returns all rows. "Deleted" courses still appear in the bot's `interested` stage catalog.
- **Bot token leaked in screenshot URLs.** `payments.screenshotUrl` embeds the bot token; visible to anyone with Firestore read or admin panel access.
- **Plain-text admin password.** `ADMIN_PASSWORD` compared with `===`. No hashing, no per-user accounts, no lockout.
- **No rate limiting** on user-facing bot messages. A spammy user racks up Anthropic API cost.
- **Single bot, single admin** by design.
- **Inner template placeholders are not substituted at runtime.** `templates.json` bodies contain `{{link}}`, `{{list1_link}}`, `{{list2_link}}` placeholders for live payment URLs. The bot's runtime calls `replaceMarkers` (swaps `{{TEMPLATE:<key>}}`) but NOT `substitute` (would expand `{{link}}` etc.). So combo pitches and payment links currently send literal `{{link}}` text to users. Until a `payment-links.json` + `substitute` call chain is wired in, the operator must avoid sending these templates verbatim or manually fill the placeholders in `templates.json`.

## Future improvements
- Persist conversation history to Firestore (or Redis) so it survives restart.
- Make admin "Verify" actually trigger `grantAccess` (either by importing the bot module or via an HTTP endpoint on the bot).
- Sum `paidCourseIds × price` for accurate revenue.
- Filter `getAllCourses()` on `active`, or remove the soft-delete flag.
- Download screenshots to Firebase Storage so URLs are token-free and durable.
- Hash admin password; add per-user accounts.
- Razorpay or other gateway as an alternative to gift-card screenshots.

## Commands reference

### `upsc-bot`
- `npm run dev` — `node --watch src/index.js`.
- `npm run start` — production.
- `npm run test` — `node src/test-local.js` (no Telegram, no admin needed).

### `upsc-admin`
- `npm run dev` — Next.js dev server on port **3001**.
- `npm run build` — production build.
- `npm run start` — production server on 3001.
- `npm run lint` — ESLint.
