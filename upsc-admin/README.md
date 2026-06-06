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
   *Note: Ensure your `FIREBASE_PRIVATE_KEY` is formatted correctly with `\n` replacing literal newlines, or wrap it in double quotes.*

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
