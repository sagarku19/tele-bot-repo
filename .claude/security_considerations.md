---
name: security-considerations
description: "Known security trade-offs in the project — bot token in URLs, plain-text admin password, no rate limiting"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

These are deliberate or unaddressed trade-offs, not bugs to silently fix. Flag if relevant, ask before changing.

## Bot token embedded in screenshot URLs
`flows/payment.js` constructs `https://api.telegram.org/file/bot<BOT_TOKEN>/<path>` and stores this **as-is** in `payments.screenshotUrl`. Anyone who can read the `payments` collection (e.g. via the admin panel's `/payments` page) sees the live bot token in the image URL. Also, these URLs are not permanent — Telegram file paths expire after ~1 hour, so older payments lose their screenshot view.

**Fixes (if user asks):** download the bytes once, upload to Firebase Storage / S3, store that URL instead. Or proxy through a server route that injects the token.

## Plain-text admin credentials
`upsc-admin/lib/auth.js`:
```js
credentials?.email === process.env.ADMIN_EMAIL &&
credentials?.password === process.env.ADMIN_PASSWORD
```
No hashing, no per-user accounts, no lockout/throttling. Single shared credential.

## No rate limiting on user-facing endpoints
The bot's catch-all message handler calls Gemini synchronously on every message. A flooded user (or malicious one) can rack up Gemini cost. There's no per-user throttle or quota check.

## Broadcast has no opt-out
`/broadcast` will message every matching user with no unsubscribe flow. Telegram itself eventually bans bots that spam.

## Admin manual verify does NOT trigger access grant
In `app/api/payments/route.js`, the `PATCH … status: "verified"` only updates Firestore. The bot is not pinged, no invite links are generated, the user is not promoted to `paid`. The code literally `console.log("TODO: trigger bot access grant for payment ${paymentId}")`. ([[admin-known-issues]])

## Single-use invite link reuse risk
`access.js` uses `member_limit: 1` which is correct, but the link is also sent to the user as plain text — a screenshot leak would let someone else burn it before the buyer joins. Low risk in practice.

**How to apply:** if the user asks for a security review or production-hardening, lead with the screenshot URL token leak — it's the highest-impact, easiest-to-fix issue. The admin auth and rate-limiting are also real but bigger lifts.

Related: [[bot-architecture]], [[admin-architecture]], [[admin-known-issues]]
