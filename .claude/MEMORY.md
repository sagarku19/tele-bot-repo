# Memory Index

## Project context
- [Project overview](project_overview.md) — what the monorepo is, the two sub-projects, business model
- [Current focus](project_current_focus.md) — user is on `upsc-bot` first; `upsc-admin` later
- [Bot architecture](bot_architecture.md) — upsc-bot file layout, boot order, conversation engine, payment + access flows
- [Admin architecture](admin_architecture.md) — upsc-admin Next.js 16 layout, routes, auth, API endpoints
- [Firebase schema](firebase_schema.md) — users / courses / payments collections, type quirks
- [Bot funnel stages](bot_funnel_stages.md) — new → engaged → interested → payment_pending → paid, triggers, side effects
- [Admin commands](admin_commands.md) — /stats, /broadcast, /addcourse, /listpaid, /verify_<id>
- [Run and test](run_and_test.md) — how to start each side, expected output, smoke tests
- [Env variables](env_variables.md) — full var list across both `.env` files

## Gotchas and known issues
- [CLAUDE.md vs actual structure](claude_md_vs_actual_structure.md) — root README documents an old src/ layout that no longer exists
- [Admin known issues](admin_known_issues.md) — "Verify & Grant" doesn't grant, naive revenue calc, soft-delete inconsistencies
- [Admin env var mismatch](admin_env_mismatch.md) — broadcast reads `BOT_TOKEN` but example uses `TELEGRAM_BOT_TOKEN`
- [Security considerations](security_considerations.md) — bot token in screenshot URLs, plain-text admin password, no rate limiting

## Conventions and rules
- [Coding conventions](coding_conventions.md) — ESM, named exports, [tag] logging, dark theme palette, no TS/test framework
- [Next.js 16 warning](nextjs_16_warning.md) — admin's AGENTS.md says verify against `node_modules/next/dist/docs/` before writing
