# Real-estate WhatsApp CRM: context for every Claude Code session

## Project
- A web CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared inbox.
- Users: 1 Super Admin, Managers, up to 10 Employees. Customer messages the number → shared inbox → manager assigns to an employee → employee replies in the CRM → customer sees a normal WhatsApp message.
- Every conversation is linked to a lead (7 stages, New to Converted or Lost). Also: properties, follow-ups, safe campaigns, reports, audit log.
- Prototype for MK Agency's developer assessment, built in 2–3 days (2026-11-25 to 11-27) with a test WhatsApp number and test contacts only. Anything simulated is labelled as simulated in the UI.
- Stack: React + TS, Node/Express + TS, Socket.io, PostgreSQL + Prisma, Redis + BullMQ, Baileys (pinned) in a separate worker behind a provider interface.

## Current state (updated 2026-11-25, end of FND phase 4)
- **Done:** Spec 0 (`BOOT`) is implemented. Spec 1 (`FND`, `docs/specs/001-foundation.md`, 20 criteria) is **approved**. FND phases 1 to 4 of 5 are done:
  - Phase 1: contracts and test skeleton.
  - Phase 2: config and health (FND-01, 02, 03, 19). The api and worker validate env at boot (`parseEnv` in `packages/shared/src/env.ts`) and exit naming each bad variable. The api serves `GET /health` (Postgres `SELECT 1` and Redis `PING`, 2 s each). `.env.example` exists.
  - Phase 3: database (FND-04, 05, 06, BOOT-15 test). Migration `init` creates the six tables and unique indexes. `pnpm migrate` checks `MigrateEnv`, then runs `prisma migrate deploy`. `pnpm seed` upserts one argon2id user per role plus 2 test contacts, and refuses production. `crm_dev` is migrated and seeded.
  - Phase 4: auth and permissions over HTTP (FND-07 to 14, 18). `POST /auth/login` (public), `POST /auth/logout` and `GET /auth/me` (`auth.session`). Signed httpOnly `crm_sid` cookie (HMAC with `SESSION_SECRET`), Redis sessions `sess:<id>` + `user-sess:<userId>`, login rate limit `login-fail:<email>`. `PERMISSION_MAP` and `can()` in `packages/shared/src/auth.ts`. Every route's first handler is `access(level)` (`apps/api/src/access.ts`), which loads the user from Postgres on every request. FND Decisions 28 to 35.
- **Tests:** `pnpm test` gives 116 passed and 6 `it.todo`.
  - Passed: 76 root tests (75 BOOT + FND-19) and 40 package tests.
  - Todo: BOOT-09 and BOOT-16 (manual), plus 4 FND placeholders (socket tests).
  - typecheck, lint, format:check and traceability pass.
  - Api tests use `crm_test` and Redis db 1, create their own users (`apps/api/src/test-support.ts`), and a vitest `globalSetup` migrates `crm_test`.
- **Not built:** sockets, CORS and UI.
- **Build plan for FND (5 phases, stop after each, one local commit per phase):** 1 contracts and test skeleton (done) · 2 config and health (done) · 3 database: migrate, constraints, seed (done) · 4 auth and permissions over HTTP (done) · 5 sockets, manual check, close FND (FND-15, 16, 17, 20).
- **Next:** FND phase 5, after the user's go-ahead. The socket handshake should reuse `readCookie`, `verifyCookie`, `loadSession` and `destroySession` from `apps/api/src/session.ts`. `user-sess:<userId>` lists a user's sessions for FND-20. At the end of phase 5, run the full spec manual check and close FND.
- **Open FND placeholders:** 4 of 20 criteria are still `it.todo` (FND-15, 16, 17, 20). Traceability counts a todo as covered, so check this count, not just `pnpm traceability`.
- Git: local commits only, no remote. `node_modules/` is still in the first commit (`a207d9c`); squash before pushing.
- Session notes: `docs/history/`.

## Commands
Run from the repo root. Docker must be running for `pnpm test`.
- Install: `pnpm install` (also runs `prisma generate` for `@crm/db` via its `postinstall`; regenerate by hand with `pnpm --filter @crm/db generate`)
- Infra: `docker compose up -d --wait` (Postgres 16 on host port 5433, Redis 7 on 6379; dev user/password `crm`/`crm`; databases `crm_dev` and `crm_test`)
- Env: `cp .env.example .env`, then fill in `SESSION_SECRET` and `SESSION_ENCRYPTION_KEY` (`openssl rand -hex 32` each). The api and worker `dev` scripts load the root `.env` with `node --env-file-if-exists`. Tests never read `.env`.
- Dev (web + api + worker): `pnpm dev` (api on port 4000; `curl localhost:4000/health`; log in with `curl -c jar … /auth/login`, see README)
- Test: `pnpm test` (root tests in `tests/` + every package's tests)
- Typecheck: `pnpm typecheck`. Lint: `pnpm lint` (ESLint + dependency-direction check)
- Migrate / seed: `pnpm migrate`, `pnpm seed` (both load the root `.env`, so they target `crm_dev`). Seeded logins are `superadmin@`, `manager@` and `employee@crm.test`, with password `SEED_PASSWORD` (default `crm-dev-password`).
- New migration (later specs): in `packages/db`, run `DATABASE_URL=<crm_dev url> pnpm exec prisma migrate dev --create-only --name <area>-<change>`, review the SQL, then `pnpm migrate` (FND Decision 24).
- Traceability: `pnpm traceability`. Format: `pnpm format` / `pnpm format:check`

## Layout
- `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/db`: workspace packages named `@crm/web`, `@crm/api`, `@crm/worker`, `@crm/shared`, `@crm/db`.
- `scripts/`: `contracts.ts` (shared constants for BOOT), `traceability.ts`, `check-dependency-graph.ts`.
- `tests/bootstrap/`: tests for the BOOT criteria. `tests/foundation/`: repo-level FND tests (FND-19).
- FND tests live next to the code they test: `apps/api/src/*.test.ts`, `apps/worker/src/boot.test.ts`, `packages/db/src/*.test.ts`, `packages/shared/src/{env,permissions}.test.ts`.
- Entry files: `apps/api/src/main.ts` and `apps/worker/src/main.ts` (env check, then start). The api is `app.ts` (`createApp(deps, { extraRouters })`, used by tests through supertest; `extraRouters` is test-only), `config.ts` (`AuthConfig`), `access.ts` (route guard), `session.ts` (cookie and Redis sessions), `auth.ts` (`/auth` router), `health.ts` and `redis.ts`. `apps/api/src/test-support.ts` and `test-global-setup.ts` are test-only. `@crm/db` exports `createDb` and `Db` from `src/client.ts`. `apps/web/src/dev.ts` is still the BOOT placeholder.
- `packages/db/prisma/` holds `schema.prisma` and `migrations/` (`20261125145958_init`); `packages/db/prisma.config.ts` reads `DATABASE_URL`. `packages/db/src/{migrate,seed}.ts` are the script entries. `src/test-support.ts` holds the crm_test helpers for the db tests (not exported). The db tests run files serially. The generated client goes to `packages/db/src/generated/prisma/` (gitignored, and ignored by ESLint and Prettier).
- `docs/`: `plan/` (source documents), `specs/`, `data-flow/`, `history/`.

## Conventions in force
- Test titles start with the criterion ID, no brackets: `BOOT-06 …`. Manual criteria use `it.todo('ID …')`. `pnpm traceability` ignores specs with `Status: draft` only.
- Unbuilt criteria of an approved spec are also held by `it.todo('ID …')` placeholders, so traceability stays green between build phases. A placeholder is not "done": each phase turns its todos into real failing tests, then code.
- Contracts: Zod schemas and their inferred types share one name (`export const ApiEnv = z.object(…)` and `export type ApiEnv = z.infer<typeof ApiEnv>`). Shared `Role` and the Prisma `Role` enum are kept in sync by hand.
- Prisma 7 with the `prisma-client` generator (ESM, `.ts` imports) and the `@prisma/adapter-pg` driver adapter. Tables and columns are snake_case via `@@map`/`@map`; ids are UUIDs.
- Runtime packages are pinned to exact versions (`pnpm add -E`). Prisma is on stable 7.10.1, because npm's `latest` tag points at an 8.0 release candidate.
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
| `docs/specs/001-foundation.md` | FND criteria (env, health, schema, seed, auth, permissions, sockets) and Decisions |
| `docs/history/` | What happened in earlier sessions and what was authorised |
| `README.md` | How to run the project |

## Session protocol
- Do not write code until the user gives an explicit go-ahead. Summarise, flag risks, ask questions first; approval of one step covers only that step.
- Confirm before hard-to-reverse or outward-facing actions (git history rewrites, pushes, deleting data). Starting Docker or installing packages needs the step's go-ahead.
- At the end of a session, add a file to `docs/history/` and update "Current state" above.
- FND is built in 5 phases. At the end of each phase: run the gate (typecheck, lint, test, traceability, format:check), update this file and the docs (specs, data-flow, history, README), make one local commit, then stop and wait for the user's "next". No push.

## Open items
- Folder rename to `mk-whatsapp-crm` is agreed but not done (the folder and its parent `Projects ` end with a space). Memory is keyed by path: copy it after the move.
- Lead stage names (7), reply-lock timeout and Manager override, and whether closing a chat closes its lead are undecided. Take them from the LEAD and INB specs; do not invent them.
- Specs for every module after FND (WA, MSG, INB, …) are unwritten. The minimal login page is a WA criterion (FND Decision 4).
- CORS for HTTP (`ALLOWED_ORIGINS`) is not applied yet (FND Decision 35). Decide it in WA with the login page (a Vite proxy may make it unnecessary).
- CI (`.github/workflows/ci.yml`) has not run; needs a GitHub repo.
- pnpm skips the install scripts of `prisma` and `@prisma/engines`; the Prisma CLI fetches its schema engine on first use. Check this on the first CI run.
- Suggested but not specced: CI check for the exact Baileys version pin, struck-through and duplicate IDs in traceability, `format:check` in CI.
