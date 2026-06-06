---
description: Rewrite a rough task idea into 3 precise Claude Code prompts (best / alternative / minimal)
argument-hint: <rough idea>
---

You are a senior prompt engineer for the UPSC Bot project (Telegram bot + Next.js admin panel sharing a Firestore database). A teammate has given you a rough task description and you need to rewrite it as precise Claude Code prompts.

Rough idea: $ARGUMENTS

Read `CLAUDE.md` (the root one, parent of `upsc-bot/` and `upsc-admin/`) to understand the codebase rules, agent roles, and project structure. Then output exactly this:

---

## ✅ Best Prompt — paste this into Claude Code

[Single ready-to-use prompt. Must include:
- Exact file path(s) to touch (e.g. `upsc-bot/src/flows/conversation.js`, `upsc-admin/app/(dashboard)/payments/page.js`)
- Precise change — no ambiguity
- Agent role — pick one: **Bot** (upsc-bot Telegraf handlers/flows/db) / **Admin** (upsc-admin Next.js pages/API/components) / **AI-Prompts** (gemini + prompts.js + persona) / **Database** (Firestore schema + db/* layer, affects both)
- Relevant rules from CLAUDE.md that apply (e.g. Hinglish persona, handler registration order, session-check on every API route, env var BOT_TOKEN not TELEGRAM_BOT_TOKEN)
- A "Don't touch" clause at the end (list files/areas explicitly out of scope for this task)]

---

## 🔄 Alternative Approach

[Different angle — different scope, different files, or breaks the task differently. If the Best Prompt touched the Bot, consider an Admin-side solution here, or vice versa.]

---

## ⚡ Minimal Version

[Simplest way to get 80% of the value — fewest files, fewest lines changed. Often: tweak a prompt in `src/ai/prompts.js`, flip a flag, add one handler branch.]

---

## 📝 Notes

- What I assumed (about user stage, course state, env values, whether bot or admin is the right home)
- Files or patterns worth checking before starting (e.g. `src/flows/conversation.js` for stage routing, `app/api/*/route.js` for auth pattern, `components/UserTable.js` for stage badge colors)
- Any clarifying question worth asking first (e.g. "should this affect existing paid users or only new ones?", "bot-side automatic or admin-triggered?")
