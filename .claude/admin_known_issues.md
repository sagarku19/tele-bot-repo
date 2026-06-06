---
name: admin-known-issues
description: Known incomplete/buggy spots in upsc-admin that the user may or may not be aware of
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

Compiled from code reading on 2026-06-05/06. Flag these if the user enters the relevant area.

## Manual "Verify & Grant Access" doesn't actually grant access
`app/api/payments/route.js` PATCH handler:
```js
if (status === "verified") {
  updateData.verifiedAt = new Date().toISOString();
  console.log(`TODO: trigger bot access grant for payment ${paymentId}`);
}
```
It only updates the payment doc. The user's `isPaid`, `paidCourseIds`, and `stage` are not changed; no invite links are sent. The button label promises something the backend doesn't deliver.

**Fix sketch:** either (a) fetch user + course, mark user paid in Firestore (no Telegram side-effects — user gets nothing automatic), or (b) ping the bot via an HTTP endpoint so the bot's `grantAccess` runs. (b) needs a new bot route.

## Naive revenue calculation
`app/api/stats/route.js`: `totalRevenue = paidUsers * (sum of all course prices / number of courses)`. This is wrong if courses have different prices and uneven uptake. Correct calc: iterate users, sum `course.price` for every id in their `paidCourseIds`.

## Admin-created courses have no `id` field
`POST /api/courses` writes `{ name, description, price, channelId, groupId, welcomeMessage, active: true, createdAt }` — no `id` key, and Firestore auto-assigns the doc ID. Bot's `getCourse(courseId)` works (uses doc ID), but reading `course.id` from the data object returns undefined for admin-created courses. Seeded courses (from `courses.config.js`) have an explicit `id` field matching the doc ID.

## Soft-delete inconsistency
`DELETE /api/courses?id=...` sets `active: false`. The admin courses page filters `c.active !== false`. The **bot does NOT filter on `active`** — `db/courses.js → getAllCourses()` returns everything. So "deleted" courses still appear to users in the `interested` stage prompt.

## No image proxying for old screenshots
`PaymentCard.js` renders `<img src={payment.screenshotUrl} />` directly. The URL contains the bot token and expires after Telegram's file TTL (~1 hour). Old payments show broken images.

## Tailwind v4 — no `tailwind.config.js`
Next.js 16 + Tailwind v4 uses CSS-based config in `app/globals.css` (`@theme` and friends). Don't try to add a `tailwind.config.js` — see [[nextjs-16-warning]].

## CLAUDE.md says routes use API endpoint paths that differ slightly
Per CLAUDE.md, `/api/auth/[...nextauth]/route.js` — confirmed present. Some other paths in CLAUDE.md match. No actual route divergence here, but the bot's source layout in CLAUDE.md is wrong ([[claude-md-vs-actual-structure]]).

**How to apply:** before suggesting changes to the admin "Verify" flow, the revenue card, or the courses list, mention these caveats to the user and propose explicitly. Don't silently "fix" them while doing unrelated work — they may be deliberate.

Related: [[admin-architecture]], [[security-considerations]], [[claude-md-vs-actual-structure]], [[admin-env-mismatch]]
