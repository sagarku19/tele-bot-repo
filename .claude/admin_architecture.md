---
name: admin-architecture
description: "upsc-admin Next.js dashboard layout, routes, auth, API endpoints, UI conventions"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

## Stack
Next.js **16.2.7** (App Router), React 19.2, Tailwind CSS **v4** (via `@tailwindcss/postcss`), `next-auth` 4.24 (JWT + Credentials), `firebase-admin` 13.10, `recharts` 3.8. Uses `jsconfig.json` `@/*` path alias.

**Important:** `upsc-admin/CLAUDE.md` says `@AGENTS.md`, and `upsc-admin/AGENTS.md` warns: *"This is NOT the Next.js you know. APIs, conventions, and file structure may differ from your training data. Read `node_modules/next/dist/docs/` before writing any code."* — Treat Next.js 16 as breaking from your training. See [[nextjs-16-warning]].

Scripts: `npm run dev` (port **3001**), `npm run build`, `npm run start` (also 3001), `npm run lint`.

## Source layout
```
upsc-admin/
├── middleware.js                            # withAuth — protects everything except /login, /api/auth, _next/*, favicon
├── lib/
│   ├── auth.js                              # NextAuth config: CredentialsProvider against ADMIN_EMAIL/PASSWORD env
│   └── firebase.js                          # same lazy-init pattern as bot
├── components/
│   ├── Providers.js                         # client SessionProvider
│   ├── Sidebar.js                           # nav (Dashboard/Users/Courses/Payments/Broadcast) + signOut
│   ├── StatsCard.js                         # metric card with colored left border
│   ├── UserTable.js                         # exports badgeColors map for stages
│   └── PaymentCard.js                       # screenshot thumb + Gemini analysis + Verify/Reject buttons
└── app/
    ├── layout.js                            # root layout, Geist fonts, wraps with Providers
    ├── globals.css                          # Tailwind v4 + dark theme variables
    ├── (auth)/login/page.js                 # client form → signIn('credentials')
    ├── (dashboard)/
    │   ├── layout.js                        # useSession({required:true}); fixed 64-wide Sidebar + ml-64 main
    │   ├── page.js                          # / — 4 StatsCards + Recharts BarChart + recent users (auto-refresh 30s)
    │   ├── users/page.js                    # search + stage filter, calls /api/users
    │   ├── courses/page.js                  # grid of cards + inline create/edit form, soft-delete via PATCH active:false
    │   ├── payments/page.js                 # tabs pending/verified/rejected, PaymentCard list, PATCH status
    │   └── broadcast/page.js                # target stage select, message textarea, estimated recipient count
    └── api/
        ├── auth/[...nextauth]/route.js      # NextAuth handler (GET+POST)
        ├── stats/route.js                   # GET — aggregates counts, stage breakdown, naive revenue (paidUsers * avgCoursePrice)
        ├── users/route.js                   # GET — orderBy createdAt desc, limit 100
        ├── courses/route.js                 # GET/POST/PATCH/DELETE — DELETE is soft (sets active:false)
        ├── payments/route.js                # GET (filter by ?status=), PATCH (set status, +verifiedAt if verified)
        └── broadcast/route.js               # POST — iterates users, raw fetch to api.telegram.org/sendMessage, 50ms sleep between
```

## Auth model
- Single credentialed admin user; comparison is plain `===` against `process.env.ADMIN_EMAIL` / `ADMIN_PASSWORD`. No password hashing — env is the source of truth.
- JWT session strategy (`session.strategy: 'jwt'`). `pages.signIn: '/login'`.
- Every API route re-checks `getServerSession(authOptions)` → 401 if absent. Middleware also gates routes via `withAuth`.

## Dashboard data flow
- `/` calls both `/api/stats` and `/api/users` on mount, then polls `/api/stats` every 30s via `setInterval` (the code refetches both via `fetchData`).
- **Revenue calc is naive:** `paidUsers * (avg of all course prices)` — does **not** sum actual `paidCourseIds × course.price`. Flag this if accuracy matters. ([[admin-known-issues]])
- Stage breakdown chart uses fixed colors: new=slate, engaged=blue, interested=yellow, payment_pending=orange, paid=green. Same palette as `components/UserTable.js` `badgeColors`.

## Broadcast endpoint
- Reads `BOT_TOKEN` (note: env name is `BOT_TOKEN`, **not** `TELEGRAM_BOT_TOKEN`, despite what the example file suggests — see [[admin-env-mismatch]]).
- Loops users (optionally filtered by `stage`), `sleep(50)` between sends. Sequential, no concurrency. ~20 msgs/sec — well under Telegram's ~30/sec global cap.
- No retry/backoff on 429.

## Payments PATCH
When the admin clicks "Verify & Grant Access" on `/payments`, the API only flips `status: 'verified'` and sets `verifiedAt`. There is a `console.log("TODO: trigger bot access grant for payment ${paymentId}")` — **the admin panel does NOT currently call back into the bot to actually grant channel/group access**. The bot's auto-flow handles new payments end-to-end; the admin's manual "Verify" path is incomplete. ([[admin-known-issues]])

Related: [[firebase-schema]], [[env-variables]], [[nextjs-16-warning]], [[admin-known-issues]], [[admin-env-mismatch]]
