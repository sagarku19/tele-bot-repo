---
name: coding-conventions
description: "Code style patterns observed across both projects — ESM, named exports, defensive try/catch, [tag] logging"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

## Both projects
- **ESM only.** Bot has `"type": "module"`; admin is Next.js 16 (ESM by default).
- **Named exports for utilities and DB functions.** React components and Next.js pages use default exports.
- **Every async DB / external call is wrapped in `try/catch`** and returns a safe fallback (null / empty array / false) rather than throwing. Errors are logged with `[area] ...` prefix and a short message.

## Bot
- **Logging convention:** `console.log('[area] message')` where area is `boot`, `start`, `message`, `payment`, `users`, `courses`, `payments`, `Gemini`, `Firebase`, `access`, `admin`, `conversation`. `utils/logger.js` exists but isn't widely used — most modules use raw `console.log` with the prefix convention.
- **Lazy singletons:** `getDb()` (Firestore) and `initGemini()`/`getModel()` (Gemini) both init on first use, then cache.
- **Hinglish in user-facing strings** — error fallbacks too (`'Arre yaar, abhi thoda technical issue aa gaya 😅'`). Match this voice for any user-visible text.
- **Stage transitions return an object** `{ reply, newStage, selectedCourseId }` from `processMessage` — the handler decides what to write back to Firestore. Keep that separation; don't write Firestore directly from `flows/conversation.js`.

## Admin
- **Every API route starts with:**
  ```js
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  ```
  Maintain this. Don't add a route without it.
- **Client pages are `"use client"`** and fetch from `/api/*` with vanilla `fetch`. No SWR or React Query.
- **Dark theme using hex literals**: `bg-[#0f172a]` (page bg), `bg-[#1e293b]` (card bg), `border-slate-700`, accent `#3b82f6` (blue). Use these for consistency.
- **Path alias `@/`** maps to project root (via `jsconfig.json`). Import as `@/components/Foo`, `@/lib/auth`.
- **Confirmation dialogs:** destructive actions use plain `confirm(...)`. No custom modal library.

## What NOT to add
- No TypeScript — both projects are plain JS. Don't introduce `.ts` files.
- No test framework — only `upsc-bot/src/test-local.js` exists, a hand-rolled assertion script. Don't pull in Jest/Vitest unprompted.
- No state libraries (Redux/Zustand) on the admin side — `useState`/`useEffect` only.

**How to apply:** when writing new code, match the patterns above. Don't refactor existing files into a new style without being asked.

Related: [[bot-architecture]], [[admin-architecture]]
