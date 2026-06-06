---
name: claude-md-vs-actual-structure
description: The root CLAUDE.md describes an older folder layout for upsc-bot — the real source tree is different
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

`Telegram/CLAUDE.md` documents this layout for the bot:
```
src/bot/bot.js
src/bot/stageManager.js
src/bot/handlers/messageHandler.js
src/bot/handlers/paymentHandler.js
src/flows/onboarding.js
src/flows/sales.js
```

**None of those files exist.** Actual layout (verified 2026-06-05/06):
```
src/index.js                  (boot + handler registration)
src/handlers/admin.js         (admin commands)
src/handlers/start.js         (/start)
src/handlers/photo.js         (delegates to flows/payment.js)
src/handlers/message.js       (delegates to flows/conversation.js)
src/flows/conversation.js     (the real "stageManager" — processMessage())
src/flows/payment.js
src/flows/access.js
src/ai/{gemini,prompts}.js
src/db/{users,courses,payments}.js
src/utils/{helpers,logger}.js
```

The functional role described in CLAUDE.md is right (stage routing, payment handling) — only filenames and locations are stale. The README's behavioral notes (funnel stages, payment flow, Hinglish persona) are accurate.

The bot's `package.json` has `"type": "module"`, and the bot uses ESM imports (`import … from '../config/firebase.js'`). CLAUDE.md doesn't mention ESM.

**Why:** Most likely CLAUDE.md was written from an early design doc and never updated after refactor. Don't rely on its file-path references when navigating.

**How to apply:**
- When the user asks "where is X" and X is described in CLAUDE.md, verify with Glob/Read against the actual `src/` tree before answering. CLAUDE.md is authoritative for *intent*, not for *file paths*.
- If you propose or write code that imports `src/bot/...`, you're chasing a ghost. Use the real layout.
- It might be worth proposing a CLAUDE.md update at some point — but don't do it unprompted.

Related: [[bot-architecture]], [[project-overview]]
