# Real-estate WhatsApp CRM: context for every Claude Code session

## Project
- A web CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared inbox.
- Users: 1 Super Admin, Managers, up to 10 Employees. Customer messages the number → shared inbox → manager assigns to an employee → employee replies in the CRM → customer sees a normal WhatsApp message.
- Every conversation is linked to a lead (7 stages, New to Converted or Lost). Also: properties, follow-ups, safe campaigns, reports, audit log.
- Prototype for MK Agency's developer assessment, built in 2–3 days (2026-11-25 to 11-27) with a test WhatsApp number and test contacts only. Anything simulated is labelled as simulated in the UI.
- Stack: React + TS, Node/Express + TS, Socket.io, PostgreSQL + Prisma, Redis + BullMQ, Baileys (pinned) in a separate worker behind a provider interface.

## Current state (updated 2026-11-25 end of session 7, WA closed)
- **Done:** Spec 0 (`BOOT`), Spec 1 (`FND`, 20 criteria) and Spec 2 (`WA`, `docs/specs/002-whatsapp.md`, 27 criteria) are built. History: `docs/history/2026-11-25-fnd-phase-*.md`, `…-wa-spec-draft.md`, `…-wa-phase-*.md`.
  - FND: env validation (`parseEnv`), `GET /health`, migration `init` and seed, login with signed `crm_sid` cookie and Redis sessions, `PERMISSION_MAP`/`can()`, the `access(level)` route guard, authenticated sockets with server-assigned rooms (`roomsFor`), logout/deactivation disconnects. FND Decisions 1 to 42.
  - WA worker (`apps/worker/src/`): `connection.ts` (`startWaWorker`: lock, states, backoff, commands, audit), `lock.ts` (`wa:lock`, Lua owner checks), `session-store.ts` + `crypto.ts` (AES-256-GCM, AAD per row), `providers/fake/fake.ts`, `providers/baileys/index.ts` (pinned `baileys` 7.0.0-rc14, connection only), `providers/index.ts` (`createProvider`). Migration `wa-session` (provider column, nullable number, `whatsapp_session_keys`).
  - WA api: `events.ts` (relay `crm:events:<db>` → `wa.state` to `global`, `wa.qr` to `admin`), `wa.ts` (`POST /wa/qr`, `POST /wa/logout`, `wa.manage`), `origin.ts` (socket `allowRequest` + non-GET origin guard; no CORS), state and QR sent on socket connect.
  - WA web (`apps/web`): Vite + React 19, no router. Login page, Super Admin connection page with QR, home placeholder, banner with "Simulated" tag. Vite proxy for `/auth`, `/wa`, `/health`, `/socket.io` on port 5173.
  - Contracts: `packages/shared/src/wa.ts` (`WaState`, `WaQr`, `CrmEvent`, `WaCommand`, `WA_REDIS`, `EVENTS_CHANNEL`, `WhatsAppProvider`, `ProviderAuthStore`). `WorkerEnv` adds `WHATSAPP_PROVIDER` (default `fake`), `WA_LOCK_TTL_MS`, `WA_RECONNECT_BASE_MS`, `WA_RECONNECT_MAX_MS`.
- **WA-27 passed** with the real test phone (WA Decision 42): QR scan, restart without QR, network drop and recovery, unlink from the phone and re-pair. "Log out WhatsApp" now needs a confirmation click (WA-24, Decision 41). The Phase 1 checkpoint's restart part is proven; its message part needs MSG.
- **Tests:** `pnpm test` gives 173 passed and 5 `it.todo` (BOOT-09, BOOT-16, and the manual WA-23, WA-24, WA-27).
  - typecheck, lint, format:check and traceability pass.
  - Package tests run one package at a time (`--workspace-concurrency=1`): the packages share `crm_test`. Api tests use Redis db 1, worker tests Redis db 2, dev uses db 0. Pub/sub channels carry the db number (`waChannels(db)`, WA-28): Redis pub/sub is shared by all databases, and before this fix a test run logged out the live dev session (WA Decision 43).
  - Worker tests: in-process managers with short timings, plus spawned `main.ts` for the kill/SIGTERM lock tests (WA-03, WA-05).
- **Next session:** the MSG spec (receive, send through the queue, forward-only status, dedupe; extends the provider interface with `sendText`, `onMessage`, `onStatus` in both adapters). Draft it only after the user's go-ahead.
- **Dev stack is stopped.** The test number stays linked: `WHATSAPP_PROVIDER=baileys pnpm dev` reconnects without a QR (the `BAILEYS` session is in `crm_dev`). Plain `pnpm dev` uses the Fake provider and does not touch the real session.
- `crm_dev` holds a `FAKE` session row, a live `BAILEYS` session for the test number, and `wa.*` audit rows from the checks.
- `pnpm test` is safe to run while the dev stack is connected (proved live, WA Decision 43). Tests must never use Redis db 0: not for keys, not for publishing, not for listening.
- Git: local commits only, no remote. `node_modules/` is still in the first commit (`a207d9c`); squash before pushing.
- Session notes: `docs/history/`.

## Commands
Run from the repo root. Docker must be running for `pnpm test`.
- Install: `pnpm install` (also runs `prisma generate` for `@crm/db` via its `postinstall`; regenerate by hand with `pnpm --filter @crm/db generate`)
- Infra: `docker compose up -d --wait` (Postgres 16 on host port 5433, Redis 7 on 6379; dev user/password `crm`/`crm`; databases `crm_dev` and `crm_test`)
- Env: `cp .env.example .env`, then fill in `SESSION_SECRET` and `SESSION_ENCRYPTION_KEY` (`openssl rand -hex 32` each). The api and worker `dev` scripts load the root `.env` with `node --env-file-if-exists`. Tests never read `.env`.
- Dev (web + api + worker): `pnpm dev` (web on http://localhost:5173 through a Vite proxy, api on port 4000; `curl localhost:4000/health`). Real WhatsApp: set `WHATSAPP_PROVIDER=baileys` in `.env`.
- Test: `pnpm test` (root tests in `tests/` + every package's tests)
- Typecheck: `pnpm typecheck`. Lint: `pnpm lint` (ESLint + dependency-direction check)
- Migrate / seed: `pnpm migrate`, `pnpm seed` (both load the root `.env`, so they target `crm_dev`). Seeded logins are `superadmin@`, `manager@` and `employee@crm.test`, with password `SEED_PASSWORD` (default `crm-dev-password`).
- New migration (later specs): in `packages/db`, run `DATABASE_URL=<crm_dev url> pnpm exec prisma migrate dev --create-only --name <area>-<change>`, review the SQL, then `pnpm migrate` (FND Decision 24). Without a terminal, `migrate dev` refuses when it has a warning; then generate the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new `<timestamp>_<name>/migration.sql` (WA Decision 16).
- Traceability: `pnpm traceability`. Format: `pnpm format` / `pnpm format:check`

## Layout
- `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/db`: workspace packages named `@crm/web`, `@crm/api`, `@crm/worker`, `@crm/shared`, `@crm/db`.
- `scripts/`: `contracts.ts` (shared constants for BOOT), `traceability.ts`, `check-dependency-graph.ts`.
- `tests/bootstrap/`: tests for the BOOT criteria. `tests/foundation/`: repo-level FND tests (FND-19). `tests/whatsapp/`: WA-26 (Baileys pin and boundary).
- FND tests live next to the code they test: `apps/api/src/*.test.ts`, `apps/worker/src/boot.test.ts`, `packages/db/src/*.test.ts`, `packages/shared/src/{env,permissions}.test.ts`.
- Entry files: `apps/api/src/main.ts` and `apps/worker/src/main.ts` (env check, then start). The api is `app.ts` (`createApp(deps, { extraRouters })`, used by tests through supertest; `extraRouters` is test-only), `config.ts` (`AuthConfig`), `access.ts` (route guard, `authenticate`, `checkSession`), `session.ts` (cookie and Redis sessions), `sockets.ts` (Socket.io server, rooms, `SocketControl`), `auth.ts` (`/auth` router), `health.ts` and `redis.ts`. `apps/api/src/test-support.ts` and `test-global-setup.ts` are test-only. `@crm/db` exports `createDb` and `Db` from `src/client.ts`. The api also has `wa.ts`, `events.ts` and `origin.ts` (WA). WA tests: `apps/worker/src/{wa,crypto}.test.ts` (with `test-support.ts`), `apps/api/src/wa.test.ts`, `apps/web/src/view.test.ts`.
- `packages/db/prisma/` holds `schema.prisma` and `migrations/` (`20261125145958_init`, `20261125162103_wa-session`); `packages/db/prisma.config.ts` reads `DATABASE_URL`. `packages/db/src/{migrate,seed}.ts` are the script entries. `src/test-support.ts` holds the crm_test helpers for the db tests (not exported). The db tests run files serially. The generated client goes to `packages/db/src/generated/prisma/` (gitignored, and ignored by ESLint and Prettier).
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
- Specs after WA (MSG, INB, …) are unwritten.
- `baileys` is a release candidate (7.0.0-rc14); it passed WA-27. If it misbehaves later, the fallback is `legacy` 6.7.24 (WA Decision 6).
- The USR deactivate route must call `sockets.endUser` so sockets drop at once (FND Decision 40).
- FND-03's 2 s health timeout failed under parallel package tests; package tests now run one at a time (WA Decision 27). Watch it in CI.
- CI (`.github/workflows/ci.yml`) has not run; needs a GitHub repo.
- pnpm skips the install scripts of `prisma` and `@prisma/engines`; the Prisma CLI fetches its schema engine on first use. Check this on the first CI run.
- Suggested but not specced: CI check for the exact Baileys version pin, struck-through and duplicate IDs in traceability, `format:check` in CI.
