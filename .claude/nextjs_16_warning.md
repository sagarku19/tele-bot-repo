---
name: nextjs-16-warning
description: upsc-admin/AGENTS.md explicitly warns that Next.js 16 has breaking changes from training data — verify before writing
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

**Rule:** Before writing or modifying any Next.js / React code in `upsc-admin/`, do not assume APIs from your training data are still valid. Verify against `upsc-admin/node_modules/next/dist/docs/` or current Next.js 16 docs.

**Why:** `upsc-admin/CLAUDE.md` is a single line `@AGENTS.md`, and `upsc-admin/AGENTS.md` is an explicit user-authored warning:
> "This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."

This is a load-bearing instruction in the project. The user set it up because past sessions presumably wrote outdated patterns. Treat it as a hard precondition.

**How to apply:**
- Before writing any admin code: Glob `upsc-admin/node_modules/next/dist/docs/**` for the relevant area (routing, server actions, middleware, layouts, Tailwind setup, etc.) and Read.
- If you can't find a docs file for the specific feature, ask the user how it works in v16 — don't guess.
- Specifically, things that may have changed: `next.config.js` → `next.config.mjs` shape, server component vs client component rules, `cookies()`/`headers()` async behavior, `middleware.js` matcher format, `params`/`searchParams` being promises, Tailwind v4 CSS-based config (no `tailwind.config.js`), `next/font/google` API.
- Existing files in the repo (e.g. `middleware.js`, `app/(dashboard)/layout.js`) are the safest stylistic reference — match them.

Related: [[admin-architecture]], [[admin-known-issues]]
