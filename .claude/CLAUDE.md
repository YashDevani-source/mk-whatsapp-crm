# Real-estate WhatsApp CRM: context for every Claude Code session

## Project
- A web CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared inbox.
- Users: 1 Super Admin, Managers, up to 10 Employees. Customer messages the number → shared inbox → manager assigns to an employee → employee replies in the CRM → customer sees a normal WhatsApp message.
- Every conversation is linked to a lead (7 stages, New to Converted or Lost). Also: properties, follow-ups, safe campaigns, reports, audit log.
- Prototype for MK Agency's developer assessment, built in 2–3 days (2026-11-25 to 11-27) with a test WhatsApp number and test contacts only. Anything simulated is labelled as simulated in the UI.
- Stack: React + TS, Node/Express + TS, Socket.io, PostgreSQL + Prisma, Redis + BullMQ, Baileys (pinned) in a separate worker behind a provider interface.

## Current state (updated 2026-11-25)
- **Done:** Spec 0 (`BOOT`, `docs/specs/000-bootstrap.md`, status approved) is implemented. `pnpm test` passes 75 tests (+2 `it.todo`: BOOT-09, BOOT-16, both manual). typecheck, lint, format:check and traceability pass.
- **Not built:** every product feature. The apps are placeholders that print a startup line. There are no routes, no Prisma models and no UI. `migrate` and `seed` are no-op placeholders.
- **Next:** write the FND spec (auth, roles, env validation, schema, seed). Use the template at `docs/specs/_template.md`.
- Git: repo initialised, two local commits, no remote. `node_modules/` is still in the first commit (`a207d9c`); squash before pushing.
- Session notes: `docs/history/`.

## Commands
Run from the repo root. Docker must be running for `pnpm test`.
- Install: `pnpm install`
- Infra: `docker compose up -d --wait` (Postgres 16 on host port 5433, Redis 7 on 6379; dev user/password `crm`/`crm`; databases `crm_dev` and `crm_test`)
- Dev (web + api + worker): `pnpm dev`
- Test: `pnpm test` (root tests in `tests/bootstrap/` + every package's tests)
- Typecheck: `pnpm typecheck`. Lint: `pnpm lint` (ESLint + dependency-direction check)
- Migrate / seed: `pnpm migrate`, `pnpm seed` (placeholders until FND)
- Traceability: `pnpm traceability`. Format: `pnpm format` / `pnpm format:check`

## Layout
- `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/db`: workspace packages named `@crm/web`, `@crm/api`, `@crm/worker`, `@crm/shared`, `@crm/db`.
- `scripts/`: `contracts.ts` (shared constants for BOOT), `traceability.ts`, `check-dependency-graph.ts`.
- `tests/bootstrap/`: tests for the BOOT criteria.
- `docs/`: `plan/` (source documents), `specs/`, `data-flow/`, `history/`.

## Conventions in force
- Test titles start with the criterion ID, no brackets: `BOOT-06 …`. Manual criteria use `it.todo('ID …')`. `pnpm traceability` ignores specs with `Status: draft` only.
- Enforced by `pnpm lint`: no explicit `any`; Baileys (`@whiskeysockets/baileys`, `baileys`, `@adiwajshing/baileys`) only imported inside `apps/worker/src/providers/baileys/`; `apps/web` never imports `@crm/db`.
- Allowed internal dependencies: web→shared; api→shared,db; worker→shared,db; db→shared.
- All tsconfigs extend `tsconfig.base.json` (strict). TypeScript is pinned to `~6.0.3` because typescript-eslint does not support 7 yet.
- Node 24 LTS is the target (`.nvmrc`). Local Node is 22.22, which works with an engine warning.
- Prettier ignores `docs/` and `.claude/`; everything else must pass `pnpm format:check`.

## Hard rules
- Role checks happen on the server (routes and socket rooms). Hiding something in React is not security.
- The reply lock is enforced at the send endpoint, not only in the UI.
- Only one WhatsApp session may be live at a time (a Redis lock is held when the worker starts).
- TypeScript strict mode, no `any`. Zod schemas in `packages/shared` are the single source of truth for every data shape.
- Never fake WhatsApp delivered/read ticks. Show only what the provider reported.
- Test numbers and test contacts only. No unsolicited bulk sending.
- Only `apps/worker` imports Baileys, and only inside its adapter folder.
- No feature code without a spec criterion. One module at a time.
- Priorities: must really work = QR connection, live inbox, real replies. May be simplified and labelled = automations as "Run now (test)", CSV-only export, tables not charts.

## Workflow (spec-driven)
1. Spec (criteria `AREA-NN`, never reused; dropped ones are struck through)
2. Contracts (Zod, Prisma, event and job types; types only)
3. Failing tests titled with the criterion ID
4. Code until they pass
5. Verify (the spec's manual check)

If a spec is wrong: update the spec, then the test, then the code. Write decisions into the spec's Decisions list.

## Context map (read only when the task needs it)
| File | Read when |
|---|---|
| `docs/plan/project-summary.md` | Module list, tech stack, the 7-step final demo |
| `docs/plan/development-plan.md` | Spec areas and prefixes, phases and build order, test strategy, definition of done |
| `docs/plan/Architure-plan.md` | Processes, dependency directions, provider interface, data model, security, reliability |
| `docs/plan/data-flow-plan.md` | Any flow, state machine, event or queue |
| `docs/data-flow/README.md` | Which route, event or queue delivers what (planned, no real paths yet) |
| `docs/specs/000-bootstrap.md` | BOOT criteria and Decisions |
| `docs/history/` | What happened in earlier sessions and what was authorised |
| `README.md` | How to run the project |

## Session protocol
- Do not write code until the user gives an explicit go-ahead. Summarise, flag risks, ask questions first; approval of one step covers only that step.
- Confirm before hard-to-reverse or outward-facing actions (git history rewrites, pushes, deleting data). Starting Docker or installing packages needs the step's go-ahead.
- At the end of a session, add a file to `docs/history/` and update "Current state" above.

## Open items
- Folder rename to `mk-whatsapp-crm` is agreed but not done (the folder and its parent `Projects ` end with a space). Memory is keyed by path: copy it after the move.
- Lead stage names (7), reply-lock timeout and Manager override, and whether closing a chat closes its lead are undecided. Take them from the LEAD and INB specs; do not invent them.
- `docs/specs/FND.md` does not exist yet; BOOT's "Overlap with FND" is unconfirmed until it does.
- Specs for every module after BOOT are unwritten.
- CI (`.github/workflows/ci.yml`) has not run; needs a GitHub repo.
- Suggested but not specced: CI check for the exact Baileys version pin, struck-through and duplicate IDs in traceability, `format:check` in CI, `.env.example`.
