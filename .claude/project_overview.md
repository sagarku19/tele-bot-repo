---
name: project-overview
description: "High-level overview of the Telegram/ UPSC monorepo — purpose, two sub-projects, shared Firestore, business model"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

A monorepo at `C:\Users\sagar\OneDrive\Desktop\Websites\Telegram\` containing two cooperating Node projects that together form an automated AI-driven UPSC (Indian civil services exam) course sales funnel on Telegram.

## Sub-projects
- **`upsc-bot/`** — Node.js + Telegraf Telegram bot. Customer-facing. Drives a multi-stage sales funnel using Gemini AI, accepts payment screenshots, and grants channel/group access on verification.
- **`upsc-admin/`** — Next.js 16 (App Router) admin dashboard on port 3001. Operator-facing. Reads/writes the same Firestore, lets the admin verify payments manually, manage courses, broadcast messages, and watch funnel metrics.

## Shared state
Both projects use the **same Firebase Firestore** via `firebase-admin`. Three collections: `users`, `courses`, `payments`. See [[firebase-schema]].

## Business model
- Users land on the bot → AI mentor "Priya" (Hinglish persona) walks them through a funnel: `new → engaged → interested → payment_pending → paid`. See [[bot-funnel-stages]].
- No real payment gateway. Users pay via UPI / Amazon gift card and send a screenshot. Gemini Vision auto-checks it, then a human admin gives the final approval in the admin panel.
- On verification, the bot creates single-use Telegram invite links to the course's private channel & group.

**Why this design:** Payment gateways are heavy for a Telegram bot; screenshot + AI pre-filter + manual approval is the lowest-friction path to revenue while keeping fraud manageable.

**How to apply:** When proposing changes, assume this two-tier (AI auto-check → human verify) flow is intentional. Don't suggest replacing it with a generic gateway unless the user asks. Treat `upsc-bot` and `upsc-admin` as separate but synchronized — schema or stage changes in one must reflect in the other.

Related: [[project-current-focus]], [[firebase-schema]], [[bot-funnel-stages]], [[claude-md-vs-actual-structure]]
