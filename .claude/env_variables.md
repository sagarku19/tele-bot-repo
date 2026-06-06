---
name: env-variables
description: "All env vars across upsc-bot/.env and upsc-admin/.env.local, including the BOT_TOKEN vs TELEGRAM_BOT_TOKEN gotcha"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

## `upsc-bot/.env` (template: `upsc-bot/.env.example`)
| Var | Required | Notes |
|---|---|---|
| `BOT_TOKEN` | yes | Telegram bot token from BotFather. **Note name** — not `TELEGRAM_BOT_TOKEN`. Hard-fail if missing. |
| `GEMINI_API_KEY` | yes (soft-warn) | From AI Studio. Bot boots without it but AI calls fail. |
| `FIREBASE_PROJECT_ID` | yes | Service account project. |
| `FIREBASE_CLIENT_EMAIL` | yes | Service account email. |
| `FIREBASE_PRIVATE_KEY` | yes | Service account key. Newlines must be `\n`-escaped in the env value; `config/firebase.js` does the `.replace(/\\n/g, '\n')` un-escape. |
| `FIREBASE_DATABASE_URL` | listed in example, unused | Bot uses Firestore, not RTDB. |
| `ADMIN_TELEGRAM_ID` | soft | Numeric Telegram user ID for admin gating. Without it, admin commands are disabled. |
| `PORT` | optional | Default 3000, used only for Express `/health`. |

## `upsc-admin/.env.local` (template: `upsc-admin/.env.local.example`)
| Var | Required | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | yes | e.g. `http://localhost:3001`. |
| `ADMIN_EMAIL` | yes | Login email — plain string match, no hashing. |
| `ADMIN_PASSWORD` | yes | Plain-text password compared via `===`. |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | yes | Same Firebase as the bot. |
| `BOT_TOKEN` | yes | Used by `/api/broadcast` to call `api.telegram.org/sendMessage`. ⚠️ The example file calls this `TELEGRAM_BOT_TOKEN`, but the actual code in `app/api/broadcast/route.js` reads `process.env.BOT_TOKEN`. **Use `BOT_TOKEN` in `.env.local`** — see [[admin-env-mismatch]]. |

**Why:** This mismatch will silently fail broadcasts ("Bot token not configured" 500) if a new env file is copied from the example verbatim.

**How to apply:** if broadcast is failing in dev, this is the first thing to check before deeper debugging.

Related: [[bot-architecture]], [[admin-architecture]], [[admin-env-mismatch]]
