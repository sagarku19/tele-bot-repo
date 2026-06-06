---
name: admin-commands
description: Admin-only Telegram commands inside the bot — gated by ADMIN_TELEGRAM_ID
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

Defined in `upsc-bot/src/handlers/admin.js`. Every command checks `isAdmin(ctx.from.id)` (compares string-coerced ID against `process.env.ADMIN_TELEGRAM_ID`) and replies `🚫 Admin-only command.` if it fails.

| Command | Behavior |
|---|---|
| `/stats` | Total users, paid users, today's new users (UTC `YYYY-MM-DD` prefix match), uptime, stage breakdown. Markdown. |
| `/broadcast <message>` | Loops `getAllUsers()`, sends via `ctx.telegram.sendMessage`, no rate limit between sends (the admin-panel `/api/broadcast` does add 50ms; the bot's in-chat version does not). Replies with `<sent>/<failed>` summary. |
| `/addcourse` | Static instruction telling admin to edit `config/courses.config.js` and restart. Does **not** actually add a course interactively. |
| `/listpaid` | Lists users where `isPaid === true` with their `paidCourseIds`. |
| `/verify_<paymentId>` | Regex match `/^\/verify_(.+)$/`. Sets that payment's status to `verified`. **TODO in code**: does NOT yet grant access — admin must currently do it manually. ([[admin-known-issues]]) |

The `/verify_<id>` command is included in admin notifications sent by `flows/payment.js` whenever Gemini rejects a screenshot, so the admin can override with one tap.

**How to apply:** if the user wants to extend admin tooling inside Telegram (e.g. revoke access, refund, reassign course), this is the file to edit. Don't forget to also gate any new admin commands with `isAdmin()`.

Related: [[bot-architecture]], [[env-variables]]
