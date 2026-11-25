Status: approved

# Spec 1: Foundation, auth, roles, config (FND)

Env validation, health check, the core database schema and seed, login with server-side sessions, the permission map, and authenticated sockets with server-controlled rooms.

## Goal

After this spec is built, the API and worker refuse to start on bad config, the database has its core tables and a seed with one user per role, a user can log in and out with a server-side session, every route is guarded by a declared permission, and a socket connection is only accepted for a logged-in user and only placed in rooms the server chooses. No WhatsApp, inbox or lead behaviour exists yet.

## Scope

- Zod env schemas in `packages/shared`, one per app (api, worker), validated at boot.
- `GET /health` (API, Postgres, Redis).
- Prisma models and the initial migration: User, Contact, Conversation, Message, WhatsAppSession, AuditLog. Only the columns listed under Contracts touched.
- `pnpm migrate` and `pnpm seed` become real (they were BOOT placeholders). `migrate` runs `prisma migrate deploy`, which is non-interactive and repeatable. Seed has one user per role and a few test contacts.
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`. Redis sessions in an httpOnly cookie, login rate limit.
- One role→permission map in `packages/shared`, and a route guard that every route must use: each route declares either `public` or one permission.
- Socket.io handshake authentication and server-assigned rooms (`inbox:all`, `user:<id>`, `admin`, `global`).
- `.env.example`.
- The BOOT-15 change listed under "Changes to BOOT".

## Out of scope

- Provider interface and the Fake and Baileys adapters (WA).
- Message flow, dedupe behaviour, queues and status handling (MSG). FND only creates the table and its unique constraint.
- Assignment, conversation states, notes, reply lock (INB).
- Lead, Note, Property, Campaign and Follow-up tables and the lead stages (LEAD, PROP, CMP, FUP).
- User create, deactivate and role-change screens or routes (USR). Seed is the only way users exist in FND.
- Writing audit entries for logins (AUD). FND only creates the table.
- Any React UI. The login page is a WA criterion (Decision 4).
- Encryption of the WhatsApp session (WA). FND only creates the table and defines the key in env.
- Real Manager-only or Super Admin-only routes. Their permissions are declared here and used by later specs.

## Acceptance criteria

IDs are `FND-NN` and are never reused. "Test level" also states how it is verified. Test titles start with the criterion ID, e.g. `FND-08 wrong password and unknown email return the same 401`.

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| FND-01 | Starting the api or the worker with a required env variable missing or invalid exits non-zero and prints the name of each bad variable. No secret value is printed. | Must | Test |
| FND-02 | With a valid env, the api and the worker start and print their startup line. | Must | Test |
| FND-03 | `GET /health` returns 200 with `api`, `postgres` and `redis` all `ok`. When Postgres or Redis is unreachable it returns 503 and names the failing dependency. | Must | Integration test |
| FND-04 | On an empty `crm_test` database, `pnpm migrate` creates the tables for User, Contact, Conversation, Message, WhatsAppSession and AuditLog, and exits 0. Running it again exits 0 and applies no migration. | Must | Integration test |
| FND-05 | The database rejects a duplicate User email, a duplicate Contact phone, a second Conversation for the same Contact, and a duplicate non-null Message provider message ID. Each is a unique-constraint error, not an application check. Two Messages with no provider message ID are both accepted. | Must | Integration test |
| FND-06 | `pnpm seed` creates one active Super Admin, one Manager and one Employee, and at least two Contacts flagged as test. A second run leaves the row counts unchanged. Seed refuses to run when `NODE_ENV` is `production`. | Must | Integration test |
| FND-07 | `POST /auth/login` with correct credentials returns 200, sets an httpOnly, SameSite cookie, and creates a session entry in Redis. The response contains the user id, name and role, and nothing else about the user. `GET /auth/me` with that cookie returns the same shape. | Must | Integration test |
| FND-08 | A wrong password, an unknown email and a deactivated user all return the same 401 with the same body. | Must | Integration test |
| FND-09 | After N failed logins for one email within the window, further attempts for that email return 429, including with the correct password. A different email is not affected. N and the window are config. | Should | Integration test |
| FND-10 | `POST /auth/logout` deletes the session from Redis. Reusing the old cookie returns 401. | Must | Integration test |
| FND-11 | When a user is set inactive in the database, the user's existing session is rejected on the next request with 401. | Must | Integration test |
| FND-12 | The permission map has an entry for every role, and every permission is granted to at least one role. An Employee has none of the Manager or Super Admin permissions, and a Manager has none of the Super Admin-only permissions. | Must | Unit test |
| FND-13 | A test enumerates all Express routes, including routes mounted on routers, and fails if any route declares neither `public` nor a permission. Only `/health` and `/auth/login` are `public`. | Must | Test |
| FND-14 | A protected route returns 401 without a session and 403 with a session whose role lacks the route's permission. Verified with a test-only router that is mounted in the test app and never in the production app. | Must | Integration test |
| FND-15 | A socket connection without a valid session is refused. With a valid session it connects. | Must | Socket test |
| FND-16 | A client emitting a join request for any room is ignored, and the client receives nothing from that room. | Must | Socket test |
| FND-17 | On connect, Super Admin and Manager are in `inbox:all`, only Super Admin is in `admin`, every user is in `user:<id>` for their own id and in `global`, and an Employee is never in `inbox:all` or `admin`. | Must | Socket test |
| FND-18 | A password is stored only as an argon2 hash. The hash and the password never appear in any API response, or in the log output captured during the FND auth tests. | Must | Integration test |
| FND-19 | `.env.example` exists and lists every variable the api and worker env schemas require. | Should | Test |
| FND-20 | After a user logs out or is set inactive, that user's open sockets are disconnected no later than the next request or socket event from that user, and receive no further room events. | Should | Socket test |

Priority: Must (blocks the checkpoint), Should (do in the phase if time allows), Could (only if trivial).

## Contracts touched

Types only, written before the tests.

- Zod: `ApiEnv`, `WorkerEnv`, `Role` (`SUPER_ADMIN`, `MANAGER`, `EMPLOYEE`), `Permission`, `LoginRequest`, `SessionUser`, `HealthResponse`.
- Permissions (FND set, later specs add more): `auth.session` (any logged-in user; logout and `/auth/me`), `users.manage` (Super Admin, Manager; used by USR), `wa.manage` (Super Admin only; used by WA). Routes use `public` or one permission.
- Permission map: `Record<Role, Permission[]>` in `packages/shared`.
- Prisma models, minimal columns:
  - User: id, email (unique), name, passwordHash, role, active.
  - Contact: id, phone (unique, E.164), name, isTest.
  - Conversation: id, contactId (unique).
  - Message: id, conversationId, providerMessageId (nullable, unique), direction.
  - WhatsAppSession: id, number (unique), encryptedCreds.
  - AuditLog: id, actorId (nullable), action, ip (nullable), meta (JSON, nullable), createdAt. Insert-only from application code (enforced in AUD).
- Socket: room names as a typed helper, and the handshake auth shape.
- Env variables (Decision 7): `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `SESSION_TTL_SECONDS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_SECONDS` (api); `DATABASE_URL`, `REDIS_URL`, `SESSION_ENCRYPTION_KEY` (worker); `SEED_PASSWORD` (seed only, documented dev default).

## Edge cases

- FND-01: empty string counts as missing. `SESSION_ENCRYPTION_KEY` must decode to exactly 32 bytes (64 hex characters). Error output must not echo the value.
- FND-03: Redis down and Postgres down at the same time names both.
- FND-05: the Conversation and Message constraints are tested by a raw insert, so no application code can mask them.
- FND-06: seed passwords come from `SEED_PASSWORD` or the documented dev default, never a production value.
- FND-08: the response time must not reveal whether the email exists (hash a dummy password for unknown emails).
- FND-09: a successful login does not reset another email's counter. Counter expiry is tested with a short window.
- FND-11: deactivation is checked on every request, not cached past the session lookup.
- FND-13: routes mounted by a router are found too, not just top-level ones.
- FND-14: the test-only router must not be reachable in the app built by `pnpm dev`.
- FND-15 to FND-17: a session that expires while connected (see Decisions).
- Cookie `Secure` is on in production and off on `http://localhost`.

## Manual check

1. `docker compose up -d --wait`, then `pnpm migrate` and `pnpm seed`. Both exit 0.
2. Remove `DATABASE_URL` from the env and start the api. It exits and names `DATABASE_URL`.
3. With everything up, `curl` `/health` and see `ok` for all three. Stop Redis and see 503 naming `redis`.
4. Log in as each seeded role with `curl -c`, then call `GET /auth/me` with the cookie and see that user's id, name and role.
5. Log out, then reuse the cookie on `GET /auth/me` and see 401.
6. Connect with a socket client without a cookie and see it refused. With an Employee cookie, confirm only `user:<id>` and `global` are joined.

## Overlap with BOOT

`docs/plan/development-plan.md` §3 refers to `FND-01`, `02` and `12` ("monorepo, strict TypeScript, lint rule banning `any`, Docker Compose, env validation with Zod, `/health`"), `FND-03, 04` and `FND-05` to `09`. Those were placeholders in the plan and never existed in a spec, so this spec assigns `FND-01` onwards fresh. The plan's numbers do not match this spec, and this spec is the reference.

- Monorepo, strict TypeScript, the `any` ban and Docker Compose are covered by BOOT-01 to BOOT-09. They are not repeated in FND.
- Env validation and `/health` are covered by FND-01 to FND-03.

I will update the dev plan's numbers only if you ask.

## Changes to BOOT

FND makes `migrate` and `seed` real, so BOOT-15 ("On an empty schema (no models), `pnpm migrate` and `pnpm seed` each exit 0 against the Compose Postgres") no longer holds as written. Its test (`tests/bootstrap/migrate-seed.test.ts`) runs both commands with no env, so it would fail env validation or touch the wrong database (BOOT-10 says tests use `crm_test` only).

Proposed, applied during the FND build in the order spec, test, code:
- BOOT-15 wording: "`pnpm migrate` and `pnpm seed` each exit 0 against the Compose `crm_test` database."
- Its test sets `DATABASE_URL` to `crm_test`.
- BOOT's "Overlap with FND" gets a one-line pointer to this spec.

Approved by the user on 2026-11-25 (Decision 6). The wording was applied in phase 1, and the test change in phase 3.

## Proposed changes

Changes to the plan's defaults. All accepted by the user on 2026-11-25 (Decisions 2 to 5).

| Default | Proposal | Trade-off |
| --- | --- | --- |
| Dev plan puts Conversation and Message tables in FND with full behaviour | FND creates only the minimal columns for its constraints. INB, MSG and LEAD add columns by migration. | Several small migrations later, but FND stays testable on its own. |
| Dev plan: password hash "argon2 (or bcrypt)" | argon2 | Native build on install. Bcrypt has no native-build risk but is weaker. |
| Login UI | API only in FND. The minimal login page becomes a WA criterion, because the Phase 1 checkpoint needs the Super Admin QR page in a browser. | The seeded users can only be tried with `curl` until WA. |
| Audit of logins | Table in FND (with nullable actor, IP and meta, so AUD needs no migration for logins), login entries in AUD. | Login events are not recorded until AUD is built. |

## Suggested additions

Not in the criteria.

- CSRF protection beyond SameSite for cookie sessions.
- A CI step that runs `pnpm migrate` and the integration tests against Compose services.
- Session ID rotation on login.
- A `pnpm migrate:reset` command for the test database.

## Decisions

All recommendations accepted by the user on 2026-11-25.

1. A session that expires in Redis while its socket is connected is not tested on its own in FND. FND-20 covers logout and deactivation. Plain expiry is picked up by the same check on the next socket event, and gets a dedicated test only if FND-20 is built in a way that does not already cover it.
2. Minimal schema: FND creates only the columns listed under Contracts touched. INB, MSG and LEAD add columns by migration.
3. Passwords are hashed with argon2.
4. FND is API only. The minimal login page becomes a WA criterion, because the Phase 1 checkpoint needs the Super Admin QR page in a browser.
5. FND creates the AuditLog table (nullable actor, IP, meta). Writing login, logout and failed-login entries belongs to AUD.
6. BOOT-15 is reworded and its test pointed at `crm_test`, as described under "Changes to BOOT". It is applied during the FND build, in the order spec, test, code.
7. Env variable names and the FND permission set (`auth.session`, `users.manage`, `wa.manage`) are as listed under Contracts touched.
8. FND-20 (disconnect sockets on logout or deactivation) is a Should.
9. The dev plan's FND numbers were placeholders. This spec numbers from FND-01. Updated in phase 1: the user asked for all docs to be kept current, so `development-plan.md` §3 now has a one-line note pointing here. Its old numbers are not rewritten.

Made during FND phase 1 (2026-11-25), within the approved 5-phase build plan:

10. Sessions use a small Redis store, not express-session. `sess:<id>` holds a `SessionRecord` (`userId`, `role`, `createdAt`) with a TTL of `SESSION_TTL_SECONDS`. `user-sess:<userId>` is the set of that user's session IDs, so logout and deactivation can end all of them (FND-20). The login rate limit is `INCR` plus `EXPIRE` on `login-fail:<email>`.
11. Package versions, pinned exactly: zod 4.6.7; prisma, @prisma/client and @prisma/adapter-pg 7.10.1; pg 8.23.1; argon2 0.45.2; express 5.3.0; socket.io and socket.io-client 4.8.4; ioredis 6.1.0; supertest 7.3.2. Prisma is on stable 7.10.1, because npm's `latest` tag for `prisma` points at 8.0.0-rc.35.
12. Prisma setup: the `prisma-client` generator (ESM, `importFileExtension = "ts"`) writes to `packages/db/src/generated/prisma/`. That folder is gitignored and ignored by ESLint and Prettier, and `@crm/db`'s `postinstall` regenerates it. A spike confirmed the client runs under `node file.ts` (type stripping) with the pg driver adapter against Compose Postgres, and that argon2's prebuilt binary loads. `prisma.config.ts` reads `DATABASE_URL` from the environment and allows it to be unset for `prisma generate`.
13. Schema details within Decision 2: UUID ids; snake_case tables and columns via `@@map`/`@map` (`users`, `contacts`, `conversations`, `messages`, `whatsapp_sessions`, `audit_logs`); `Message.direction` is an enum `INBOUND | OUTBOUND`; `WhatsAppSession.encryptedCreds` is text (WA may change the format).
14. Env additions within Decision 7: `NODE_ENV` (`development` | `test` | `production`, default `development`) for all three schemas, and `PORT` (default 4000) for the api. Tunables have defaults: `SESSION_TTL_SECONDS` 43200, `LOGIN_MAX_ATTEMPTS` 5, `LOGIN_WINDOW_SECONDS` 900, `SEED_PASSWORD` `crm-dev-password`. `ALLOWED_ORIGINS` is a comma-separated list of URLs.
15. `LoginRequest.email` is trimmed and lower-cased before validation, so the rate limit (FND-09) and the user lookup are case-insensitive.
16. Socket handshake auth uses the same session cookie as HTTP, so there is no separate handshake payload type. Room names are the `ROOMS` constant plus `user:<id>` (`packages/shared/src/rooms.ts`).

Made during FND phase 2 (2026-11-25), within the approved build plan:

17. Env loading: one root `.env` (gitignored), loaded by Node's built-in `--env-file-if-exists=../../.env` in the api and worker `dev` scripts. No dotenv package. A variable set in the real environment wins over the file. Tests never read `.env`: the boot tests spawn `main.ts` with an explicit env, and the health tests pass URLs directly.
18. `.env.example` leaves `SESSION_SECRET` and `SESSION_ENCRYPTION_KEY` blank, with an `openssl rand -hex 32` hint (chosen by the user on 2026-11-25). A fresh copy therefore fails FND-01, naming both, until they are filled in. The file lists every `ApiEnv`, `WorkerEnv` and `SeedEnv` key. FND-19 checks every api and worker key, including the ones with defaults.
19. `parseEnv(schema, source)` and `formatEnvProblems(app, problems)` in `packages/shared/src/env.ts` are pure. Each app's `main.ts` prints the problems to stderr and exits 1. A problem's reason is `missing` or Zod's message. If a message ever contained the value, the reason falls back to `invalid`.
20. Health: `SELECT 1` and `PING` run in parallel, each bounded by `HEALTH_CHECK_TIMEOUT_MS` = 2000 (a constant, not env). The api does not wait for Postgres or Redis at startup; `/health` reports them. Redis connection errors are logged by error code only, once per outage, because URLs can hold passwords. `/health` is a plain route until phase 4 adds the FND-13 guard, which declares it `public`.
21. `@crm/db` exports `createDb(databaseUrl)` (Prisma client with the pg adapter and a 2 s connect timeout) and the `Db` type. The api's Redis client is `createRedis(url)` in `apps/api/src/redis.ts` (ioredis, `maxRetriesPerRequest: 1`, 2 s connect timeout). Phase 3 (seed) and phase 4 (sessions) reuse them.
22. The api and worker entry files are `src/main.ts`, renamed from the BOOT placeholder `src/dev.ts`. Startup lines: `@crm/api listening on port <PORT>` and `@crm/worker started`. Neither prints a URL or a secret. `apps/web` keeps its `src/dev.ts` placeholder until a web spec.

Made during FND phase 3 (2026-11-25), within the approved build plan:

23. `pnpm migrate` runs `packages/db/src/migrate.ts`. It validates a new `MigrateEnv` contract (`DATABASE_URL` only) with `parseEnv`, then runs `prisma migrate deploy` and exits with Prisma's status. A missing or invalid URL is named and never printed, the same as FND-01. `migrate` does not refuse production; deploying migrations is what production needs.
24. The first migration is `packages/db/prisma/migrations/20261125145958_init/`, created with `prisma migrate dev --create-only --name init` against `crm_dev`. Later specs add their own migration with the same command and `--name <area>-<change>`. Unique constraints are Prisma's unique indexes, named `<table>_<column>_key` (for example `users_email_key`).
25. Seed: one user per role (`superadmin@crm.test`, `manager@crm.test`, `employee@crm.test`), each with its own argon2id hash of `SEED_PASSWORD`, and two test contacts with fictional numbers `+12025550101` and `+12025550102`. Users and contacts are upserted by email and phone with an empty `update`, so a second run writes nothing. The production check runs before any database connection. Seed prints counts only, never the password.
26. The db `migrate` and `seed` scripts load the root `.env` with `--env-file-if-exists=../../.env`, the same as the api and worker `dev` scripts (Decision 17). Tests that spawn them set every `MigrateEnv` and `SeedEnv` key explicitly, so `.env` cannot change their result.
27. Test database: the db tests share `crm_test` and run with `fileParallelism: false`. FND-04 starts from `DROP SCHEMA public CASCADE`; the FND-05 and FND-06 files migrate and then truncate. Helpers live in `packages/db/src/test-support.ts`, which is not exported. FND-05 uses raw SQL through `pg`. `pnpm -r test` runs packages in dependency order, so the db tests finish before the api tests, which also use `crm_test`. This was checked in the phase 3 test log.

Made during FND phase 4 (2026-11-25), within the approved build plan:

28. Session cookie: `crm_sid` = `<id>.<sig>`. `id` is 32 random bytes (base64url), and `sig` is HMAC-SHA256 of the id with `SESSION_SECRET`, checked with `timingSafeEqual`. A bad signature is a 401 without a Redis lookup. Flags: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` = `SESSION_TTL_SECONDS`, and `Secure` only when `NODE_ENV=production`. The Cookie header is parsed by a small local function (no cookie-parser). Code: `apps/api/src/session.ts`, `config.ts` (`AuthConfig`, `authConfigFrom(env)`).
29. Route guard: `createAccess(deps)` returns `access(level)`, which must be every route's first handler. It is tagged with the `ACCESS` symbol, which the FND-13 walker reads (`app.router` and router 2.x `rawPath`, so mount prefixes are included). For a non-public level, it checks the signed cookie, loads `sess:<id>`, and loads the user from Postgres on every request. A missing session or an inactive or deleted user gets a 401, and the session is also destroyed. The role is taken from the user row, not the session. `can(role, level)` false gives a 403. The authenticated user is kept in a `WeakMap<Request, …>` read through `sessionOf(req)`, instead of the untyped `res.locals`.
30. Permission map (FND-12): Super Admin `auth.session, users.manage, wa.manage`; Manager `auth.session, users.manage`; Employee `auth.session`. `can(role, permission)` lives next to it in `packages/shared/src/auth.ts`.
31. Login: `LoginRequest` (400 `invalid_request` on a bad shape) → rate-limit check → user lookup → `argon2.verify`. An unknown email is verified against a dummy hash made once per app. Wrong password, unknown email and inactive user all get `401 {"error":"invalid_credentials"}`. The rate limit is checked before the password, so the right password is blocked too (429 `too_many_attempts`). A failure runs `INCR` plus `EXPIRE … NX` in one `MULTI`. A success deletes only that email's own counter. Counters are kept for unknown emails too.
32. Responses: login 200 and me 200 return `SessionUser`; logout returns 204 and clears the cookie. Every error body is the new `ApiError` contract (`{ error: string }`): `unauthenticated`, `forbidden`, `not_found`, `invalid_request`, `internal`. The error handler never logs the request body or the error message, only the error name for a 500. JSON bodies are limited to 16 kB.
33. Routes: the auth router is mounted at `/auth`. `createApp(deps, { extraRouters })` accepts test-only routers (FND-14); `main.ts` never passes any, and the test checks that the production app returns 404 on the test path.
34. Api tests: `apps/api/src/test-support.ts` (not imported by app code). They use `crm_test` and Redis **db 1** (`redis://localhost:6379/1`), so test sessions and counters never land in the dev db 0. They create their own users with random emails and delete them afterwards. A vitest `globalSetup` runs `pnpm migrate` on `crm_test`, so the api tests also run on their own. FND-18 spies on `console` and `process.stdout`/`stderr` for the whole auth test file, and checks every response body and header it received.
35. No CORS in FND phase 4: no criterion needs it, and the login page is WA. `ALLOWED_ORIGINS` is used from phase 5 (socket server) on.
