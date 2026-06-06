---
name: bot-funnel-stages
description: "The 5 user funnel stages — what triggers each transition, what prompt drives the AI's persona, what side effects happen"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0793c746-dc1c-4c62-afc1-3d274e6c2895
---

## Persona: "Priya"
Warm Hinglish-speaking UPSC mentor. Every stage prompt enforces: 3–5 line replies, Hinglish style (`yaar`, `dekh`, `bata na`, `chal`, `bilkul`), ALWAYS ends with ONE follow-up question, never sounds robotic, never says "I am an AI". Defined in `upsc-bot/src/ai/prompts.js → STAGE_PROMPTS`.

## Stages

### `new`
- **Entered:** `/start` always resets to `new` (even for returning users).
- **AI goal:** Greet, give name "Priya", ask for student's name + attempt year.
- **Transition out:** Any non-`/` text of length ≥ 2 → `engaged` (the message is assumed to be the user's name and overwrites `users.name` if not already set).

### `engaged`
- **AI goal:** Probe preparation level, surface pain points, gently steer toward courses.
- **Transition out:** Message contains any of these keywords (case-insensitive substring):
  `course`, `courses`, `price`, `pricing`, `fees`, `fee`, `enroll`, `enrol`, `join`, `admission`, `subscribe`, `kitna`, `paisa`, `cost`, `plan`, `plans`, `batao`, `details`, `kya milega`, `syllabus`, `haan`, `yes`, `sure`, `interested`, `bataiye`, `dikha`, `dikhao`, `course batao`, `kya hai` → `interested`.

### `interested`
- **AI goal:** Present catalog (injected into prompt as `{{COURSE_CATALOG}}` — numbered list with id/desc/price), recommend, confirm.
- **Special protocol:** When the user picks a course, Gemini is instructed to embed a literal tag `[SELECTED_COURSE:<course-id>]` in its reply. The conversation flow strips this tag before sending to the user, captures the `course-id`, and transitions to `payment_pending`.
- **Side effect on transition:** `users.selectedCourseId` is written, then `handlers/message.js` sends a follow-up payment-instructions reply with course name + amount.

### `payment_pending`
- **AI goal:** Patient, short replies. Remind user to send the screenshot. No `[SELECTED_COURSE:]` tags.
- **Transition out:** Text **never** moves a user out of this stage. Only a successful payment verification in `flows/payment.js → grantAccess` flips them to `paid`. Photo messages are routed to `flows/payment.js`; any other photo (in any other stage) gets a polite "not needed right now" reply.

### `paid`
- **AI goal:** Full UPSC tutor mode — answer detailed questions, generate MCQs, reference standard books (Laxmikanth, Spectrum, Shankar IAS, NCERTs), evaluate answer-writing with structured feedback.
- **No automatic transition out.**

## Why this matters
The keyword-based transition from `engaged → interested` is brittle but cheap. It will mis-trigger (e.g. user says "haan" in any context) and miss (e.g. user asks "tell me more" in pure English). If you're adding a new stage or refining triggers, the touch points are:
1. `src/flows/conversation.js` — add the stage branch + transition logic.
2. `src/ai/prompts.js → STAGE_PROMPTS` — add the persona prompt.
3. `upsc-admin/components/UserTable.js → badgeColors` — add the badge color.
4. `upsc-admin/app/(dashboard)/page.js` — chart's hardcoded stage list.
5. `upsc-admin/app/(dashboard)/users/page.js` and `broadcast/page.js` — `<option>` lists.
6. `upsc-admin/app/api/stats/route.js` — `stageBreakdown` initial object.
7. CLAUDE.md docs.

**How to apply:** when the user mentions a stage by name (e.g. "the interested stage"), the prompts in `prompts.js` and the transition logic in `flows/conversation.js` are the two files to look at first.

Related: [[bot-architecture]], [[admin-architecture]], [[firebase-schema]]
