# How the application works (state on 2026-11-26)

A reference for the backend and WhatsApp work done so far, written before the focus moves to the UI, dummy flows and dummy data for the prototype. It describes what is **built and committed** (last code commit `f205b0b`, MSG phase 5). For the detail behind any line, follow the spec and decision numbers into `docs/specs/`.

## 1. What the product is

A web CRM for one real-estate company. The whole sales team works every customer enquiry through the company's single WhatsApp number, from one shared inbox.

- Users: 1 Super Admin, Managers, up to 10 Employees.
- Flow: customer messages the number → shared inbox → manager assigns to an employee → employee replies in the CRM → the customer sees a normal WhatsApp message.
- Planned modules: users, WhatsApp connection, inbox, leads (7 stages, New to Converted or Lost), properties, follow-ups, safe campaigns, reports, audit log.
- It is a prototype for MK Agency's developer assessment (2026-11-25 to 11-27), with a test WhatsApp number and test contacts only. **Anything simulated is labelled "Simulated" in the UI.**

## 2. Processes and packages

```
 browser (React, :5173)
   │  HTTP + Socket.io, same origin through the Vite proxy
   ▼
 apps/api (Express + Socket.io, :4000) ──── Postgres (:5433, crm_dev)
   │  Redis pub/sub + BullMQ                    ▲
   ▼                                            │
 apps/worker (WhatsApp connection) ─────────────┘
   │  provider interface
   ▼
 Fake provider (simulated)  or  Baileys (the real test number)
```

| Package | Name | Job |
| --- | --- | --- |
| `apps/web` | `@crm/web` | Vite + React 19 UI, no router. Talks to the api only. |
| `apps/api` | `@crm/api` | HTTP routes, login sessions, permission checks, Socket.io push. |
| `apps/worker` | `@crm/worker` | Holds the one WhatsApp session, stores inbound messages, sends queued messages, reports ticks. |
| `packages/shared` | `@crm/shared` | Zod schemas and types: the single source of truth for every data shape. |
| `packages/db` | `@crm/db` | Prisma schema, migrations, seed, and the row-to-view mappers (`src/views.ts`). |

Rules that hold everywhere:
- The api and the worker never call each other. They talk only through Redis (pub/sub channels, BullMQ) and Postgres.
- Postgres is always written first; then a job is queued or an event published; then the browsers get the push.
- Only the worker imports Baileys, and only inside `apps/worker/src/providers/baileys/`. `apps/web` never imports `@crm/db`.
- Allowed dependencies: web→shared; api→shared,db; worker→shared,db; db→shared.

## 3. Running it

From the repo root (Docker must be running):

```sh
docker compose up -d --wait   # Postgres 16 on 5433, Redis 7 on 6379
pnpm install
cp .env.example .env          # fill SESSION_SECRET and SESSION_ENCRYPTION_KEY (openssl rand -hex 32)
pnpm migrate && pnpm seed
pnpm dev                      # web http://localhost:5173, api :4000
```

- `pnpm dev` uses the **Fake** provider: it "connects" by itself after a moment, the banner shows a **Simulated** tag, and it never touches the real WhatsApp session. **Use this for UI work.**
- `WHATSAPP_PROVIDER=baileys pnpm dev` uses the real test number (scan the QR once; later restarts reconnect without a QR). Keep the Mac awake: sleep lets the 30 s WhatsApp lock expire and forces a reconnect.
- Seeded logins (password `crm-dev-password` unless `SEED_PASSWORD` is set):

| Email | Role | Lands on |
| --- | --- | --- |
| `superadmin@crm.test` | Super Admin | Connection tab (+ Messages tab) |
| `manager@crm.test` | Manager | Messages tab |
| `employee@crm.test` | Employee | Home placeholder (no inbox yet; INB adds it) |

- Seeded contacts: `+12025550101` "Test Contact 1", `+12025550102` "Test Contact 2" (fictional 555-01xx numbers). No conversations or messages are seeded.
- Checks: `pnpm test` (230 pass, 7 `it.todo`), `pnpm typecheck`, `pnpm lint`, `pnpm traceability`, `pnpm format:check`.

## 4. Roles and permissions

Checked on the server only (route guard `access(level)` in `apps/api/src/access.ts`, and socket rooms). Hiding something in React is never the security. The map is `PERMISSION_MAP` in `packages/shared/src/auth.ts`.

| Permission | Super Admin | Manager | Employee |
| --- | :-: | :-: | :-: |
| `auth.session` (logout, me) | ✓ | ✓ | ✓ |
| `users.manage` | ✓ | ✓ | |
| `wa.manage` (QR, WhatsApp logout) | ✓ | | |
| `inbox.read` | ✓ | ✓ | (INB) |
| `messages.send` | ✓ | ✓ | (INB, assignee only) |

Every route is either `public` or needs one permission. 401 `unauthenticated` without a valid session, 403 `forbidden` without the permission.

## 5. Login and sessions (FND)

- `POST /auth/login` `{ email, password }` → `SessionUser { id, name, role }` and a signed httpOnly cookie `crm_sid`. The session lives in Redis (`sess:<id>`, 12 h).
- Every failure is the same 401 `invalid_credentials`; after 5 failures per email in 15 min, 429 `too_many_attempts`.
- `GET /auth/me` → `SessionUser`. `POST /auth/logout` → 204, and that session's sockets are disconnected.
- Sockets authenticate with the same cookie. The server puts each socket in its rooms; a client can never pick a room:
  - `global` (everyone), `admin` (Super Admin), `inbox:all` (Super Admin, Manager), `user:<id>` (personal).
- Socket handshakes and non-GET requests from an origin outside `ALLOWED_ORIGINS` are refused. No CORS: the web app reaches the api through the Vite proxy.

## 6. WhatsApp connection (WA)

- **One live session only.** The worker takes the Redis lock `wa:lock` (30 s TTL, refreshed every 10 s with an owner check) before it connects. A second worker waits as standby. If the lock is lost, the worker closes WhatsApp at once.
- **States** (`wa:state` in Redis, pushed as `wa.state` to `global`):
  `connecting` → `qr_required` → `connected`. A network drop gives `disconnected` and a backoff reconnect (1 s doubling to 60 s, ±20 %). A logout from the phone, an expired QR, an admin logout or an unreadable session stop in `reconnect_required` until the Super Admin clicks "Get new QR". No `wa:state` key means the worker is offline (`worker_offline`).
- **QR**: `wa:qr` (60 s), pushed as `wa.qr` to `admin` only.
- **Session storage**: credentials and keys encrypted with AES-256-GCM (`SESSION_ENCRYPTION_KEY`) in `whatsapp_sessions` and `whatsapp_session_keys`, one session per provider.
- **Routes** (Super Admin, `wa.manage`): `POST /wa/qr` (new QR, 202 or 409 in the wrong state), `POST /wa/logout` (needs a confirmation click in the UI). The api sends these as commands on the Redis channel `wa:commands:<db>`; only the lock holder acts.
- **Proven on the real phone (WA-27):** QR scan, restart without QR, network drop and recovery, unlink from the phone and re-pair.

## 7. Messaging (MSG, text only)

### Incoming message
Customer phone → WhatsApp → provider adapter → worker → one Postgres transaction → `message.created` + `conversation.updated` published → api pushes to `inbox:all`.

- The adapter skips groups, broadcasts, status updates and channels, drops reactions and protocol messages, and resolves a LID to a phone number (or skips it).
- The worker upserts the contact and the conversation, inserts the message (the provider message ID is unique, so a duplicate stops quietly) and moves `lastMessageAt` forward only.
- Media is stored as `type: 'unsupported'` with its kind; the UI shows "Unsupported message (image)" and so on.
- A message typed on the company phone itself is stored as outbound with `sender: null`; the UI shows "Sent from phone".

### Outgoing message
Browser → `POST /conversations/:id/messages` → message saved as `queued` and pushed → BullMQ job `outbound-message` (job ID = message ID) → worker sends through the provider → saves the provider ID and `sent` → publishes `message.status` → api pushes the tick.

- 3 attempts, exponential backoff from 2 s, then `failed` with a reason (`wa_not_connected`, `provider_error`, `reported_failed`).
- The worker only sends while it is connected and holds the lock, one job at a time, in order.
- A repeated `clientId` returns the existing message (no double send from a double click).

### Status ticks
Forward only (`nextStatus` in `packages/shared/src/messages.ts`): `queued` → `sent` → `delivered` → `read`; `failed` only from `queued` or `sent`. Late, repeated or out-of-order receipts are ignored. **Only what WhatsApp reported is ever shown; ticks are never faked.**

### Routes

| Route | Permission | Returns |
| --- | --- | --- |
| `GET /conversations` | `inbox.read` | `{ conversations: ConversationSummary[] }`, up to 200, newest `lastMessageAt` first |
| `GET /conversations/:id/messages` | `inbox.read` | `{ messages: MessageView[] }`, the last 100, oldest first; 404 `not_found` |
| `POST /conversations/:id/messages` | `messages.send` | Body `{ text (1–4096, trimmed), clientId? }`. 202 + `MessageView` (`queued`); 200 for a repeated `clientId`; 400 `invalid_request`; 404; 503 `wa_not_connected` (nothing stored); 503 `queue_unavailable` (stored as `failed`) |

### Live events (Socket.io)

| Event | Payload | Room |
| --- | --- | --- |
| `wa.state` | `WaState` | `global` |
| `wa.qr` | `WaQr` | `admin` |
| `message.created` | `MessageView` | `inbox:all` |
| `message.status` | `MessageStatusUpdate` | `inbox:all` |
| `conversation.updated` | `ConversationSummary` | `inbox:all` |

The worker publishes these on the Redis channel `crm:events:<db>`; the api validates each one with the `CrmEvent` schema and drops anything invalid.

## 8. Data shapes the UI uses

All in `packages/shared/src/` (`auth.ts`, `messages.ts`, `wa.ts`). Use these for dummy data too, so the UI keeps matching the api.

```ts
SessionUser         { id, name, role: 'SUPER_ADMIN' | 'MANAGER' | 'EMPLOYEE' }

ConversationSummary { v: 1, id, contact: { id, phone, name | null },
                      lastMessageAt: ISO | null, lastMessage: MessageView | null }

MessageView         { v: 1, id, conversationId,
                      direction: 'inbound' | 'outbound',
                      type: 'text' | 'unsupported',
                      body: string | null, unsupportedKind: string | null,
                      status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null,  // null for inbound
                      failureReason: 'wa_not_connected' | 'provider_error' | 'reported_failed' | null,
                      sender: { id, name } | null,   // null + outbound = "Sent from phone"
                      at: ISO }

MessageStatusUpdate { v: 1, messageId, conversationId, status, failureReason, at }

WaState             { v: 1, state: 'connecting' | 'qr_required' | 'connected' | 'disconnected' | 'reconnect_required',
                      provider: 'fake' | 'baileys' | null,   // null only when the worker is offline
                      reason?: WaReason, at }

WaQr                { v: 1, qr: string, at: ISO }
```

## 9. Database (Postgres, Prisma)

Tables built so far: `users`, `contacts` (with `is_test`), `conversations`, `messages`, `whatsapp_sessions`, `whatsapp_session_keys`, `audit_logs`. Migrations: `init`, `wa-session`, `msg-core`. Ids are UUIDs, columns snake_case.

Not built yet: leads and lead history, assignments, notes, properties and media, follow-ups, campaigns and recipients, unread counts.

## 10. Web app today

- Files: `App.tsx`, `pages.tsx` (login, connection, home), `messages-page.tsx`, `useMessages.ts`, `useWhatsApp.ts`, `messages-view.ts`, `view.ts` (`tabsFor`, banner text), `api.ts` (fetch calls), `styles.css`.
- Tabs by role (`tabsFor`): Super Admin → Connection, Messages; Manager → Messages; Employee → Home.
- The banner always shows the WhatsApp state; with the Fake provider it carries a **Simulated** tag.
- The Messages tab lists conversations, shows the thread, sends text, and updates live from socket events.

## 11. Notes for the UI / dummy-data phase

- **Run with plain `pnpm dev`** (Fake provider). It is labelled Simulated and leaves the real session alone.
- **No messages arrive by themselves with the Fake.** `FakeProvider.receive()` (and `report()`, `failSends()`, `delaySends()`) in `apps/worker/src/providers/fake/fake.ts` exist for tests only; nothing in the dev UI or api triggers them. Dummy inbound traffic needs either a new simulated-only hook or seeded rows.
- **Dummy data rules** (from the hard rules): use fictional test numbers only (`+1202555 01xx`, or `+1999…` as the tests do), mark contacts `is_test`, and label anything simulated as Simulated in the UI. Never show faked delivered/read ticks for real messages.
- **Keep shapes from `@crm/shared`.** Dummy screens for modules that have no api yet (leads, properties, follow-ups, campaigns, reports, audit) should still type their data with Zod schemas in `packages/shared`, so the later real api fits without rework.
- **Server rules still apply.** The reply lock must be enforced at the send endpoint (INB), and role checks stay on the server even when the UI hides a button.

## 11b. Demo mode (Spec 4, DEMO)

- `pnpm --filter @crm/web dev:demo` (port 5174) runs the whole CRM in the browser on dummy "Skyline Realty" data. No api, worker, Docker or phone. Logins: `<first name>@skyline.test` / `demo1234`. README "Demo mode" has the accounts and the 7-step walk-through.
- `apps/web/src/main.tsx` picks the demo (`vite --mode demo` or `VITE_DEMO=1`, `mode.ts`) or the live app. Live mode is unchanged.
- `apps/web/src/demo/`: `seed.ts` (dataset, times relative to now), `store.ts` (Zod-checked `localStorage`, raw-text cache, `sync()`), `api.ts` (one async function per future route; checks session, role, Employee scope, reply lock), `engine.ts` (state changes shared with the simulator), `sim.ts` (stored tasks: QR refresh, reconnect, ticks, agent replies, campaign steps, auto enquiries; run by every tab), `bus.ts` (real socket event names plus drafts, `BroadcastChannel` to other tabs), and one file per screen.
- Shapes: the MSG schemas plus the draft contracts in `packages/shared/src/crm.ts` (leads, properties, follow-ups, campaigns, users, audit, inbox extras). The real INB, LEAD, PROP, FUP, CAMP, USR, RPT and AUD specs start from these and from the demo api's function list.
- Placeholders until the real specs: lead stage names, the 60 s reply lock with Manager take-over, chats closing without closing their lead.



- **MSG-28** (real-phone message check) and **MSG-24** (browser check) are not yet ticked. To finish: run `WHATSAPP_PROVIDER=baileys pnpm dev`, log in as `manager@crm.test`, message the number from the test phone, reply from the CRM and watch the ticks, type on the company phone ("Sent from phone"), send a photo ("Unsupported message (image)"), then restart with a queued message.
- Next spec after MSG is **INB** (assignment, reply lock, Employee scope and assignee rooms, unread counts, paging). Then LEAD (lead auto-created on inbound), PROP, FUP, CMP, RPT, AUD, USR.
- Undecided (take from the LEAD and INB specs, do not invent): the 7 lead stage names, reply-lock timeout and Manager override, whether closing a chat closes its lead.
- Known limitations: an inbound message is lost if Postgres is down when it arrives; a crash between WhatsApp accepting a send and saving `sent` can send twice; a job running when a worker is killed waits up to 30 s for BullMQ's stalled check.
- `baileys` is pinned to `7.0.0-rc14`; the fallback is `6.7.24`.
- Git: local commits only. `node_modules/` is in the first commit; squash before any push.

## Where to look next

| Need | File |
| --- | --- |
| Every route, event, queue, Redis key | `docs/data-flow/README.md` |
| WhatsApp criteria and decisions | `docs/specs/002-whatsapp.md` |
| Messaging criteria and decisions | `docs/specs/003-messaging.md` |
| Module list and the 7-step final demo | `docs/plan/project-summary.md` |
| Build order and phases | `docs/plan/development-plan.md` |
| Session-by-session record | `docs/history/` |
