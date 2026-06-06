<!-- This file mirrors AGENTS.md so Claude Code, Cursor, Codex, and other agents
     all see the load-bearing Next.js 16 warning regardless of which file they read.
     If you change one, change the other. -->

# This is NOT the Next.js you know

This project runs **Next.js 16.2.7 + React 19.2 + Tailwind v4**. APIs, conventions, and file structure differ from older Next.js you may have in training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code, and heed deprecation notices.

## Concrete v16 / v15 gotchas in this codebase

Don't trust your defaults here — these will bite:

- **`params` and `searchParams` are Promises in Server Components.** Any new dynamic page (`app/(dashboard)/users/[id]/page.js`, etc.) must `await` them: `const { id } = await params;`. The synchronous v13/v14 pattern is gone.
- **`cookies()`, `headers()`, and `draftMode()` are async.** Always `await` them in Server Components and route handlers. Existing code uses `getServerSession(authOptions)` from NextAuth 4, which handles this internally — don't replace it with raw `cookies()` calls without awaiting.
- **Route Handlers parse query strings via `new URL(request.url).searchParams`** (see `app/api/courses/route.js:83`, `app/api/payments/route.js:15`). Don't reach for `req.query` — that was Pages Router and never existed in App Router.
- **Tailwind v4 has no `tailwind.config.js`.** Theme tokens live in `app/globals.css` inside an `@theme` block, imported via `@import "tailwindcss"`. PostCSS uses `@tailwindcss/postcss` (see `postcss.config.mjs`), not the `tailwindcss` plugin directly. Don't add a JS config file — it will be ignored.
- **File layout: no `src/` directory.** App Router files live at `app/...` at the project root. The `@/*` path alias (see `jsconfig.json`) resolves to the project root, so `@/components/Sidebar` → `./components/Sidebar.js`.
- **`middleware.js` lives at the admin project root**, not inside `app/` or `src/`. The `withAuth` wrapper is from `next-auth/middleware` (v4), not Next's own middleware helpers.
- **Client components must declare `"use client"` on the first line.** All `app/(dashboard)/*/page.js` files in this project are client components using vanilla `fetch` — no SWR, no React Query. Don't add a Server Action without confirming first.

If you're unsure whether an API is current, check `node_modules/next/dist/docs/` rather than guessing from memory.

For the wider project (bot side, Firestore schema, conventions, log prefixes), see the root `CLAUDE.md`.
