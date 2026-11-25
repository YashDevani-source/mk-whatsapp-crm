# Real-estate WhatsApp CRM: context for every Claude Code session

## Project
- A web CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared inbox.
- Users: 1 Super Admin, Managers, up to 10 Employees. Customer messages the number → shared inbox → manager assigns to an employee → employee replies in the CRM → customer sees a normal WhatsApp message.
- Every conversation is linked to a lead (7 stages, New to Converted or Lost). Also: properties, follow-ups, safe campaigns, reports, audit log.
- Prototype for MK Agency's developer assessment, built in 2–3 days (2026-11-25 to 11-27) with a test WhatsApp number and test contacts only. Anything simulated is labelled as simulated in the UI.
- Stack: React + TS, Node/Express + TS, Socket.io, PostgreSQL + Prisma, Redis + BullMQ, Baileys (pinned) in a separate worker behind a provider interface.

## Current state (updated 2026-11-26 session 9, flow changed to a demo prototype; DEMO phases 1 to 3 of 5 built)
- **Flow change (session 9):** the user asked to "complete this project with dummy data and dummy api responses with dummy logins and dummy qrs for prototype". Spec 4 (`DEMO`, `docs/specs/004-demo.md`, DEMO-01 to DEMO-34) is approved: a browser-only demo mode in `apps/web` (`pnpm --filter @crm/web dev:demo`, port 5174, no Docker), dummy "Skyline Realty" data in `localStorage`, an in-browser demo api that enforces roles, the Employee scope and the reply lock, react-router, plain CSS. Live mode (`pnpm dev`) is unchanged. History: `docs/history/2026-11-26-demo-phase-1.md`.
  - Phase 1 done: draft contracts `packages/shared/src/crm.ts`; `apps/web/src/mode.ts`; `apps/web/src/demo/` (`seed.ts`, `store.ts`, `bus.ts`, `api.ts`, `access.ts`, `context.tsx`, `app.tsx`, `login.tsx`, `ui.tsx`, `format.ts`, `demo.css`, `main.tsx`); tests `apps/web/src/demo/demo.test.ts`. Packages `react-router` 8.5.3, `zod` 4.6.7 in `apps/web`.
  - Phase 2 done: `engine.ts` (shared state changes), `sim.ts` (scheduled tasks in the store, run by every tab; auto enquiry every ~45 s from a visible tab), `views.ts`, `chat-view.ts`, `whatsapp-page.tsx` (simulated QR, scan, logout confirm), `inbox-page.tsx` (list, chat, composer, lead panel), `controls.tsx` (Demo controls drawer), `toasts.tsx`. Store: `sim` tasks, raw-text cache, `sync()` on every api call and every 1 s (DEMO Decisions 19 to 23). History `2026-11-26-demo-phase-2.md`.
  - Phase 3 done: `leads-page.tsx` (table, board, detail with stage/owner/needs, history, other leads), `properties-page.tsx` (cards with filters, detail with gallery, units, brochures, upload; `ShareModal`, also in the inbox composer), `followups-page.tsx` (tabs, create/edit modal, complete, Run now (test) once), `rules.ts` (upload limits, follow-up tabs, needs summary, property card, placeholder images); engine lead stage/needs/owner; `FollowUpInput` in `crm.ts` (DEMO Decisions 24 to 28). History `2026-11-26-demo-phase-3.md`.
  - Browser checks run with headless Chrome scripts in `/tmp/crm-shots/` (outside the repo) against `preview:demo` on port 5174.
  - Demo logins: `<first name>@skyline.test` / `demo1234` (Aarav Super Admin; Neha, Rohan Managers; Priya, Karan, Sneha, Vikram Employees; Ananya deactivated).
  - Next: phase 4 (campaigns, users, reports, audit, Employee home), 5 (polish, static build, manual walk-through). Deadline 2026-11-27.
  - `.agents/`, `.aider-desk/`, `skills-lock.json` are local AI-tool files (appeared 2026-11-26 03:01, not ours, not committed); ignored by eslint and Prettier (DEMO Decision 18).

## State before the flow change (session 8, MSG built; MSG-28 phone check open)
- **Done:** Spec 0 (`BOOT`), Spec 1 (`FND`, 20 criteria), Spec 2 (`WA`, `docs/specs/002-whatsapp.md`, 28 criteria) and Spec 3 (`MSG`, `docs/specs/003-messaging.md`, 28 criteria; all built, only the manual MSG-28 phone check is open) are built. History: `docs/history/2026-11-25-fnd-phase-*.md`, `…-wa-*.md`, `…-msg-*.md`, `2026-11-26-msg-*.md`.
  - FND: env validation (`parseEnv`), `GET /health`, migration `init` and seed, login with signed `crm_sid` cookie and Redis sessions, `PERMISSION_MAP`/`can()`, the `access(level)` route guard, authenticated sockets with server-assigned rooms (`roomsFor`), logout/deactivation disconnects. FND Decisions 1 to 42.
  - WA worker (`apps/worker/src/`): `connection.ts` (`startWaWorker`: lock, states, backoff, commands, audit), `lock.ts` (`wa:lock`, Lua owner checks), `session-store.ts` + `crypto.ts` (AES-256-GCM, AAD per row), `providers/fake/fake.ts`, `providers/baileys/index.ts` (pinned `baileys` 7.0.0-rc14; connection, and from MSG inbound texts, receipts and `sendText`), `providers/index.ts` (`createProvider`). Migration `wa-session` (provider column, nullable number, `whatsapp_session_keys`).
  - WA api: `events.ts` (relay `crm:events:<db>` → `wa.state` to `global`, `wa.qr` to `admin`), `wa.ts` (`POST /wa/qr`, `POST /wa/logout`, `wa.manage`), `origin.ts` (socket `allowRequest` + non-GET origin guard; no CORS), state and QR sent on socket connect.
  - WA web (`apps/web`): Vite + React 19, no router. Login page, Super Admin connection page with QR, home placeholder, banner with "Simulated" tag. Vite proxy for `/auth`, `/wa`, `/conversations`, `/health`, `/socket.io` on port 5173. MSG adds tabs (`tabsFor`): Super Admin Connection + Messages, Manager Messages, Employee home.
  - Contracts: `packages/shared/src/wa.ts` (`WaState`, `WaQr`, `CrmEvent`, `WaCommand`, `WA_REDIS`, `EVENTS_CHANNEL`, `WhatsAppProvider`, `ProviderAuthStore`). `WorkerEnv` adds `WHATSAPP_PROVIDER` (default `fake`), `WA_LOCK_TTL_MS`, `WA_RECONNECT_BASE_MS`, `WA_RECONNECT_MAX_MS`.
- **WA-27 passed** with the real test phone (WA Decision 42): QR scan, restart without QR, network drop and recovery, unlink from the phone and re-pair. "Log out WhatsApp" now needs a confirmation click (WA-24, Decision 41). The Phase 1 checkpoint's restart part is proven; its message part needs MSG.
- **Tests:** `pnpm test` gives 255 passed and 19 `it.todo` (session 9, after DEMO phase 3): BOOT-09, BOOT-16, the manual WA-23, WA-24, WA-27, MSG-24 (browser), MSG-28, and 12 DEMO ones (manual DEMO-02, 14, 21, and DEMO-26 to DEMO-34). Api test files now run one at a time too (MSG Decision 35).
  - typecheck, lint, format:check and traceability pass.
  - Package tests run one package at a time (`--workspace-concurrency=1`): the packages share `crm_test`. Api tests use Redis db 1, worker tests Redis db 2, dev uses db 0. Pub/sub channels carry the db number (`waChannels(db)`, WA-28): Redis pub/sub is shared by all databases, and before this fix a test run logged out the live dev session (WA Decision 43).
  - Worker tests: in-process managers with short timings, plus spawned `main.ts` for the kill/SIGTERM lock tests (WA-03, WA-05).
- **MSG approved and in build** (session 8): `docs/specs/003-messaging.md`, MSG-01 to MSG-28, text only. Open points settled as recommended (MSG Decision 17). History: `…-msg-spec-draft.md`, `…-msg-phase-1.md`.
  - Phase 1 done: `bullmq` 6.7.5 (api, worker); contracts in `packages/shared/src/messages.ts` (`MessageView`, `ConversationSummary`, `MessageStatusUpdate`, `SendMessageRequest`, `OutboundMessageJob`, `QUEUES`, `NextStatus` type), `CrmEvent` gains `message.created`, `message.status`, `conversation.updated`; `ProviderEvent` gains `message` and `status`; `WhatsAppProvider.sendText` (placeholders in both adapters reject until phases 4 and 5); permissions `inbox.read`, `messages.send` (Super Admin, Manager); typed socket events in `apps/api/src/sockets.ts`; migration `msg-core` (applied to `crm_dev`). `messages.sent_by_id` is `ON DELETE RESTRICT`: tests must delete a user's messages before the user.
  - Phase 2 done: `apps/worker/src/messages.ts` (inbound store, dedupe, publish), mappers in `packages/db/src/views.ts`, `skipped` provider event, Fake `receive`/`skip`/`receiveOnOldConnection`, `resetMessages` (test contacts use `+1999…`).
  - Phase 3 done: `apps/api/src/messages.ts` (`GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`), `queue.ts` (BullMQ `outbound-message`), `pushEvent` room choice in `sockets.ts` (MSG events to `inbox:all` only), `SocketControl.push`. New `ApiError` codes `wa_not_connected`, `queue_unavailable`.
  - Phase 4 done: `nextStatus` in `packages/shared/src/messages.ts`; `apps/worker/src/send.ts` (BullMQ processor, started on `open`, stopped before the provider closes; each send runs in the connection manager's in-order queue, MSG Decision 37); status reports in `messages.ts`; Fake `sendText`/`failSends`/`delaySends`/`echoNextSend`/`report`.
  - Phase 5 done: Baileys messages/receipts/`sendText` (`providers/baileys/helpers.ts`), web Messages tab (`messages-page.tsx`, `useMessages.ts`, `messages-view.ts`), Managers land on messages (WA-23 changed, MSG Decision 45).
- **MSG-28 phone check open** (2026-11-26, history `2026-11-26-msg-phone-check.md`). Session 8 ran the dev stack on the real number (it reconnected without a QR); that background task and its event recorder are gone since session 9. It can be run again on the live stack at any time. A read-only recorder on `crm:events:0` logs event types and statuses (no message text). The user was given the steps: log in as `manager@crm.test`, message the number from the test phone, reply from the CRM and watch the ticks, type on the company phone ("Sent from phone"), send a photo ("Unsupported message (image)"), then the restart-with-a-queued-message step (I restart the stack). No result recorded yet.
- **Next (before the flow change):** finish MSG-28, close MSG and the Phase 1 checkpoint, then the INB spec. Now paused for the DEMO build.
- **Dev stack:** the test number stays linked; `WHATSAPP_PROVIDER=baileys pnpm dev` (the env var wins over `.env`, which has no `WHATSAPP_PROVIDER`) reconnects without a QR. Plain `pnpm dev` uses the Fake and does not touch the real session.
- **Seen while the user's Fake dev stack ran 01:07 to 02:06:** the worker logged "lost the WhatsApp lock" 4 times. `pmset -g log` shows the Mac slept at 01:09:53 with dark wakes at 01:10, 01:19, 01:35 and 01:53: on each wake the heartbeat found the 30 s lock expired, closed WhatsApp and took the lock again (WA-04 as designed, not a bug). Awake, the lock refreshed every 10 s with one owner. With Baileys each wake means a reconnect (no QR). Keep the Mac awake during demos.
- **`/arena` was invoked with no task**, then the user said "continue with no arena". Nothing was run (only `plan`, which writes nothing); there is no `.arena/` folder.
- `crm_dev` holds a `FAKE` session row, a live `BAILEYS` session for the test number, `wa.*` audit rows from the checks, and the `msg-core` columns. The browser-check conversation (`+19995550123`) was deleted; dev Redis db 0 holds a few completed `outbound-message` jobs from that check.
- `pnpm test` is safe to run while the dev stack is connected (proved live, WA Decision 43). Tests must never use Redis db 0: not for keys, not for publishing, not for listening.
- Git: local commits only, no remote. `node_modules/` is still in the first commit (`a207d9c`); squash before pushing.
- Session notes: `docs/history/`.

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
- Entry files: `apps/api/src/main.ts` and `apps/worker/src/main.ts` (env check, then start). The api is `app.ts` (`createApp(deps, { extraRouters })`, used by tests through supertest; `extraRouters` is test-only), `config.ts` (`AuthConfig`), `access.ts` (route guard, `authenticate`, `checkSession`), `session.ts` (cookie and Redis sessions), `sockets.ts` (Socket.io server, rooms, `SocketControl`), `auth.ts` (`/auth` router), `health.ts` and `redis.ts`. `apps/api/src/test-support.ts` and `test-global-setup.ts` are test-only. `@crm/db` exports `createDb` and `Db` from `src/client.ts`. The api also has `wa.ts`, `events.ts` and `origin.ts` (WA), and `messages.ts` (`/conversations` routes) and `queue.ts` (BullMQ `outbound-message`) (MSG). `@crm/db` also exports the row-to-view mappers (`src/views.ts`). The worker has `messages.ts` (inbound store, status reports) and `send.ts` (queue processor); the Baileys pure helpers are `providers/baileys/helpers.ts`. The web app has `messages-page.tsx`, `useMessages.ts`, `messages-view.ts`, `mode.ts` and the demo app in `src/demo/` (DEMO). WA tests: `apps/worker/src/{wa,crypto}.test.ts` (with `test-support.ts`), `apps/api/src/wa.test.ts`, `apps/web/src/view.test.ts`. MSG tests: `apps/worker/src/messages.test.ts`, `apps/worker/src/providers/baileys/baileys.test.ts`, `apps/api/src/messages.test.ts`, `packages/shared/src/messages.test.ts`, `apps/web/src/messages.test.ts`.
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
- Prettier ignores `docs/` and `.claude/`; everything else must pass `pnpm format:check`.

## Hard rules
- Role checks happen on the server (routes and socket rooms). Hiding something in React is not security.
- The reply lock is enforced at the send endpoint, not only in the UI.
- Only one WhatsApp session may be live at a time (a Redis lock is held when the worker starts).
- TypeScript strict mode, no `any`. Zod schemas in `packages/shared` are the single source of truth for every data shape.
- Never fake WhatsApp delivered/read ticks. Show only what the provider reported. Exception: demo mode (`--mode demo`, DEMO spec) is a labelled simulation for the prototype; its QR, messages and ticks are simulated and every screen says so. Live mode keeps every real rule.
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
| `docs/how-it-works.md` | One-page reference of how the built app works (FND, WA, MSG) and notes for the UI/dummy-data phase |
| `docs/plan/project-summary.md` | Module list, tech stack, the 7-step final demo |
| `docs/plan/development-plan.md` | Spec areas and prefixes, phases and build order, test strategy, definition of done |
| `docs/plan/Architure-plan.md` | Processes, dependency directions, provider interface, data model, security, reliability |
| `docs/plan/data-flow-plan.md` | Any flow, state machine, event or queue |
| `docs/data-flow/README.md` | Which route, event or queue delivers what (FND, WA and MSG paths built; the rest planned) |
| `docs/specs/002-whatsapp.md` | WA criteria and Decisions |
| `docs/specs/003-messaging.md` | MSG criteria and Decisions 1 to 48 |
| `docs/specs/004-demo.md` | DEMO criteria (demo mode on dummy data), Decisions, build phases |
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
- MSG is built; MSG-28 (real phone) is open. Specs after MSG (INB, LEAD, …) are unwritten. INB must add the reply-lock check, the Employee scope and the assignee rooms together (MSG Proposed changes), plus unread counts and conversation paging. LEAD adds lead auto-creation to the inbound handler.
- MSG known limitations (for DOC): an inbound message whose store fails (Postgres down) is lost (MSG Decision 29); a crash between WhatsApp's acceptance and saving `sent` can send a message twice (MSG open point 1, accepted); a job active when a worker is killed waits for BullMQ's 30 s stalled check (MSG Decision 43).
- Full `pnpm test` runs can time out under heavy machine load (FND-03, and once FND-04 at load average 11, MSG Decision 36). Re-run before suspecting the code.
- `baileys` is a release candidate (7.0.0-rc14); it passed WA-27. If it misbehaves later, the fallback is `legacy` 6.7.24 (WA Decision 6).
- The USR deactivate route must call `sockets.endUser` so sockets drop at once (FND Decision 40).
- FND-03's 2 s health timeout failed under parallel package tests; package tests now run one at a time (WA Decision 27). Watch it in CI.
- CI (`.github/workflows/ci.yml`) has not run; needs a GitHub repo.
- pnpm skips the install scripts of `prisma` and `@prisma/engines`; the Prisma CLI fetches its schema engine on first use. Check this on the first CI run.
- Suggested but not specced: CI check for the exact Baileys version pin, struck-through and duplicate IDs in traceability, `format:check` in CI.
