---
description: Ingest UPSC Bot admin chat transcripts and propose per-group diffs to update persona examples, courses, payment templates, and FAQ
argument-hint: <paste a transcript here OR leave empty to scan upsc-bot/training/transcripts/ for new files>
---

You are running the `/train` pipeline for the UPSC Bot project. Spec reference: `docs/superpowers/specs/2026-06-08-train-command-design.md`.

Input: $ARGUMENTS

## Stage 1 — Ingest

If `$ARGUMENTS` is non-empty (a pasted transcript):
1. Generate a timestamp slug: `YYYY-MM-DD-HHmm-paste`.
2. Write the paste to `upsc-bot/training/transcripts/<slug>.txt` (redacted version — see Stage 2).
3. Append the new filename to `upsc-bot/training/transcripts/.processed`.

If `$ARGUMENTS` is empty:
1. Glob `upsc-bot/training/transcripts/*.txt`.
2. Read `upsc-bot/training/transcripts/.processed`.
3. Pick only files not yet listed in `.processed`.
4. If none, stop with: "Nothing new to train on. Drop a `.txt` file into transcripts/ or pass a paste as `/train <text>`."

## Stage 2 — Parse & redact

Parse the raw text into a turn list. The format is `> Name:` headers followed by message text on subsequent lines. Treat any speaker named "UPSC Helping Hand" (with any suffix) as `operator`; everyone else is `user`. Result shape:

```
[ { speaker: "user"|"operator", name: "Anchal", text: "..." } ]
```

Redact in place before writing to disk:
- Telegram invite links matching `t\.me/\+[A-Za-z0-9_-]+` or `t\.me/c/\d+/\d+` → `<INVITE_LINK>`
- Phone numbers (10 consecutive digits, optionally `+91` prefixed) → `<PHONE>`
- Email addresses (standard regex) → `<EMAIL>`
- Gift-card codes — heuristic: ALL-CAPS alphanum groups separated by dashes, length ≥ 8 (e.g. `QTNG-T8TY3C-AEFA`) → `<GIFT_CODE>`

Write the **redacted** text to the transcript file. Keep the unredacted version in memory for extraction.

## Stage 3 — Extract candidates (4 buckets)

### Style examples
- Pick 5–10 operator turns per detected stage with 1–2 preceding user turns as context.
- Tag each as `{ stage, user, reply, addedAt: "<today YYYY-MM-DD>", tags: [...] }`.
- Infer the stage from surrounding context: greetings → `new`, course/price discussion → `interested`, payment-flow → `payment_pending`, post-access → `paid`. Negotiation flavor goes into `interested` with tag `negotiation`.

### Course / price candidates
- Scan for faculty + subject + price triples: "Karandeep Sir batch cost 650", "Eco price 250", "Anthro price 400".
- Slug = kebab-case of faculty + subject, e.g. `karandeep-anthropology`, `mrunal-economy`.
- Build candidate: `{ slug, name, faculty, subject, kind: 'lecture', price, pricing: {list, oldMember?, floor?}, demoLink?, mentions: [transcript-quotes] }`.
- Combo offers (1499, 999) get `kind: 'combo'` with explicit `slug: 'combo-all-1499'` / `slug: 'combo-list2-999'`.

### Template candidates
- Detect repeated multi-line operator messages keyed by intent. Standard keys: `gift_card_notice`, `payment_mode_menu`, `payment_proof`, `payment_link_phonepe`, `payment_link_paytm`, `payment_link_gpay`, `combo_pitch_1499`, `combo_pitch_999`, `post_payment_access`, `lifetime_updates`.
- Replace specific payment URLs with `{{link}}` placeholders so the template stays valid when URLs rotate.

### FAQ candidates
- Pair short repeated user questions with operator replies. Examples to look for: `lifetime access`, `gpay chalega`, `demo class`, `updates kab tak`, `notes milenge`.
- Canonical FAQ key is the normalized question text (lowercase, stripped punctuation).

## Stage 4 — Diff against current state (and collision check)

Load:
- `upsc-bot/training/examples.json`, `templates.json`, `faq.json`
- `upsc-bot/config/courses.config.js`
- Firestore `courses` collection via `firebase-admin` using `upsc-bot/config/firebase.js`'s `getDb()`. (You'll need to load `dotenv/config` from `upsc-bot/.env` first — run a one-off Node script with `cd upsc-bot && node -e "..."` and parse the JSON output.)

For each course candidate:
1. If `courses.config.js` already has the slug → compare price/description/demoLink, list diffs.
2. If Firestore has a doc with a different ID but a name within Levenshtein distance ≤ 3 of this candidate's name (case-insensitive, normalized) → **COLLISION**. Surface: `"Firestore has doc <id> name='<existing>' price=<existing>. Transcript suggests slug='<new>' name='<new>' price=<new>. (o)verwrite Firestore doc / (k)eep Firestore as-is / (s)kip this candidate"`.

For templates / FAQ: hash-compare. If a key exists with a different body, surface a side-by-side diff.

For examples: skip near-duplicates (normalized lowercased-collapsed-whitespace string equality on the reply).

Warn on contradictions: e.g., two different prices for the same slug across runs.

## Stage 5 — Per-group review

Present 4 sections in order: **Courses → Templates → FAQ → Style examples**. For each, print proposed diffs and ask the user `apply all / pick / skip group?`. If `pick`, walk item-by-item with `(y)es / (n)o / (e)dit-then-yes`.

Be transparent about counts: `"3 new courses, 2 price-change collisions, 1 contradiction warning."`

## Stage 6 — Apply & commit

Once the user approves each group:
1. Append approved style examples to `upsc-bot/training/examples.json` (preserve existing entries; sort by `addedAt` desc when writing for clean diffs).
2. Upsert approved templates into `upsc-bot/training/templates.json` (sorted keys).
3. Upsert approved FAQ entries into `upsc-bot/training/faq.json` (sorted keys).
4. Rewrite `upsc-bot/config/courses.config.js` with the merged course list. Use a deterministic formatter: 2-space indent, double quotes for keys consistent with existing file, preserve field order `id, name, description, price, channelId, groupId, welcomeMessage, kind, faculty, subject, demoLink, pricing`.
5. Append the ingested transcript filename(s) to `upsc-bot/training/transcripts/.processed`.

Single commit per run:

```
git add upsc-bot/training/ upsc-bot/config/courses.config.js
git commit -m "train: ingest <N> transcripts (<M> courses, <K> examples, <T> templates, <F> faqs)"
```

Print final message:
```
Done. Run /reload_courses in Telegram OR restart the bot to push course changes to Firestore.
```

## Safety rules

- NEVER write the unredacted transcript to disk.
- NEVER auto-apply changes without per-group approval. Stage 5 is mandatory.
- NEVER overwrite a Firestore course doc without explicit `(o)verwrite` answer to a collision prompt.
- If any step fails (parse error, Firestore unreachable, no candidates), stop and report — don't partial-apply.
