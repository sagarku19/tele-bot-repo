---
name: admin-env-mismatch
description: Broadcast endpoint reads BOT_TOKEN but the .env.local.example uses TELEGRAM_BOT_TOKEN — silent failure trap
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

`upsc-admin/.env.local.example` line 29 defines `TELEGRAM_BOT_TOKEN="your_telegram_bot_token"`.

`upsc-admin/app/api/broadcast/route.js:23` reads `process.env.BOT_TOKEN` (and returns a 500 `"Bot token not configured"` if missing).

**Why:** Looks like inherited naming inconsistency — the bot uses `BOT_TOKEN`, the admin example was written with the more descriptive name but the implementation copied the bot's convention.

**How to apply:**
- The user's actual `upsc-admin/.env.local` may or may not be aligned. Don't assume.
- If broadcast is failing with "Bot token not configured," check whether the var is named `BOT_TOKEN` (the code's expectation) or `TELEGRAM_BOT_TOKEN` (the example's name).
- If touching this code or example, either rename the example to `BOT_TOKEN` (lower-effort, matches code) or update the route to accept both — the user's preference probably hasn't been asked yet, so ask first.

Related: [[env-variables]], [[admin-architecture]], [[admin-known-issues]]
