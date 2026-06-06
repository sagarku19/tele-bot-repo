# 🤖 UPSC Bot

A Telegram bot for UPSC exam preparation — powered by Anthropic Claude, Firebase, and Telegraf.

## What it actually does

The bot is a Hinglish UPSC mentor named **Priya** that runs a staged sales funnel and only unlocks full tutor features after a course purchase. It is **not** a generic Q&A bot — arbitrary photos and questions before purchase are routed through the funnel, not answered directly.

### Conversation funnel
`new → engaged → interested → payment_pending → paid`

- **`new`** — `/start` greets the user and asks for name + attempt year.
- **`engaged` / `interested`** — Priya probes prep level and walks the course catalog in Hinglish until the user signals intent.
- **`payment_pending`** — bot asks for a UPI / gift-card payment **screenshot**. Photos sent at any other stage are ignored.
- **`paid`** — bot generates a single-use Telegram invite link to the course's channel + group and switches to tutor mode.

### Post-purchase tutor mode (only at `paid`)
- AI Q&A on UPSC topics
- Handwritten-answer evaluation from photos
- MCQs and book references (Laxmikanth, Spectrum, Shankar IAS, NCERTs)

### Operator tools
- Admin panel (`upsc-admin/`, port 3001) for users, courses, payments, broadcasts
- Telegram admin commands gated by `ADMIN_TELEGRAM_ID` (see [Admin Commands](#admin-commands) below)

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A [Telegram Bot Token](https://core.telegram.org/bots#botfather) from @BotFather
- An [Anthropic API Key](https://console.anthropic.com/settings/keys)
- A [Firebase project](https://console.firebase.google.com/) with Firestore enabled

---

## Step-by-Step Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd upsc-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Open `.env` and set the following values:

| Variable                | Required? | Description                                                                                  |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `BOT_TOKEN`             | yes       | Telegram bot token from @BotFather                                                           |
| `ANTHROPIC_API_KEY`     | yes       | Anthropic API key — required at boot |
| `ANTHROPIC_MODEL`       | optional  | Claude model ID (default `claude-haiku-4-5`) |
| `FIREBASE_PROJECT_ID`   | yes       | Firebase project ID                                                                          |
| `FIREBASE_PRIVATE_KEY`  | yes       | Firebase service account private key (with `\n` escapes preserved)                           |
| `FIREBASE_CLIENT_EMAIL` | yes       | Firebase service account email                                                               |
| `ADMIN_TELEGRAM_ID`     | optional  | Your numeric Telegram user ID — without it, admin commands are disabled                      |
| `PORT`                  | optional  | Express server port (default `3000`)                                                         |
| `ENABLE_SIMULATOR`      | optional  | Set to `true` to expose `/sim` browser chat UI on `http://127.0.0.1:<PORT>/sim` (off by default) |
| `USE_TEST_COURSES`      | optional  | Set to `true` to load `config/courses.test.config.js` instead of the production catalog (still writes to the same Firestore — `test-*` IDs persist) |
| `FIREBASE_DATABASE_URL` | unused    | Listed in `.env.example` for legacy reasons; we use Firestore, not Realtime Database         |

### 4. Set up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Cloud Firestore** in the Firebase Console
4. Go to **Project Settings → Service Accounts**
5. Click **Generate New Private Key** and copy the values into your `.env`

### 5. Configure courses

Edit `config/courses.config.js` to add your own courses. Each course needs:

- `id` — unique identifier
- `name` — display name
- `description` — course description
- `price` — price in INR
- `channelId` — Telegram channel username or ID
- `groupId` — Telegram group username or ID
- `welcomeMessage` — message sent after enrolment

### 6. Start the bot

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### 7. Verify it works

1. Open Telegram and search for your bot
2. Send `/start` — you should receive a welcome message
3. Ask a UPSC-related question — the AI should respond
4. Or run the smoke-test suite without touching Telegram:

   ```bash
   npm run test
   ```

   Test 4 distinguishes a real Claude reply from the swallowed-error fallback string — if it fails with *"Got the Hinglish fallback…"*, the real Anthropic call returned 4xx/5xx (most often a bad key or rate limit). Check the `[claude] Chat error:` log above for the exact response.

---

## Dev tools

### Browser conversation simulator (`/sim`)

For iterating on Priya's prompts and stage flow without going through Telegram, enable the simulator:

```powershell
$env:ENABLE_SIMULATOR = "true"
npm run dev
```

Then open **`http://127.0.0.1:3000/sim`** in Chrome. The page is a Telegram-styled chat UI bound to `processMessage()` — same model, same prompts, same Firestore-read for courses — but the user is ephemeral in-memory (no Firestore `users` writes) and history is wiped on bot restart or the **Reset** button. Sidebar shows current stage, selectedCourseId, message count, and last reply latency with a `✅ real` / `❌ fallback` badge.

The Express listener binds to `127.0.0.1` only when the simulator is enabled, so `/sim` and `/health` are unreachable from any other machine on your network.

### Test course catalog

To exercise pricing tiers or new course shapes without touching the production catalog, use the test catalog:

```powershell
$env:USE_TEST_COURSES = "true"
npm run dev
```

Boot log shows `[courses] Loaded 🧪 TEST catalog (N courses)` instead of `production`. Edit `config/courses.test.config.js` freely — IDs are `test-*` so they don't collide with production IDs.

**Caveats:**
- Seeding still writes to the **same Firestore project** as production. `test-*` docs persist as separate documents. Delete them via the Firebase console → `courses` collection when you're done.
- Once seeded, `getAllCourses()` returns both prod and test courses regardless of the env var. To restore a prod-only catalog, delete the test docs.
- Placeholder `channelId` / `groupId` in the example test config won't resolve to real chats, so `grantAccess` will fail at `createChatInviteLink` if a simulator user reaches `paid`. Replace with real chat IDs if you want to test the full grant path, and only against chats the bot is admin of.

### AI provider

The bot uses Anthropic Claude exclusively. Set `ANTHROPIC_API_KEY` in `.env`. To override the default model:

```
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Defaults to `claude-haiku-4-5` — fast and cheap, plenty for the Hinglish conversational persona. Use Sonnet 4.6 if the "paid" UPSC tutor stage needs more nuance.

---

## Project Structure

```
upsc-bot/
├── src/
│   ├── handlers/          # Telegraf command & message handlers
│   │   ├── start.js       # /start — reset user to "new", send Hinglish welcome
│   │   ├── message.js     # Catch-all text — delegates to flows/conversation.js (stage router)
│   │   ├── photo.js       # Photo handler — only acts at stage "payment_pending"; routes to flows/payment.js
│   │   └── admin.js       # Admin-only commands (gated by ADMIN_TELEGRAM_ID)
│   ├── ai/                # AI provider + prompt templates
│   │   ├── prompts.js     # STAGE_PROMPTS, vision-verification prompt, buildConversationPrompt()
│   │   ├── constants.js   # Shared CHAT_FALLBACK_REPLY string (consistent bot voice)
│   │   └── claude.js      # Anthropic Claude (text only — vision verification is manual)
│   ├── db/                # Firestore database layer
│   │   ├── users.js       # User CRUD
│   │   ├── courses.js     # Course CRUD + seeding
│   │   └── payments.js    # Payment records
│   ├── flows/             # Multi-step conversation flows
│   │   ├── conversation.js # Flow state machine
│   │   ├── payment.js     # Payment flow
│   │   └── access.js      # Channel/group access control
│   ├── utils/             # Shared utilities
│   │   ├── logger.js      # Logger
│   │   └── helpers.js     # Helper functions
│   ├── simulator.js       # Optional /sim browser chat UI (ENABLE_SIMULATOR=true)
│   ├── test-local.js      # Smoke-test suite (npm run test)
│   └── index.js           # Entry point
├── config/
│   ├── firebase.js              # Firebase Admin SDK init
│   ├── courses.config.js        # Production course catalog
│   └── courses.test.config.js   # Test catalog (loaded when USE_TEST_COURSES=true)
├── .env.example           # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Admin Commands

| Command                  | Description                  |
| ------------------------ | ---------------------------- |
| `/stats`                 | Show user count and uptime   |
| `/broadcast <message>`   | Send a message to all users  |

---

## License

ISC