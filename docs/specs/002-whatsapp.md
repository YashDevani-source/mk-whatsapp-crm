Status: approved

Built: 2026-11-25, in 5 phases. WA-01 to WA-26 have passing tests; the manual check passed with the Fake provider (Decision 38). **WA-27 (the real test phone) is not yet done**: it needs the user's test phone.

Drafted and approved 2026-11-25. The user's "do all parts" approved the draft with its recommendations (Decisions 5 to 11, and the open points as recommended: `baileys` 7.0.0-rc14, lock TTL 30 s, no "Get new QR" in `disconnected`) and the build of all five phases.

# Spec 2: WhatsApp connection (WA)

The provider interface (connection part), the Fake and Baileys adapters, the single-session lock, the encrypted session, the QR connection page, the status banner, and the minimal login page.

## Goal

After this spec is built, a Super Admin logs in through the browser, opens the connection page, scans the QR with the test phone and sees "connected". Every logged-in user sees a live connection banner. Restarting the worker reconnects without a new QR. A second worker never opens a WhatsApp socket while the first holds the lock. The stored WhatsApp session is encrypted in Postgres. No message is sent or received yet (MSG).

## Scope

- The provider interface in `packages/shared`, connection part only: connect, logout, close, and the `qr`, `open`, `close` and credentials-update events. Types only.
- The Fake adapter (`apps/worker/src/providers/fake/`): controllable from tests, and auto-pairing in `pnpm dev`, labelled simulated.
- The Baileys adapter (`apps/worker/src/providers/baileys/`), connection only, pinned exactly.
- The worker's connection manager: provider selection, single-session Redis lock with heartbeat, the state machine, reconnect backoff, and admin commands.
- The encrypted session store (AES-256-GCM) in Postgres, used by both adapters.
- The worker→api event relay (Redis pub/sub) and the `wa.state` and `wa.qr` socket events.
- `POST /wa/qr` and `POST /wa/logout` (Super Admin only).
- An origin check for socket handshakes and state-changing HTTP requests. No CORS headers (Decision 1).
- `apps/web` becomes a Vite + React app with the login page, the connection page and the banner.
- Audit rows for WhatsApp connect, disconnect, logout and admin requests.

## Out of scope

- Sending, receiving and message status, including `sendText`, `onMessage` and `onStatus` on the interface (MSG). MSG adds them to the interface and both adapters.
- Media (PROP, MSG).
- The Socket.io Redis adapter for more than one api instance.
- A production build and serving of the web app (DOC).
- Rotation of `SESSION_ENCRYPTION_KEY`.
- Showing the connected phone number in the UI.
- A router and any page other than login, connection and a placeholder home (INB adds them).
- The WhatsApp Cloud API adapter (documented by DOC, not built).

## Acceptance criteria

IDs are `WA-NN` and are never reused. "Test level" also states how it is verified. Test titles start with the criterion ID, e.g. `WA-02 a second worker stays on standby while the lock is held`.

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| WA-01 | With `WHATSAPP_PROVIDER` unset the worker uses the Fake provider, and with `baileys` it uses the Baileys adapter. Any other value exits non-zero and names `WHATSAPP_PROVIDER` (the FND-01 mechanism). | Must | Test |
| WA-02 | The worker acquires `wa:lock` before it creates any provider connection. A second worker started while the lock is held prints a standby line, makes no provider `connect` call, and publishes no `wa.state`. | Must | Worker test |
| WA-03 | When the lock holder stops heartbeating (killed), the standby acquires the lock within the lock TTL plus one retry interval, and then connects. | Must | Worker test |
| WA-04 | When the holder's heartbeat finds the lock gone or owned by another worker, the holder closes its provider connection before its next heartbeat and publishes nothing more. | Must | Worker test |
| WA-05 | On SIGTERM the worker closes the provider connection without logging out, releases the lock only if it still owns it, and exits 0. A standby then acquires the lock without waiting for the TTL. | Should | Worker test |
| WA-06 | Session values are encrypted with AES-256-GCM using `SESSION_ENCRYPTION_KEY`, a random IV per write, and the row identity as additional authenticated data. A value round-trips. A tampered ciphertext, a wrong key, or a value copied to another row each fail with an error, never with garbage. | Must | Unit test |
| WA-07 | After a Fake pairing, a raw SQL read of the session tables finds no plaintext marker from the fake credentials. | Must | Integration test |
| WA-08 | With no stored session, the worker publishes `connecting` then `qr_required`, and every QR the provider emits is published as `wa.qr`. After the scan the state is `connected` and the credentials are stored. | Must | Worker test |
| WA-09 | With a stored session, a worker restart goes from `connecting` to `connected` with no `qr_required` and no `wa.qr`. | Must | Worker test |
| WA-10 | A credentials or keys update from the provider while connected is stored (encrypted), and a later restart loads the updated value. | Must | Worker test |
| WA-11 | After a network drop the state is `disconnected`, and the worker retries with exponential backoff: `min(base × 2ⁿ, max)` with ±20 % jitter (`WA_RECONNECT_BASE_MS`, `WA_RECONNECT_MAX_MS`). Each attempt publishes `connecting`. The backoff resets after `connected`. | Must | Unit test + worker test |
| WA-12 | When the phone logs the device out, the state is `reconnect_required` with reason `logged_out_from_phone`, the stored session is deleted, and no reconnect is attempted. | Must | Worker test |
| WA-13 | When the QR expires without a scan, the state is `reconnect_required` with reason `qr_timeout`, and no further QR is published until an admin asks for one (WA-18). | Should | Worker test |
| WA-14 | A stored session that cannot be decrypted gives `reconnect_required` with reason `session_unreadable`. The row is kept, the worker does not crash or loop, and the log names the error but never a value. | Should | Worker test |
| WA-15 | The api pushes `wa.state` to `global` and `wa.qr` only to `admin`. With one connected client per role, the Manager and the Employee never receive `wa.qr`. | Must | Socket test |
| WA-16 | On socket connect, every user receives the current `wa.state`, and a Super Admin also receives the current QR while the state is `qr_required`. When the worker's state key has expired, the state sent is `disconnected` with reason `worker_offline`. | Must | Socket test |
| WA-17 | A message on the event channel that fails its Zod schema or has an unknown version is dropped and logged by error name. Nothing is pushed. | Should | Socket test |
| WA-18 | `POST /wa/qr` (`wa.manage`) returns 202 when the state is `reconnect_required`, and the worker starts a fresh pairing (`qr_required`, then `wa.qr`). In any other state it returns 409 `invalid_state`. A Manager or Employee gets 403. | Must | Integration test + worker test |
| WA-19 | `POST /wa/logout` (`wa.manage`) returns 202 when the state is `connected`. The worker logs out at the provider, deletes the stored session, and the state becomes `reconnect_required` with reason `logged_out_by_admin`. In any other state it returns 409 `invalid_state`. A Manager or Employee gets 403. | Must | Integration test + worker test |
| WA-20 | The worker writes AuditLog rows `wa.connected`, `wa.disconnected` and `wa.logged_out` (no actor; meta holds the provider and the reason). The api writes `wa.qr_requested` and `wa.logout_requested` with the admin as actor and the request IP. No audit meta ever contains a QR or credentials. | Should | Integration test |
| WA-21 | A socket handshake whose `Origin` header is not in `ALLOWED_ORIGINS` is refused before the session check. An allowed origin, or no `Origin` header, continues to the session check (FND-15). | Must | Socket test |
| WA-22 | A non-GET HTTP request whose `Origin` header is not in `ALLOWED_ORIGINS` gets 403 `forbidden_origin`. The api sends no CORS headers for any origin. | Should | Integration test |
| WA-23 | The login page logs in with a seeded user's email and password. Every failure shows the same generic message (and 429 a "too many attempts" message). After login a Super Admin lands on the connection page and the other roles on a placeholder home. Logout returns to the login page. | Must | Manual |
| WA-24 | The connection page (Super Admin only) shows the live state, shows the QR and replaces it when a new one arrives, offers "Get new QR" in `reconnect_required` and "Log out WhatsApp" in `connected`, and shows any error from those actions. | Must | Manual |
| WA-25 | Every page shows the connection banner to every role. It warns on `disconnected` and `reconnect_required`, and shows "Simulated" whenever the provider is `fake`. | Must | Unit test (banner text) + Manual |
| WA-26 | `baileys` is pinned to an exact version in `apps/worker/package.json` (no `^` or `~`), is imported only inside `apps/worker/src/providers/baileys/`, and the adapter there satisfies the shared provider interface. | Must | Test |
| WA-27 | With the real test phone and `WHATSAPP_PROVIDER=baileys`: scanning the QR connects; restarting the worker reconnects without a QR; cutting the server's network shows `disconnected` and then recovers; unlinking the device from the phone shows `reconnect_required`, and "Get new QR" pairs again. | Must | Manual |

Priority: Must (blocks the checkpoint), Should (do in the phase if time allows), Could (only if trivial).

## Contracts touched

Types only, written before the tests (WA phase 1).

- Zod in `packages/shared/src/wa.ts`:
  - `WaConnectionState`: `connecting`, `qr_required`, `connected`, `disconnected`, `reconnect_required`.
  - `WaProviderName`: `fake`, `baileys`.
  - `WaReason`: `network`, `logged_out_from_phone`, `logged_out_by_admin`, `qr_timeout`, `session_unreadable`, `worker_offline`, `other`.
  - `WaState`: `{ v: 1, state, provider, reason?, at }` (`at` is an ISO time).
  - `WaQr`: `{ v: 1, qr, at }`.
  - `CrmEvent`: the envelope on the event channel, a union on `event`: `wa.state` (payload `WaState`) and `wa.qr` (payload `WaQr`). MSG adds its events here.
  - `WaCommand`: `{ v: 1, command: 'new_qr' | 'logout', actorId }`.
- Provider interface (TypeScript types in `packages/shared`): `WhatsAppProvider` with `connect(store)`, `logout()` and `close()`, and the events `qr(qr)`, `open()`, `close({ reason: 'network' | 'logged_out' | 'qr_timeout' | 'other' })`. `ProviderAuthStore`: load and save the credentials, get and set keys by type and id. The provider reports what happened; the connection manager decides the state and whether to reconnect.
- Permissions: `wa.manage` (Super Admin) already exists. No new permission.
- Routes: `POST /wa/qr` and `POST /wa/logout`, both `wa.manage`, both 202 with no body. New `ApiError` codes `invalid_state` and `forbidden_origin`.
- Socket: typed server-to-client events `wa.state` (`WaState`) and `wa.qr` (`WaQr`) on `CrmServer`.
- `WorkerEnv` adds `WHATSAPP_PROVIDER` (`fake` | `baileys`, default `fake`), `WA_LOCK_TTL_MS` (default 30000), `WA_RECONNECT_BASE_MS` (default 1000), `WA_RECONNECT_MAX_MS` (default 60000). `.env.example` lists them (FND-19). `ApiEnv` is unchanged; `ALLOWED_ORIGINS` gets the dev value `http://localhost:5173`.
- Prisma migration `wa-session`:
  - `WhatsAppSession` gains `provider` (enum `FAKE` | `BAILEYS`, unique: one row per provider) and `updatedAt`. `number` becomes nullable, because it is known only after pairing (it stays unique when set). `encryptedCreds` keeps its name and holds the encrypted credentials.
  - New `WhatsAppSessionKey`: `id`, `sessionId` (cascade delete), `type`, `keyId`, `encryptedValue`, unique (`sessionId`, `type`, `keyId`). Table `whatsapp_session_keys`.
  - WA phase 1 checks this shape against Baileys' `AuthenticationState` types before the migration is created.
- Redis:
  - `wa:lock`: the worker id, set with `NX` and a TTL of `WA_LOCK_TTL_MS`. The holder refreshes it every TTL / 3 with an owner check (Lua), and deletes it on shutdown with an owner check.
  - `wa:state`: the latest `WaState`, with the same TTL, refreshed by the heartbeat. A missing key means `worker_offline`.
  - `wa:qr`: the latest `WaQr`, short TTL, deleted when the state leaves `qr_required`.
  - Pub/sub `crm:events` (worker to api, `CrmEvent`) and `wa:commands` (api to worker, `WaCommand`).

## Edge cases

- WA-02 to WA-04: a heartbeat runs after another worker has already taken the lock; a worker dies between connecting and its first heartbeat; two workers start at the same instant.
- WA-08 and WA-13: the QR changes several times before a scan; each one replaces the last on the page.
- WA-15 and WA-16: a QR never reaches `global`, `user:<id>`, `inbox:all`, any log line, or audit meta.
- WA-16: a browser that connects while the worker is down sees `worker_offline`, not a stale `connected`.
- WA-18 and WA-19: the state changes between the api's check and the worker receiving the command. The worker re-checks its own state and ignores a command that no longer applies. A standby worker ignores every command.
- WA-09: switching `WHATSAPP_PROVIDER` never loads the other provider's session (the `provider` column).
- WA-06: an empty value, and a value with an unknown format version, fail with an error.
- WA-21: a missing `Origin` is allowed because browsers always send one on a WebSocket handshake; the session cookie is still required.
- WA-25: in `pnpm dev` the Fake shows a QR labelled simulated and then pairs itself after a few seconds. Tests switch auto-pairing off and drive the Fake directly (`emitQr`, `scan`, `drop`, `logoutFromPhone`, `updateCreds`).

## Manual check

1. `docker compose up -d --wait`, `pnpm migrate`, `pnpm seed`, then `pnpm dev` with the default Fake provider. Open `http://localhost:5173`.
2. Log in as each seeded role. Each sees the banner with "Simulated". A wrong password shows the generic error.
3. As Super Admin, open the connection page and see the simulated QR, then "connected".
4. As Employee, see no connection page. `curl -b jar -X POST localhost:4000/wa/qr` with the Employee cookie returns 403.
5. Set `WHATSAPP_PROVIDER=baileys` in `.env`, restart, and run the WA-27 steps with the test phone.
6. Start a second worker while the first runs. It prints its standby line, and the phone's Linked devices list shows one session only. Stop the first worker and see the second take over.

## Proposed changes

Changes to the plan's defaults or to earlier specs, for the user to accept at review.

| Default | Proposal | Trade-off |
| --- | --- | --- |
| FND Decision 41: CORS and the socket origin check to be decided in WA | No CORS middleware. In dev the Vite proxy forwards `/auth`, `/wa` and `/socket.io` (with WebSocket upgrade) to the api, so the browser sees one origin. In production a reverse proxy does the same. `ALLOWED_ORIGINS` drives WA-21 and WA-22. | A web app on another origin cannot call the api. None is planned. |
| `apps/web` is the BOOT placeholder (`src/dev.ts`) | Vite + React 19 with no router and no UI library. `pnpm dev` runs Vite, so BOOT-16's web startup line becomes Vite's own. | BOOT-16 (manual) is re-checked with Vite. |
| Dev plan: build the provider interface and Fake before auth, and Baileys after MSG | WA is built in one go, before MSG, connection only. MSG then extends the interface and both adapters. | MSG touches the adapters again, but each module is finished on its own. |
| `WhatsAppSession` has a unique, non-null `number` and one encrypted column (FND) | Add `provider` and `updatedAt`, make `number` nullable, and add a keys table (Contracts touched). | One more migration and table. Writing a single growing blob on every key update would be simpler but risks lost updates. |
| Data-flow plan: QR loop and auto-retry after logout | QR expiry and phone logout both stop in `reconnect_required` and wait for "Get new QR". | One click for the admin instead of an endless QR loop no one scans. |

## Decisions

Taken with the user on 2026-11-25, while drafting:

1. Connection only. The provider interface in WA has connect, logout, close and the connection events. MSG adds `sendText`, `onMessage` and `onStatus`, and implements them in the Fake and Baileys adapters.
2. `WHATSAPP_PROVIDER` defaults to `fake` (as in the architecture). Every `wa.state` carries the provider name, and the UI shows "Simulated" whenever it is `fake`. The phone demo sets `baileys` in `.env`.
3. Web stack: Vite + React, no router, `qrcode` to draw the QR in the browser. Two views chosen by `/auth/me` and the role. INB adds a router when it needs one.
4. WA writes its own audit rows (WA-20): the worker for connect, disconnect and logout, the api for "QR requested" and "logout requested". This differs from logins, whose rows are AUD's (FND Decision 5), because the final demo needs the WhatsApp rows and the worker owns those transitions.

Proposed in this draft, to be accepted at review:

5. CORS and origin: as under Proposed changes. This closes FND Decision 41.
6. Package pins, exact, checked on npm on 2026-11-25: `baileys` 7.0.0-rc14 (MIT; npm `latest`; `legacy` is 6.7.24; the `@whiskeysockets/baileys` name has the same tags), `react` and `react-dom` 19.3.1, `vite` 8.3.8, `qrcode` 1.5.4, `socket.io-client` 4.8.4 (already used by the api tests). The Vite React plugin and `@types/*` versions are fixed at install time and recorded here.
7. Encrypted value format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. The additional authenticated data is the provider plus, for keys, the type and key id. The crypto code lives in `apps/worker`, not `packages/shared`, because shared is also bundled for the browser and only the worker holds the key.
8. Lock defaults: TTL 30 s, heartbeat every 10 s, standby retries every 5 s. Takeover after a crash takes at most about 35 s. A worker that cannot confirm its lock closes WhatsApp first (WA-04), so two live sessions never overlap by more than one heartbeat.
9. Worker liveness for the banner comes from the `wa:state` key's TTL, not from a separate heartbeat event.
10. Web tests in WA are pure functions only (`bannerText(state)`, `viewFor(role)`). No DOM testing library is added. The pages are checked by hand (WA-23, WA-24).
11. A missing `Origin` header passes the origin checks, because non-browser clients (the test client, `curl`) send none, and every browser sends one on a WebSocket handshake and on a cross-origin POST.

Made during WA phase 1 (2026-11-25), within the approved build:

12. Installed, exact: `baileys` 7.0.0-rc14 and `ioredis` 6.1.0 (worker); `react` and `react-dom` 19.3.1, `qrcode` 1.5.4, `socket.io-client` 4.8.4 (web); dev: `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0, `@types/react` 19.3.3, `@types/react-dom` 19.3.0, `@types/qrcode` 1.5.6.
13. Baileys' `AuthenticationState` is `creds` plus a key store with `get(type, ids)` and `set({ [type]: { [id]: value | null } })`, where `null` deletes. That matches the keys table. Baileys saves credentials during pairing, before the connection opens, which is why `number` is nullable. The adapter turns values into strings with Baileys' `BufferJSON`, so `ProviderAuthStore` deals only in opaque strings and the store stays provider-neutral.
14. The provider reports two close reasons beyond the spec's list: `restart` (Baileys closes with 515 right after a QR scan and expects an immediate reconnect) and `replaced` (440, another client took the credentials). The worker reconnects at once on `restart`, and stops in `reconnect_required` with reason `other` on `replaced`, so it never fights the other client. Baileys uses 408 for both a lost connection and an expired QR; the adapter calls it `qr_timeout` only when it showed a QR on that connection and never opened.
15. `WaState.provider` is nullable: the api sends `null` with `worker_offline`, because with no worker it cannot know which provider is set.
16. The `wa-session` migration (`20261125162103_wa-session`) was generated with `prisma migrate diff --from-config-datasource --to-schema` against `crm_dev`, because `migrate dev --create-only` refuses to run without a terminal when it has a warning (the new unique index on `provider`). The SQL was reviewed: it adds columns and a table, drops nothing, and `crm_dev` had no session rows.
17. FND-04's test title said "the six tables". It now reads "every table", and the db tests' table list includes `whatsapp_session_keys`. The FND-04 criterion text is unchanged and still holds.
18. The FND socket test's `probe` event is not a typed server event. The test sends it through one small untyped helper.

Made during WA phase 2 (2026-11-25), within the approved build:

19. Worker layout (`apps/worker/src/`): `crypto.ts` (WA-06), `session-store.ts` (`createSessionStore`, `SessionUnreadable`), `lock.ts` (Lua refresh and release with an owner check; the refresh also extends `wa:state`), `backoff.ts` (`reconnectDelay`), `connection.ts` (`startWaWorker`, the manager), `providers/fake/fake.ts`, `providers/baileys/index.ts`, `providers/index.ts` (`createProvider`, which loads Baileys only when selected), `redis.ts`. The Baileys adapter was written in this phase, not phase 5, because WA-01 needs `createProvider('baileys')`. Phase 5 keeps the pin test and the phone check.
20. Timings come from `WA_LOCK_TTL_MS` alone: the heartbeat every TTL / 3, the standby retry every TTL / 6. With the default 30 s, a takeover after a crash takes at most about 35 s (Decision 8).
21. The manager runs provider events, commands and reconnects through one in-order queue. Every connect and every deliberate end bumps a generation number, and an event from an older connection is ignored. Losing the lock first stops publishing, then closes the provider.
22. On shutdown the worker deletes `wa:state` and `wa:qr` and publishes `disconnected` with reason `worker_offline`, so the banner changes at once instead of after the state key's TTL.
23. Close mapping in the manager: `network` gives `disconnected` and a backoff reconnect; a failed connect also counts as `network`. `restart` reconnects at once. `logged_out` clears the session (WA-12). `qr_timeout` stops (WA-13). `replaced` stops with reason `other`. A `wa.disconnected` audit row is written only when the connection had been `connected`.
24. The Fake's `pnpm dev` auto-pair delay is 5 s (`FAKE_AUTO_PAIR_MS`), and its number is the fictional `+12025550100`.
25. Worker tests use Redis **db 2** and `crm_test` (`apps/worker/src/test-support.ts`), a vitest `globalSetup` that migrates `crm_test`, and `fileParallelism: false`. The lock tests WA-03 and WA-05 spawn real `main.ts` processes; the others run the manager in-process with short timings (TTL 600 ms, backoff 50 to 200 ms). FND-02's spawned worker moved to Redis db 2 as well, because the worker now takes the lock at startup.
26. `tsconfig.base.json` now has `erasableSyntaxOnly`: Node's type stripping rejected a constructor parameter property at runtime, which typecheck had passed. Typecheck now catches such syntax.
27. The root `pnpm test` runs package tests one package at a time (`pnpm -r --workspace-concurrency=1 test`). With the worker tests spawning processes beside the api tests, FND-03's 2 s health check timed out once (the open item in CLAUDE.md). The packages also share `crm_test`.
28. The FND-05 raw-SQL tests now truncate after themselves. Vitest orders files by cached duration, so when `schema.test.ts` ran after `seed.test.ts`, its user with the password hash `x` reached the api tests and failed FND-18. This was an FND isolation gap, found by the new order.

Made during WA phase 3 (2026-11-25), within the approved build:

29. Api layout: `origin.ts` (`originAllowed`, `originGuard`), `events.ts` (`startEventRelay`), `wa.ts` (`waRouter`, `readWaState`, `readWaQr`). `AuthConfig` gains `allowedOrigins`, normalised to bare origins (`new URL(o).origin`), so a trailing slash in `ALLOWED_ORIGINS` still matches the browser's `Origin` header.
30. The origin guard runs before the body parser and every router. GET and HEAD always pass; any other method with a foreign `Origin` gets 403 `forbidden_origin`, including OPTIONS. The socket check is Socket.io's `allowRequest`, so a foreign handshake never reaches the session lookup.
31. `POST /wa/qr` and `POST /wa/logout` read `wa:state`, answer 409 `invalid_state` unless it is `reconnect_required` (qr) or `connected` (logout), write the audit row (`meta: { provider }`, actor, `req.ip`), then publish the `WaCommand`. A missing state key counts as `worker_offline` and gives 409. Only accepted requests are audited.
32. On connect, each socket gets `wa.state` from `wa:state` (or `worker_offline`). A socket in `admin` also gets `wa:qr`, but only while the state is `qr_required`, so a stale QR is never shown.
33. The relay drops a bad event and logs `api: dropped event (<error name>)`, never the content.
34. Api test support starts the relay for every `testApp`, on its own Redis connection. The promise gets a no-op handler, so a test file that closes before the subscription finishes does not raise an unhandled rejection. BOOT-08's own `pnpm -r test` run now also uses `--workspace-concurrency=1` (Decision 27); in parallel the api and worker suites overlapped and exposed that rejection.
35. The WA-15 and WA-21 tests were checked against mutations: sending `wa.qr` to `global`, and allowing every origin. Each made its test fail.

Made during WA phase 4 (2026-11-25), within the approved build:

36. Web layout (`apps/web/`): `index.html`, `vite.config.ts` (port 5173, `strictPort`, proxy for `/auth`, `/wa`, `/health` and `/socket.io` with `ws`), `src/main.tsx`, `src/App.tsx` (session check, then login or the role's view), `src/pages.tsx` (`LoginPage`, `ConnectionPage`, `HomePage`, `Banner`), `src/useWhatsApp.ts` (socket hook; validates `wa.state` and `wa.qr` with the shared schemas and drops the QR when the state leaves `qr_required`), `src/api.ts`, `src/view.ts` (pure rules), `src/styles.css`. The tsconfig adds `jsx: react-jsx` and the `vite/client` types (TypeScript 6 checks side-effect CSS imports). `src/dev.ts` is deleted; `pnpm dev` runs `vite`.
37. Pure parts of WA-23 and WA-24 are unit tested too (`viewFor`, `loginErrorText`, `actionErrorText`); the pages themselves stay manual (`it.todo … (manual)`).
38. Browser check on 2026-11-25 with `pnpm dev` (Fake, `crm_dev`), driven through Playwright: a wrong password showed the generic message; the Employee saw the home page and the banner "Simulated · WhatsApp is connected."; logout returned to the login page; the Super Admin landed on the connection page; "Log out WhatsApp" gave `reconnect_required` (logged out by the Super Admin) with "Get new QR"; that showed the simulated QR, which paired itself after 5 s and returned to `connected`. With `curl`, the Employee got 403 `forbidden` on `POST /wa/qr`, and 403 `forbidden_origin` with a foreign `Origin`. A second dev worker printed the standby line. This covers manual check steps 1 to 4 and 6; step 5 (the phone) is WA-27.

Made during WA phase 5 (2026-11-25), within the approved build:

39. WA-26 is a repo-level test (`tests/whatsapp/baileys.test.ts`): the worker declares `baileys` exactly `7.0.0-rc14` and no other package declares any Baileys name; the lockfile resolves that version; no source file outside the adapter folder imports a Baileys package (a second check besides BOOT-06's lint rule); the adapter's class `implements WhatsAppProvider` and loads. This also covers BOOT's suggested "exact Baileys version pin" check for Baileys.
40. The Baileys adapter has not run against WhatsApp yet. It typechecks against Baileys' own types and loads, and the close-code mapping follows `DisconnectReason`. WA-27 is its first real test; if it shows a wrong mapping, the fix is in the adapter only.

## Build phases

Proposed, the same routine as FND: at the end of each phase run the gate (typecheck, lint, test, traceability, format:check), update CLAUDE.md and the docs, make one local commit, and stop for the user's "next".

1. Approve the spec. Install the pinned packages. Check Baileys' auth-state types and confirm the keys table. Write the contracts, the `wa-session` migration, and an `it.todo` for every WA criterion.
2. Worker: encryption, session store, lock, connection manager on the Fake, backoff, commands, worker audit rows (WA-01 to WA-14, and the worker part of WA-20).
3. Api: event relay, state on connect, `/wa` routes, origin checks, api audit rows (WA-15 to WA-22).
4. Web: Vite + React, login page, connection page, banner (WA-23 to WA-25).
5. Baileys adapter, the pin test, the manual check with the test phone (WA-26, WA-27). Close WA.

## Open points for review

- Is a lock TTL of 30 s right? A shorter TTL means faster takeover but more Redis writes and more risk of a false takeover during a pause.
- Baileys 7 is still a release candidate on npm (`7.0.0-rc14`, last published 2026-07-29). The alternative is `legacy` 6.7.24. I recommend the RC, because it is what npm serves as `latest`, and to note the risk in the DOC risk write-up.
- Should "Get new QR" also be allowed in `disconnected` (while the worker is retrying), so an admin can force a fresh pairing? As drafted it is not.
