---
name: bot-architecture
description: "upsc-bot internal layout, boot sequence, handler order, conversation flow, in-memory state"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

## Stack
Node.js (ESM, `"type": "module"`), Telegraf 4.x, `@google/generative-ai` (Gemini 1.5 Flash), `firebase-admin`, Express (only for `/health`), `axios` (download Telegram files), `node-cron` (dep present, not yet used), `dotenv`.

Scripts: `npm run dev` (`node --watch src/index.js`), `npm run start`, `npm run test` (runs `src/test-local.js` — env/courses/Firebase/Gemini/helpers smoke tests).

## Boot sequence (`src/index.js`)
1. Load `.env`, warn if any of `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`, `ADMIN_TELEGRAM_ID` missing; hard-fail if `BOT_TOKEN` missing.
2. `getDb()` (lazy Firebase init from `config/firebase.js`).
3. `initGemini()` (model: `gemini-1.5-flash`).
4. `seedCoursesFromConfig()` — idempotent; only writes Firestore docs that don't exist.
5. Construct `Telegraf(BOT_TOKEN)`.
6. **Register handlers in this exact order — order matters:**
   1. `registerAdminHandler` (commands: `/stats`, `/broadcast`, `/addcourse`, `/listpaid`, `/verify_<paymentId>`)
   2. `registerStartHandler` (`/start`)
   3. `registerPhotoHandler` (`photo` + `document`)
   4. `registerMessageHandler` (catch-all `text` — **must be last** or it shadows commands; it also early-returns on `text.startsWith('/')`)
7. Express `/health` on `PORT` (default 3000).
8. `bot.launch()` (polling mode — no webhook).
9. Graceful shutdown on `SIGINT`/`SIGTERM`.

## Source layout (actual, not the version in CLAUDE.md)
```
upsc-bot/
├── config/
│   ├── courses.config.js   # seed data for 3 default courses
│   └── firebase.js         # lazy `getDb()` singleton
└── src/
    ├── index.js            # boot
    ├── test-local.js       # smoke tests (no Telegram)
    ├── ai/
    │   ├── gemini.js       # chat() + verifyPaymentScreenshot()
    │   └── prompts.js      # STAGE_PROMPTS, PAYMENT_VERIFICATION_PROMPT, buildConversationPrompt()
    ├── db/
    │   ├── users.js        # getUser, createUser, updateUser, updateStage, getAllUsers
    │   ├── courses.js      # getCourse, getAllCourses, seedCoursesFromConfig
    │   └── payments.js     # savePayment, getPayment, updatePaymentStatus
    ├── handlers/
    │   ├── admin.js        # admin-only commands (gated by isAdmin())
    │   ├── start.js        # /start
    │   ├── photo.js        # delegates to flows/payment.js
    │   └── message.js      # delegates to flows/conversation.js
    ├── flows/
    │   ├── conversation.js # the brain — processMessage(user, text) → { reply, newStage, selectedCourseId }
    │   ├── payment.js      # processPaymentScreenshot — download → base64 → Gemini → save → grant or reject + notify admin
    │   └── access.js       # grantAccess — single-use invite links, mark user paid, notify admin
    └── utils/
        ├── helpers.js      # isAdmin, escapeMarkdownV2, formatPrice (₹ + en-IN locale), sleep, chunkArray, formatCourseList
        └── logger.js       # simple timestamped log(level, msg, data)
```

**Discrepancy with CLAUDE.md:** the README describes a `src/bot/bot.js` and a `stageManager.js` that **do not exist**. The real router is `src/flows/conversation.js`. See [[claude-md-vs-actual-structure]].

## Conversation engine (`src/flows/conversation.js`)
- Per-user in-memory `Map<telegramId, Array<{role:'user'|'model', text}>>` capped at 20 messages; `chat()` further trims to the last 10 before sending to Gemini.
- **History is in-memory only — it resets on bot restart.** Firestore stores stage but not chat transcripts.
- Stage transitions:
  - `new → engaged`: any non-`/` message of length ≥ 2 (assumed to be the user's name).
  - `engaged → interested`: message contains any keyword from a Hinglish/English list (`course`, `price`, `kitna`, `paisa`, `interested`, `haan`, `dikha`, …).
  - `interested → payment_pending`: Gemini emits a `[SELECTED_COURSE:<id>]` marker in its reply (stripped before sending to user). The matched id is persisted to the user doc as `selectedCourseId`.
  - `payment_pending → paid`: text never triggers it; **only a verified screenshot in `flows/payment.js → grantAccess` flips this**.
- On unknown stage: fallback to `engaged` prompt and reset stage to `engaged`.

## Payment flow (`src/flows/payment.js`)
Only runs when user is in `payment_pending` (gate in `handlers/photo.js`). Steps: get file_id → `ctx.telegram.getFile` → download via `https://api.telegram.org/file/bot<TOKEN>/<path>` (note: token-in-URL — see [[security-considerations]]) → base64 → `verifyPaymentScreenshot()` → `savePayment()` → branch on `isValid && confidence !== 'low'`:
- **Valid:** mark payment `verified`, call `grantAccess(ctx, user, courseId)`.
- **Invalid:** mark `rejected`, reply with reason bullets, ask for resend. Admin gets a notification with a `/verify_<paymentId>` callback command for manual override.

## Access grant (`src/flows/access.js`)
- `ctx.telegram.createChatInviteLink(channelId, { member_limit: 1, name: '<user> - <courseId>' })` — single-use, named per-purchase.
- Sends welcome message + channel/group links to user, updates user `{ isPaid: true, paidCourseIds: [..., courseId], stage: 'paid' }`, notifies admin.
- If `course.channelId` is the `@handle` form, `createChatInviteLink` may fail unless the bot is admin of that chat — current config uses `@channel`-style placeholders ([[firebase-schema]]).

Related: [[bot-funnel-stages]], [[firebase-schema]], [[admin-commands]], [[security-considerations]]
