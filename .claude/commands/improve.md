---
description: Audit a file or area of the UPSC Bot project and propose concrete improvements ranked by impact
argument-hint: <file path | "bot" | "admin" | "ai-prompts" | "database" | "payments" | "all">
---

You are a senior code reviewer for the UPSC Bot project (Telegram bot + Next.js 16 admin sharing Firestore). A teammate wants you to improve a specific file or area.

Target: $ARGUMENTS

If `$ARGUMENTS` is empty, ask the user once which target they want (from the list above) — do not guess.

## Step 1 — Read context (in this order)

1. `CLAUDE.md` at the repo root. Pay special attention to **Known limitations** and **Future improvements** — these are your scoring rubric, not just background.
2. The target:
   - **Path** (looks like a file path) → read that file plus its direct imports.
   - **`bot`** → glob `upsc-bot/src/**/*.js`; read `index.js`, `flows/conversation.js`, `handlers/message.js`, `handlers/photo.js`.
   - **`admin`** → glob `upsc-admin/app/**/*.js` and `upsc-admin/components/**/*.js`; also skim `lib/auth.js` and `middleware.js`.
   - **`ai-prompts`** → read `upsc-bot/src/ai/prompts.js`, `upsc-bot/src/ai/constants.js`, `upsc-bot/src/ai/providers/index.js`, `upsc-bot/src/ai/providers/gemini.js`, `upsc-bot/src/ai/providers/xai.js`.
   - **`database`** → read `upsc-bot/src/db/*.js`, `upsc-bot/config/firebase.js`, `upsc-admin/lib/firebase.js`.
   - **`payments`** → read `upsc-bot/src/flows/payment.js`, `upsc-bot/src/flows/access.js`, `upsc-bot/src/db/payments.js`, `upsc-admin/app/api/payments/route.js`, `upsc-admin/components/PaymentCard.js`. This flow has several flagged issues — bot-token-in-URL, "verify doesn't grant access", gift-card heuristics.
   - **`all`** → use CLAUDE.md's **Known limitations** list as your menu; read one representative file per item before recommending.

Do NOT make changes yet. Read only. If you have to skim more than ~8 files, stop and tell the user the scope is too broad — ask them to narrow it.

## Step 2 — Output exactly this template

---

### 🎯 Scope
[One sentence on what was reviewed. Name the agent role from CLAUDE.md: **Bot / Admin / AI-Prompts / Database** (or a combination).]

### 🔴 High impact — fix soon  *(max 5 items, prioritize ruthlessly)*
Anything that loses data, leaks secrets, breaks a documented feature, or matches an item in CLAUDE.md **Known limitations** that overlaps your scope. Each item:

- **What:** one-line description.
- **Where:** `file:line` (or function name) — be specific.
- **Why it matters:** real consequence (lost data, leaked secret, broken stage transition, etc.). If this is a CLAUDE.md "Known limitation," cite it by phrase.
- **Evidence:** the code snippet, log, or reproduction path that proves the problem — not a guess.
- **Fix sketch:** 1–3 lines on the approach.
- **Effort:** S (≤30min) / M (≤2h) / L (>2h, plan first).
- **Verification:** how the user will know it worked — e.g. "rerun `npm run test`", "send /start, confirm stage flips", "check Firestore `payments.screenshotUrl` no longer contains BOT_TOKEN".

### 🟡 Medium impact — worth doing  *(max 6 items)*
Reliability, consistency, missing edge cases, defensive code that's actually needed, naming that causes real confusion. Same format as 🔴.

### 🟢 Low impact — nice to have  *(max 4 items)*
Style, comments, minor refactors, tiny perf. Each item only needs: **What / Where / Effort.** No padding — if you don't have 4 good items, list fewer.

### ⛔ Out of scope (deliberately not suggesting)
Things you noticed but won't recommend changing in this pass — one bullet each, very short. Examples: "in-memory chat history" when scope is one file, the dark-theme hex literals, the Hinglish persona voice. **If something already appears in CLAUDE.md "Future improvements," put it here unless it's actively breaking the target file** — and say "(in CLAUDE.md Future improvements)" so the user knows you saw it.

### ❓ Need to confirm before applying
Questions that change the fix, not pleasantries — e.g. "soft-delete inconsistency: filter in `getAllCourses()` or drop the `active` flag entirely?". If none: write "None — ready to apply any subset."

---

## Step 3 — Wait for the user

Do NOT edit any file yet. After the user picks (e.g. "do all 🔴", "skip 🟡 #2", "just #1"):

1. Apply only what they approved. Don't touch ⛔ Out of scope or anything outside their approval list.
2. Follow CLAUDE.md conventions: named exports (default for React/Next pages), `[area]` log prefixes, `try/catch` returning safe fallback, no TypeScript, no new dependencies, admin dark theme palette (`bg-[#0f172a]` / `bg-[#1e293b]` / `border-slate-700`), path alias `@/` in admin, `BOT_TOKEN` (not `TELEGRAM_BOT_TOKEN`).
3. **If you added/renamed/removed a conversation stage**, walk the 7-step checklist in CLAUDE.md → "Adding a new conversation stage" and confirm every file is updated. Don't ship a stage change that's missing the badge color, chart entry, or stats breakdown.
4. **Verify before claiming done:**
   - Any `upsc-bot/**` file changed → `cd upsc-bot && npm run test` and report pass/fail. Don't claim success on a failed test.
   - Any `upsc-admin/**` file changed → `cd upsc-admin && npm run lint` and report.
   - UI changes in admin → say "lint-only, didn't run dev server" rather than implying you verified the UI.
5. Summarize the diff in 2–3 lines per item touched (what changed, why, where).
