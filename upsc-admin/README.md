# UPSC Admin Panel

This is the Next.js admin panel for the UPSC Telegram Bot. It provides a secure, dark-themed dashboard to manage users, courses, payments, and broadcast messages.

## Tech Stack
- Next.js 16 (App Router)
- Tailwind CSS 4
- NextAuth.js (Credentials Provider)
- Firebase Admin SDK (Firestore)
- Recharts

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy the `.env.local.example` file to `.env.local` and fill in your credentials.
   ```bash
   cp .env.local.example .env.local
   ```

   | Variable                | Required? | Description                                                                                                                                  |
   | ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
   | `NEXTAUTH_SECRET`       | yes       | Random secret used to sign JWTs. Generate with `openssl rand -base64 32`.                                                                    |
   | `NEXTAUTH_URL`          | yes       | Public URL of this admin (e.g. `http://localhost:3001`). NextAuth needs it to build callback URLs.                                           |
   | `ADMIN_EMAIL`           | yes       | The single admin login email.                                                                                                                |
   | `ADMIN_PASSWORD`        | yes       | The admin password. ⚠️ Compared with plain `===` — no hashing. Use a strong value and don't reuse it elsewhere.                              |
   | `FIREBASE_PROJECT_ID`   | yes       | Firebase project ID — must point at the **same** Firestore project as `upsc-bot`.                                                            |
   | `FIREBASE_CLIENT_EMAIL` | yes       | Firebase service account email.                                                                                                              |
   | `FIREBASE_PRIVATE_KEY`  | yes       | Firebase service account private key. Keep `\n` escapes intact (or wrap the whole value in double quotes).                                   |
   | `BOT_TOKEN`             | yes       | Telegram bot token, used by `/api/broadcast` to call `sendMessage`. ⚠️ **Variable name is `BOT_TOKEN`, not `TELEGRAM_BOT_TOKEN`** — `app/api/broadcast/route.js` reads `process.env.BOT_TOKEN`. Use the same token as the bot. |

3. **Run the Development Server**
   ```bash
   npm run dev
   ```
   The admin panel will be available at [http://localhost:3001](http://localhost:3001).

4. **Build for Production**
   ```bash
   npm run build
   npm run start
   ```

## Pages Overview
- `/login`: Admin authentication portal
- `/` (Dashboard): Overview stats, funnel breakdown, and recent users
- `/users`: Full user management and search
- `/courses`: Course catalog, creation, and editing
- `/payments`: Payment verification workflows
- `/broadcast`: Direct messaging to Telegram bot users

## Architecture Notes
- The database logic uses a singleton pattern (`lib/firebase.js`) to avoid hot-reloading errors with the Firebase Admin SDK.
- Auth is handled via `next-auth` JWT strategy and protected globally using Next.js Middleware.
- API endpoints are protected using `getServerSession`.
