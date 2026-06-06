---
description: Audit a file or area of the UPSC Bot project and propose concrete improvements ranked by impact
argument-hint: <file path | "bot" | "admin" | "ai-prompts" | "database" | "all">
---

You are a senior code reviewer for the UPSC Bot project (Telegram bot + Next.js admin sharing Firestore). A teammate wants you to improve a specific file or area.

Target: $ARGUMENTS

## Step 1 — Read context (in this order)

1. `CLAUDE.md` at the repo root — agent roles, conventions, **Known limitations** section especially.
2. The target:
   - If `$ARGUMENTS` looks like a path → read that file.
   - If `$ARGUMENTS` is `bot` → glob `upsc-bot/src/**/*.js` and skim the entry points (`index.js`, `flows/conversation.js`, `handlers/message.js`).
   - If `$ARGUMENTS` is `admin` → glob `upsc-admin/app/**/*.js` and `upsc-admin/components/**/*.js`.
   - If `$ARGUMENTS` is `ai-prompts` → read `upsc-bot/src/ai/gemini.js` and `upsc-bot/src/ai/prompts.js`.
   - If `$ARGUMENTS` is `database` → read `upsc-bot/src/db/*.js` and `upsc-bot/config/firebase.js`.
   - If `$ARGUMENTS` is `all` → start with CLAUDE.md's Known limitations list as your menu.

Do NOT make changes yet. Read only.

## Step 2 — Output exactly this

---

### 🎯 Scope
[One sentence on what was reviewed. Mention the agent role from CLAUDE.md: Bot / Admin / AI-Prompts / Database.]

### 🔴 High impact — fix soon
[Bugs, security issues, broken behavior, items in CLAUDE.md "Known limitations" that overlap this scope. Each item:
- **What:** one-line description
- **Where:** `file:line` (or function name)
- **Why it matters:** real consequence (lost data, leaked secret, broken feature, etc.)
- **Fix sketch:** 1-3 lines on the approach]

### 🟡 Medium impact — worth doing
[Reliability, consistency, naming, missing edge cases, defensive code that's actually needed. Same format as above.]

### 🟢 Low impact — nice to have
[Style, comments, minor refactors, tiny perf. Same format. Cap at 5 items so this section doesn't drown the others.]

### ⛔ Out of scope (deliberately not suggesting)
[Things you noticed but won't recommend changing — e.g. "in-memory chat history" if `$ARGUMENTS` is just one file, the dark-theme hex literals, the Hinglish persona voice. One bullet each, very short.]

### ❓ Need to confirm before applying
[Questions for the user before any code change — e.g. "Should I fix the soft-delete inconsistency by filtering in the bot, or by removing the `active` flag entirely?". If there are no questions, write "None — ready to apply any subset."]

---

## Step 3 — Wait for the user

Do NOT edit any file yet. After the user picks which items to apply (e.g. "do all the 🔴", "skip #2 in 🟡, apply the rest", "just #1"), then:
- Make only the changes they approved.
- Follow CLAUDE.md conventions (named exports, `[area]` log prefix, `try/catch` with safe fallback, no TypeScript, dark theme palette for admin, etc.).
- Don't touch anything in **⛔ Out of scope** or anything not in their approval list.
- After editing, run `npm run test` in `upsc-bot/` if any bot file changed; otherwise summarize the diff in 2-3 lines.
