# Real-estate WhatsApp CRM: context for every Claude Code session

## Project
- A web CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared inbox.
- Users: 1 Super Admin, Managers, up to 10 Employees. Customer messages the number → shared inbox → manager assigns to an employee → employee replies in the CRM → customer sees a normal WhatsApp message.
- Every conversation is linked to a lead (7 stages, New to Converted or Lost). Also: properties, follow-ups, safe campaigns, reports, audit log.
- Prototype for MK Agency's developer assessment, built in 2–3 days (2026-11-25 to 11-27) with a test WhatsApp number and test contacts only. Anything simulated is labelled as simulated in the UI.
- Stack: React + TS, Node/Express + TS, Socket.io, PostgreSQL + Prisma, Redis + BullMQ, Baileys (pinned) in a separate worker behind a provider interface.
- Two ways to run it: the live stack (real WhatsApp through the worker) and a browser-only demo mode on dummy data (Spec 4, DEMO), which is the prototype reviewers click through.

## Current state (updated 2026-11-26, end of session 9)
- **Two modes.** *Live* (`pnpm dev`): the real stack, Specs 0 to 3 built (BOOT, FND, WA, MSG); its last open check is MSG-28 (real phone). *Demo* (`pnpm --filter @crm/web dev:demo`, port 5174): the whole CRM as a browser-only prototype on dummy data, Spec 4 (`DEMO`, `docs/specs/004-demo.md`, DEMO-01 to DEMO-34) built in 5 phases. The demo is what reviewers walk through; live mode is unchanged by it.
- **Why the demo:** in session 9 the user changed the flow: "complete this project with dummy data and dummy api responses with dummy logins and dummy qrs for prototype". They chose a mock mode in the web app, a light spec with smoke tests, react-router with plain CSS, and live activity by buttons plus auto mode (DEMO Decision 1); open points settled as recommended (Decision 13).
- **DEMO status:** all criteria with tests pass; the manual DEMO-02, 14, 21, 32 and 34 were checked in headless Chrome (spec "Manual check results"). **DEMO-33, the walk-through in a real browser, waits for the user** (README "Walk-through: the 7-step final demo"); a scripted two-tab run of it passed.
- **Demo logins:** `<first name>@skyline.test` / `demo1234`: Aarav (Super Admin); Neha, Rohan (Managers); Priya, Karan, Sneha, Vikram (Employees); Ananya (deactivated, refused). Live seed logins are different (Commands).
- **How the demo works** (detail: `docs/how-it-works.md` 11b, DEMO Decisions 1 to 35):
  - `apps/web/src/main.tsx` loads the demo for `vite --mode demo` or `VITE_DEMO=1` (`mode.ts`), else the live app.
  - `apps/web/src/demo/`: `seed.ts` (Skyline Realty data, fixed ids, times relative to now), `store.ts` (Zod-checked `localStorage` `crm-demo-v1`, raw-text cache, `sync()`), `api.ts` (one async function per future route; checks session in `sessionStorage`, role via `access.ts`, Employee scope, reply lock), `engine.ts` (state changes shared with the simulator), `sim.ts` (stored tasks: QR refresh, reconnect, ticks, agent replies, campaign steps, auto enquiries; every tab runs it, a task runs once), `bus.ts` (real socket event names plus drafts; `BroadcastChannel` to other tabs, `onRemote` syncs first), `views.ts`, pure rules in `rules.ts`, `chat-view.ts`, `campaigns.ts`, `reports.ts`, and one file per screen.
  - Draft contracts for the unbuilt modules: `packages/shared/src/crm.ts` (leads, properties, follow-ups, campaigns, users, audit, inbox extras, `FollowUpInput`, `CampaignInput`, `NewUserInput`). The real INB, LEAD, PROP, FUP, CAMP, USR, RPT and AUD specs start from these and from the demo api's function list.
  - Packages added for the demo: `react-router` 8.5.3 and `zod` 4.6.7 in `apps/web`.
  - `build:demo` writes `apps/web/dist` plus `404.html` and `_redirects` (`apps/web/scripts/static-fallback.mjs`) so deep links work on static hosts.
- **Tests:** `pnpm test` gives 261 passed and 13 `it.todo`, all manual: BOOT-09, BOOT-16, WA-23, WA-24, WA-27, MSG-24 (browser), MSG-28, DEMO-02, 14, 21, 32, 33, 34. typecheck, lint, format:check and traceability pass. Demo tests: `apps/web/src/demo/demo.test.ts` (in-browser api run in Node with a memory store and a test clock).
- **Browser checks** were run with headless Chrome scripts in `/tmp/crm-shots/` (outside the repo, not kept) against `preview:demo`. Kill Chrome with SIGKILL after each run: a leftover headless Chrome once kept old storage and faked a "duplicate message".
- **Next:** the user's DEMO-33 walk-through; record the result in the spec's "Manual check results". Then, only with the user's go-ahead: hosting the demo build (needs a GitHub remote, and squashing `node_modules/` out of the first commit before any push), MSG-28 on the live stack, the folder rename. After that, the real specs (INB first) if the project continues. Deadline 2026-11-27.
- **Working tree:** `.agents/`, `.aider-desk/`, `skills-lock.json` are local AI-tool files that appeared on 2026-11-26 (not ours, not committed); eslint and Prettier ignore them (DEMO Decision 18).
- Git: local commits only, no remote; one commit per phase (DEMO `06e5096`, `498f1b5`, `09022d3`, `9c98317`, `2dc3f83`). `node_modules/` is still in the first commit (`a207d9c`); squash before pushing. Session notes: `docs/history/`.

## Live stack state (built in sessions 1 to 8)
- **Built:** Spec 0 (`BOOT`), Spec 1 (`FND`, 20 criteria), Spec 2 (`WA`, `docs/specs/002-whatsapp.md`, 28 criteria) and Spec 3 (`MSG`, `docs/specs/003-messaging.md`, 28 criteria). History: `docs/history/2026-11-25-fnd-phase-*.md`, `…-wa-*.md`, `…-msg-*.md`, `2026-11-26-msg-*.md`.
  - FND: env validation (`parseEnv`), `GET /health`, migration `init` and seed, login with signed `crm_sid` cookie and Redis sessions, `PERMISSION_MAP`/`can()`, the `access(level)` route guard, authenticated sockets with server-assigned rooms (`roomsFor`), logout/deactivation disconnects. FND Decisions 1 to 42.
  - WA worker (`apps/worker/src/`): `connection.ts` (`startWaWorker`: lock, states, backoff, commands, audit), `lock.ts` (`wa:lock`, Lua owner checks), `session-store.ts` + `crypto.ts` (AES-256-GCM, AAD per row), `providers/fake/fake.ts`, `providers/baileys/index.ts` (pinned `baileys` 7.0.0-rc14; connection, inbound texts, receipts, `sendText`), `providers/index.ts` (`createProvider`). Migration `wa-session`.
  - WA api: `events.ts` (relay `crm:events:<db>` → `wa.state` to `global`, `wa.qr` to `admin`), `wa.ts` (`POST /wa/qr`, `POST /wa/logout`, `wa.manage`), `origin.ts` (socket `allowRequest` + non-GET origin guard; no CORS).
  - Live web (`apps/web`, no router): login, Super Admin connection page with QR, Messages tab for Super Admin and Managers, Employee home placeholder, banner with "Simulated" tag for the Fake. Vite proxy for `/auth`, `/wa`, `/conversations`, `/health`, `/socket.io` on port 5173.
  - MSG: `bullmq` 6.7.5; contracts in `packages/shared/src/messages.ts` (`MessageView`, `ConversationSummary`, `MessageStatusUpdate`, `SendMessageRequest`, `OutboundMessageJob`, `QUEUES`, `nextStatus`); worker `messages.ts` (inbound store, dedupe, status reports) and `send.ts` (BullMQ processor in the connection manager's in-order queue); api `messages.ts` (`GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`) and `queue.ts`; MSG events to `inbox:all` only; migration `msg-core`. `messages.sent_by_id` is `ON DELETE RESTRICT`: tests delete a user's messages before the user.
- **WA-27 passed** with the real test phone (WA Decision 42): QR scan, restart without QR, network drop and recovery, unlink and re-pair.
- **MSG-28 open:** the real-phone check (message in, reply out with ticks, "Sent from phone", a photo as "Unsupported message (image)", restart with a queued message). Steps in `docs/history/2026-11-26-msg-phone-check.md`. Run it with `WHATSAPP_PROVIDER=baileys pnpm dev` (the env var wins over `.env`); the test number stays linked and reconnects without a QR. Plain `pnpm dev` uses the Fake and does not touch the real session.
- Test isolation: package tests run one package at a time (they share `crm_test`); api tests use Redis db 1, worker tests db 2, dev db 0; pub/sub channels carry the db number (`waChannels(db)`, WA Decision 43). `pnpm test` is safe while the dev stack is connected. Tests must never use Redis db 0.
- Keep the Mac awake during live demos: on a sleep/wake the worker's 30 s lock expires and it reconnects (WA-04 as designed; with Baileys, a reconnect without a QR).
- `crm_dev` holds a `FAKE` and a live `BAILEYS` session row, `wa.*` audit rows from the checks, and the `msg-core` columns.

## Commands
Run from the repo root. Docker must be running for `pnpm test`.
- Install: `pnpm install` (also runs `prisma generate` for `@crm/db` via its `postinstall`; regenerate by hand with `pnpm --filter @crm/db generate`)
- Infra: `docker compose up -d --wait` (Postgres 16 on host port 5433, Redis 7 on 6379; dev user/password `crm`/`crm`; databases `crm_dev` and `crm_test`)
- Env: `cp .env.example .env`, then fill in `SESSION_SECRET` and `SESSION_ENCRYPTION_KEY` (`openssl rand -hex 32` each). The api and worker `dev` scripts load the root `.env` with `node --env-file-if-exists`. Tests never read `.env`.
- Demo mode (browser only, dummy data, no Docker): `pnpm --filter @crm/web dev:demo` (http://localhost:5174); `build:demo` / `preview:demo` for the static build.
- Dev (web + api + worker): `pnpm dev` (web on http://localhost:5173 through a Vite proxy, api on port 4000; `curl localhost:4000/health`). Real WhatsApp: `WHATSAPP_PROVIDER=baileys pnpm dev`, or set it in `.env`.
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
- Entry files: `apps/api/src/main.ts` and `apps/worker/src/main.ts` (env check, then start). The api is `app.ts` (`createApp(deps, { extraRouters })`, used by tests through supertest; `extraRouters` is test-only), `config.ts` (`AuthConfig`), `access.ts` (route guard, `authenticate`, `checkSession`), `session.ts` (cookie and Redis sessions), `sockets.ts` (Socket.io server, rooms, `SocketControl`), `auth.ts` (`/auth` router), `health.ts` and `redis.ts`. `apps/api/src/test-support.ts` and `test-global-setup.ts` are test-only. `@crm/db` exports `createDb` and `Db` from `src/client.ts`. The api also has `wa.ts`, `events.ts` and `origin.ts` (WA), and `messages.ts` (`/conversations` routes) and `queue.ts` (BullMQ `outbound-message`) (MSG). `@crm/db` also exports the row-to-view mappers (`src/views.ts`). The worker has `messages.ts` (inbound store, status reports) and `send.ts` (queue processor); the Baileys pure helpers are `providers/baileys/helpers.ts`. The live web app has `App.tsx`, `pages.tsx`, `messages-page.tsx`, `useMessages.ts`, `messages-view.ts`, `view.ts`, `api.ts`; `mode.ts` picks live or demo. The demo app is `src/demo/` (files listed under Current state; screens: `login.tsx`, `app.tsx` (router, shell, guard), `whatsapp-page.tsx`, `inbox-page.tsx`, `leads-page.tsx`, `properties-page.tsx`, `followups-page.tsx`, `campaigns-page.tsx`, `users-page.tsx`, `reports-page.tsx` (dashboard, reports, audit, Employee home), `controls.tsx`, `toasts.tsx`, `ui.tsx`, `demo.css`). `apps/web/scripts/static-fallback.mjs` runs after `build:demo`. WA tests: `apps/worker/src/{wa,crypto}.test.ts` (with `test-support.ts`), `apps/api/src/wa.test.ts`, `apps/web/src/view.test.ts`. MSG tests: `apps/worker/src/messages.test.ts`, `apps/worker/src/providers/baileys/baileys.test.ts`, `apps/api/src/messages.test.ts`, `packages/shared/src/messages.test.ts`, `apps/web/src/messages.test.ts`.
- `packages/db/prisma/` holds `schema.prisma` and `migrations/` (`20261125145958_init`, `20261125162103_wa-session`, `20261125180408_msg-core`); `packages/db/prisma.config.ts` reads `DATABASE_URL`. `packages/db/src/{migrate,seed}.ts` are the script entries. `src/test-support.ts` holds the crm_test helpers for the db tests (not exported). The db tests run files serially. The generated client goes to `packages/db/src/generated/prisma/` (gitignored, and ignored by ESLint and Prettier).
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
- Prettier ignores `docs/`, `.claude/` and the local AI-tool folders; everything else must pass `pnpm format:check`.
- Manual criteria keep their `it.todo`; when checked, the result goes into the spec's "Manual check results" table (DEMO does this).
- Demo code lives only in `apps/web/src/demo/` and never calls `fetch`, the live `api.ts` or `socket.io-client` (a DEMO-01 test checks the source). Its data shapes come from `@crm/shared`.

## Hard rules
- Role checks happen on the server (routes and socket rooms). Hiding something in React is not security.
- The reply lock is enforced at the send endpoint, not only in the UI.
- Only one WhatsApp session may be live at a time (a Redis lock is held when the worker starts).
- TypeScript strict mode, no `any`. Zod schemas in `packages/shared` are the single source of truth for every data shape.
- Never fake WhatsApp delivered/read ticks. Show only what the provider reported. Exception: demo mode (`--mode demo`, DEMO spec) is a labelled simulation for the prototype; its QR, messages and ticks are simulated and every screen says so. Live mode keeps every real rule.
- Test numbers and test contacts only. No unsolicited bulk sending.
- Only `apps/worker` imports Baileys, and only inside its adapter folder.
- No feature code without a spec criterion. One module at a time.
- Priorities: must really work = QR connection, live inbox, real replies (live mode). May be simplified and labelled = automations as "Run now (test)", CSV-only export, tables not charts. Demo mode simulates everything, labelled, and still enforces the role, scope and reply-lock rules in its demo api.

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
| `docs/how-it-works.md` | One-page reference of how the built app works (FND, WA, MSG, and demo mode in 11b) |
| `docs/plan/project-summary.md` | Module list, tech stack, the 7-step final demo |
| `docs/plan/development-plan.md` | Spec areas and prefixes, phases and build order, test strategy, definition of done |
| `docs/plan/Architure-plan.md` | Processes, dependency directions, provider interface, data model, security, reliability |
| `docs/plan/data-flow-plan.md` | Any flow, state machine, event or queue |
| `docs/data-flow/README.md` | Which route, event or queue delivers what (FND, WA and MSG paths built; the rest planned) and the demo mode's in-browser flow |
| `docs/specs/002-whatsapp.md` | WA criteria and Decisions |
| `docs/specs/003-messaging.md` | MSG criteria and Decisions 1 to 48 |
| `docs/specs/004-demo.md` | DEMO criteria (demo mode on dummy data), Decisions 1 to 35, manual check results |
| `docs/design-prompt.md` | The design brief (screens, states, dummy data, style) the demo follows |
| `docs/specs/000-bootstrap.md` | BOOT criteria and Decisions |
| `docs/specs/001-foundation.md` | FND criteria (env, health, schema, seed, auth, permissions, sockets) and Decisions |
| `docs/history/` | What happened in earlier sessions and what was authorised |
| `README.md` | How to run the project |

## Session protocol
- Do not write code until the user gives an explicit go-ahead. Summarise, flag risks, ask questions first; approval of one step covers only that step.
- Confirm before hard-to-reverse or outward-facing actions (git history rewrites, pushes, deleting data). Starting Docker or installing packages needs the step's go-ahead.
- At the end of a session, add a file to `docs/history/` and update "Current state" above.
- Specs are built in phases (FND, WA, MSG and DEMO had 5 each). At the end of each phase: run the gate (typecheck, lint, test, traceability, format:check), update this file and the docs (specs, data-flow, history, README), make one local commit, then stop and wait for the user's "next". No push.

## Open items
- Folder rename to `mk-whatsapp-crm` is agreed but not done (the folder and its parent `Projects ` end with a space). Memory is keyed by path: copy it after the move.
- Lead stage names (7), reply-lock timeout and Manager override, and whether closing a chat closes its lead are undecided. The demo uses labelled placeholders (New, Contacted, Qualified, Site visit, Negotiation, Converted, Lost; 60 s lock with Manager take-over; closing a chat leaves its lead; DEMO Decisions 7 and 8). Take the real values from the LEAD and INB specs; do not invent them.
- DEMO-33 (the user's walk-through in a real browser) is open. Hosting the demo build is not done: it needs a GitHub remote and the user's go-ahead; a sub-path host needs `vite build --mode demo --base /repo/` (DEMO Decision 33).
- Demo limits (by design): data is per browser (`localStorage`); uploads last for the tab's session; campaign sends are recorded on the campaign, not in the inbox (DEMO Decision 29); two tabs of one browser share data, two browsers do not.
- MSG is built; MSG-28 (real phone) is open. Specs after MSG (INB, LEAD, …) are unwritten. INB must add the reply-lock check, the Employee scope and the assignee rooms together (MSG Proposed changes), plus unread counts and conversation paging. LEAD adds lead auto-creation to the inbound handler.
- MSG known limitations (for DOC): an inbound message whose store fails (Postgres down) is lost (MSG Decision 29); a crash between WhatsApp's acceptance and saving `sent` can send a message twice (MSG open point 1, accepted); a job active when a worker is killed waits for BullMQ's 30 s stalled check (MSG Decision 43).
- Full `pnpm test` runs can time out under heavy machine load (FND-03, and once FND-04 at load average 11, MSG Decision 36). Re-run before suspecting the code.
- `baileys` is a release candidate (7.0.0-rc14); it passed WA-27. If it misbehaves later, the fallback is `legacy` 6.7.24 (WA Decision 6).
- The USR deactivate route must call `sockets.endUser` so sockets drop at once (FND Decision 40).
- FND-03's 2 s health timeout failed under parallel package tests; package tests now run one at a time (WA Decision 27). Watch it in CI.
- CI (`.github/workflows/ci.yml`) has not run; needs a GitHub repo.
- pnpm skips the install scripts of `prisma` and `@prisma/engines`; the Prisma CLI fetches its schema engine on first use. Check this on the first CI run.
- Suggested but not specced: CI check for the exact Baileys version pin, struck-through and duplicate IDs in traceability, `format:check` in CI.
