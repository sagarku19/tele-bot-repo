# 🤖 UPSC Bot

A Telegram bot for UPSC exam preparation — powered by Google Gemini AI, Firebase, and Telegraf.

## Features

- **AI Q&A** — Ask any UPSC-related question and get instant AI-powered answers
- **Answer Evaluation** — Send a photo of your handwritten answer for AI feedback
- **Course Management** — Browse and enrol in courses
- **Payment Flow** — Submit payment screenshots for admin verification
- **Access Control** — Automatic invite-link generation for paid channels/groups
- **Admin Tools** — `/stats` and `/broadcast` commands for admins

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A [Telegram Bot Token](https://core.telegram.org/bots#botfather) from @BotFather
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)
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
| `AI_PROVIDER`           | optional  | Active text provider: `gemini` (default) or `xai`. Vision always uses Gemini regardless     |
| `GEMINI_API_KEY`        | yes       | Google Gemini API key (required when `AI_PROVIDER=gemini`, and for vision regardless)        |
| `FIREBASE_PROJECT_ID`   | yes       | Firebase project ID                                                                          |
| `FIREBASE_PRIVATE_KEY`  | yes       | Firebase service account private key (with `\n` escapes preserved)                           |
| `FIREBASE_CLIENT_EMAIL` | yes       | Firebase service account email                                                               |
| `ADMIN_TELEGRAM_ID`     | optional  | Your numeric Telegram user ID — without it, admin commands are disabled                      |
| `PORT`                  | optional  | Express server port (default `3000`)                                                         |
| `GEMINI_MODEL`          | optional  | Gemini model ID (default `gemini-2.5-flash`). Override to e.g. `gemini-3.1-flash-lite` when free-tier RPD is tight (500/day vs 20/day) |
| `XAI_API_KEY`           | optional  | xAI API key. Required when `AI_PROVIDER=xai`. xAI account needs credits/license — unbilled accounts return 403 |
| `XAI_MODEL`             | optional  | Grok model ID (default `grok-4-fast-non-reasoning`)                                          |
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

   Test 4 distinguishes a real Gemini reply from the swallowed-error fallback string — if it fails with *"Got the Hinglish fallback…"*, the real API call returned 4xx/5xx (most often quota exhaustion or a retired model). Check the `[Gemini] Chat error:` log above for the exact response.

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

### Switching AI providers

The bot has a pluggable provider layer (`src/ai/providers/`). Active provider is chosen by `AI_PROVIDER`:

```
AI_PROVIDER=gemini   # default
AI_PROVIDER=xai      # use Grok via xAI's OpenAI-compatible API
```

| Provider | Default model | Chat | Vision |
|---|---|---|---|
| `gemini` | `gemini-2.5-flash` | ✅ | ✅ (`verifyPaymentScreenshot`) |
| `xai`    | `grok-4-fast-non-reasoning` | ✅ | ❌ (not implemented in Round 1) |

Vision (`verifyPaymentScreenshot`) always routes to Gemini regardless of `AI_PROVIDER`, but in the current `flows/payment.js` flow it's not actually called — every screenshot goes to manual admin review (the user gets a Hinglish "wait for verification" reply). The Gemini vision capability is retained for a future auto-verify toggle.

To use xAI: set `AI_PROVIDER=xai` + `XAI_API_KEY=xai-...` in `.env`. The xAI account needs credits or a license before chat requests succeed; an unbilled account returns `HTTP 403 Forbidden` with a billing link.

**Adding a new provider (e.g. Claude later):**

1. Create `src/ai/providers/<name>.js` exporting `name`, `init()`, `chat()`, and optionally `verifyPaymentScreenshot()`. Reuse `CHAT_FALLBACK_REPLY` from `src/ai/constants.js` for error returns so the bot's voice stays consistent.
2. Register the module in `src/ai/providers/index.js` by adding it to the `REGISTRY` object.
3. Document the env var (e.g. `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) in `.env.example`, `CLAUDE.md`, and this file.
4. No changes to `flows/*` or `index.js` needed — they call the facade.

### Switching Gemini models

The model is configurable via `GEMINI_MODEL` in `.env`:

```
GEMINI_MODEL=gemini-3.1-flash-lite
```

Common candidates and their free-tier daily request caps:

| Model                  | Free RPD | Notes                                 |
| ---------------------- | -------- | ------------------------------------- |
| `gemini-2.5-flash`     | 20       | Default; highest quality of the flash tier |
| `gemini-3.1-flash-lite`| 500      | 25× more headroom — best for dev      |
| `gemini-3-flash`       | 20       | Newer, non-lite                       |
| `gemini-3.5-flash`     | 20       | Newer, non-lite                       |

`thinkingBudget: 0` is set unconditionally — Flash-class models honour it (avoids ~1360 wasted thinking tokens per turn), Lite models ignore it silently. Caps change over time; check your [Google AI Studio quota dashboard](https://aistudio.google.com/app/quota) for current values.

---

## Project Structure

```
upsc-bot/
├── src/
│   ├── handlers/          # Telegraf command & message handlers
│   │   ├── start.js       # /start command
│   │   ├── message.js     # Catch-all text handler (AI Q&A)
│   │   ├── photo.js       # Photo handler (answer evaluation)
│   │   └── admin.js       # Admin-only commands (/stats, /broadcast)
│   ├── ai/                # Gemini AI integration
│   │   ├── gemini.js      # Gemini API client
│   │   └── prompts.js     # Prompt templates
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