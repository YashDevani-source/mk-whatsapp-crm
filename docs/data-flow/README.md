# Data flow: what each route, event and job delivers

Status: **planned, partly built.** The routes in code are `GET /health` (FND phase 2), `/auth/login`, `/auth/logout`, `/auth/me` (FND phase 4), `POST /wa/qr`, `POST /wa/logout` (WA phase 3), and `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages` (MSG phase 3). The live events `wa.state`, `wa.qr`, `message.created`, `message.status` and `conversation.updated` are built, and so is the `outbound-message` queue (MSG phase 4). Every route goes through the `access(level)` guard (`apps/api/src/access.ts`): 401 `unauthenticated` without a valid session, 403 `forbidden` without the permission. The Socket.io server (`apps/api/src/sockets.ts`, FND phase 5) authenticates the handshake with the same cookie and puts each socket in its rooms; no room event and no queue exists yet. Spec 0 built the skeleton, and FND (built) has fixed the paths of its own routes, marked below. This file turns `docs/plan/data-flow-plan.md` (the source) into a lookup of who calls what and what comes back. It is filled in with real paths when each module's spec is written.

Rule for every flow: validate, write to Postgres, then enqueue or publish, then push to the right browsers. Postgres is always written first.

## HTTP routes (planned)

Paths are not decided yet, except FND's. Each row says what the route does and which spec will name its path. Every route declares `public` or a permission, and a test (FND-13) fails if one has neither.

| Route (path decided in spec)  | Who may call it                              | Delivers                                                                                 | Spec |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| Login / logout / current user: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (**built**, FND phase 4: `apps/api/src/auth.ts`) | `public` (login) / `auth.session` (logout, me) | Login: `SessionUser` `{id, name, role}` and the signed httpOnly `crm_sid` cookie; session in Redis `sess:<id>` plus `user-sess:<userId>`. 401 `invalid_credentials` (same for every failure), 429 `too_many_attempts` after `LOGIN_MAX_ATTEMPTS` failures per email (`login-fail:<email>`). Logout: 204, session deleted, and the sockets opened with that session disconnected (FND-20). Me: `SessionUser`. The audit entry (also for failed login) is written by AUD, not FND (FND Decision 5). | FND, AUD |
| Health: `GET /health` (**built**, FND phase 2: `apps/api/src/health.ts`) | `public` (FND-13 guard, phase 4) | `api`, `postgres`, `redis` each `ok` or `down` (`HealthResponse`); 200 if all ok, 503 if any is down. Postgres `SELECT 1` and Redis `PING` run in parallel, 2 s limit each. | FND |
| Conversations: `GET /conversations` (**built**, MSG: `apps/api/src/messages.ts`) | `inbox.read` (Super Admin, Manager; Employees from INB) | `ConversationList`: up to 200 conversations, newest `lastMessageAt` first, each with the contact (phone, name) and the last message as a preview. | MSG, INB |
| Messages: `GET /conversations/:id/messages` (**built**, MSG) | `inbox.read` | `MessageList`: the last 100 messages, oldest first by `at`. 404 `not_found` for an unknown or malformed id. | MSG |
| Send message: `POST /conversations/:id/messages` (**built**, MSG) | `messages.send` (Super Admin, Manager; INB adds the assignee) | Body `SendMessageRequest` `{ text (1 to 4096, trimmed), clientId? }`. 202 + `MessageView` (`queued`); the message is written first, then `message.created` and `conversation.updated` are pushed, then the `outbound-message` job (job id = message id) is added. 200 + the existing message for a repeated `clientId`. 400 `invalid_request`, 404 `not_found`, 503 `wa_not_connected` (nothing stored), 503 `queue_unavailable` (message marked `failed`). INB adds 409 when someone else holds the reply lock. | MSG, INB |
| Take / refresh reply lock     | Anyone allowed to reply in that chat         | Redis lock for the conversation with a short TTL; `conversation.lock` pushed             | INB  |
| Assign / reassign conversation | Manager, Super Admin                        | New assignee on the conversation and its open lead; LeadHistory and audit rows; `conversation.updated` pushed | INB  |
| Update lead (fields, stage)   | Lead owner, Manager, Super Admin             | Updated lead; a LeadHistory row (old value, new value, user, time) and audit entry for stage changes; `lead.updated` pushed | LEAD |
| Upload property media         | Staff with property permission               | Content type checked from file bytes plus a size limit; Media row saved; served only by short-lived signed URL | PROP |
| Share property into a chat    | Same checks as send message                  | Media message saved as `queued`, job added                                               | PROP |
| Create / edit follow-up       | Lead owner, Manager, Super Admin             | FollowUp row and a delayed job (editing the due time replaces the job)                   | FUP  |
| Upload CSV, build segment, preview | Super Admin, Manager                    | Per-row validation and error report; preview with count, sample, excluded opt-outs, test-only status. Nothing is queued yet. | CMP  |
| Confirm campaign              | Super Admin, Manager                         | CampaignRecipient rows (unique campaign + contact), jobs queued at a controlled rate     | CMP  |
| Pause / resume campaign       | Super Admin, Manager                         | Campaign status changed; the worker checks it before each send; audit entry              | CMP  |
| Reports and CSV export        | Employees see own figures; Managers and Super Admin see all | Aggregate tables scoped by role; export streams rows                      | RPT  |
| WhatsApp connection (**built**, WA: `apps/api/src/wa.ts`): `POST /wa/qr`, `POST /wa/logout` | `wa.manage` (Super Admin) | 202 and a `WaCommand` on Redis `wa:commands:<db>` for the worker, after an audit row (`wa.qr_requested` / `wa.logout_requested`, actor and IP). 409 `invalid_state` unless the worker's `wa:state` is `reconnect_required` (qr) or `connected` (logout); a missing state key is `worker_offline`. The QR and the state themselves arrive over the `admin` and `global` rooms, not through a route. Any non-GET request from an origin outside `ALLOWED_ORIGINS` gets 403 `forbidden_origin` first (WA-22). | WA |

## Live events (Redis pub/sub, then Socket.io)

| Event                     | Published by                  | Delivered to                              |
| ------------------------- | ----------------------------- | ----------------------------------------- |
| `message.created` (**built**, `MessageView`) | worker (inbound and "Sent from phone"), API (CRM sends) | `inbox:all` only until INB adds `user:<assignee>` |
| `message.status` (**built**, `MessageStatusUpdate`) | worker (sent, provider reports, failures); API (queue failure) | `inbox:all` only until INB |
| `conversation.updated` (**built**, `ConversationSummary`) | API, worker | `inbox:all` only until INB adds old and new assignee |
| `conversation.lock`       | API                           | `inbox:all`, `user:<assignee>`            |
| `lead.created` / `lead.updated` | worker, API             | `inbox:all`, `user:<owner>`               |
| `followup.due`            | worker                        | `user:<owner>`                            |
| `campaign.progress`       | worker                        | `admin`, Managers                         |
| `wa.state` (**built**, `WaState`) | worker (`apps/worker/src/connection.ts`) | `global`; also sent to each socket on connect, from Redis `wa:state` (or `worker_offline`) |
| `wa.qr` (**built**, `WaQr`)       | worker                        | `admin` only; also sent on connect to a Super Admin socket while the state is `qr_required`, from Redis `wa:qr` |

Rooms are joined only by the server, and only after a valid session (**built**, FND phase 5: `apps/api/src/sockets.ts`). The handshake reads the `crm_sid` cookie; without a valid session the connection is refused with `unauthenticated`. Rooms are assigned on connect from the role (`roomsFor`); a client join request is ignored. Every incoming socket event re-checks the session and the user first: a logged-out, expired or deactivated session is disconnected. Logout disconnects that session's sockets; deactivation ends all the user's sessions and disconnects all their sockets on their next request or socket event.

| Room         | Members                  | Receives                                   |
| ------------ | ------------------------ | ------------------------------------------ |
| `inbox:all`  | Super Admin, Managers    | Every conversation event                   |
| `user:<id>`  | That user                | Events for chats and leads assigned to them |
| `admin`      | Super Admin              | QR codes, connection alerts                |
| `global`     | Everyone logged in       | WhatsApp connection state banner           |

Events travel on the Redis channel `crm:events:<db>` as a `CrmEvent` envelope, where `<db>` is the Redis database in `REDIS_URL` (Redis pub/sub is shared by all databases, so the number keeps dev and the tests apart: WA-28). The api's relay (`apps/api/src/events.ts`) validates each one, and one function (`pushEvent` in `apps/api/src/sockets.ts`) chooses the rooms from the event type, for relayed events and the api's own pushes alike; an invalid event is dropped and logged by error name (WA-17). The socket handshake is refused for an `Origin` outside `ALLOWED_ORIGINS` (WA-21).

## WhatsApp connection (built, WA)

| Redis key or channel | Written by | Holds |
| --- | --- | --- |
| `wa:lock` | worker | The lock holder's worker id, TTL `WA_LOCK_TTL_MS` (30 s), refreshed every TTL/3 with an owner check. A standby retries every TTL/6. |
| `wa:state` | worker | The latest `WaState`, same TTL, refreshed with the lock. Gone means the worker is offline. |
| `wa:qr` | worker | The latest `WaQr`, 60 s TTL, deleted when the state leaves `qr_required`. |
| `crm:events:<db>` (channel) | worker | `wa.state`, `wa.qr`, and from MSG `message.created`, `message.status`, `conversation.updated`. |
| `wa:commands:<db>` (channel) | api | `new_qr`, `logout`. Only the lock holder acts, after checking its own state again. |

States: `connecting` → `qr_required` → `connected`; a network drop gives `disconnected` and a backoff reconnect (1 s doubling to 60 s, ±20 %); a phone logout, an expired QR, an admin logout or an unreadable session stop in `reconnect_required` until "Get new QR". The session (credentials and keys) is stored AES-256-GCM encrypted in `whatsapp_sessions` and `whatsapp_session_keys`, one session per provider.

## Queues (BullMQ)

| Queue               | Job ID                       | Retries          | Idempotency guard                              |
| ------------------- | ---------------------------- | ---------------- | ---------------------------------------------- |
| `outbound-message` (**built**, MSG: api `queue.ts`, worker `send.ts`) | message ID | 3, exponential from 2 s, then `failed` with a reason | Send only if the message is still `queued`; run only by the connected lock holder, one job at a time, inside the connection manager's in-order queue |
| `campaign-send`     | campaign ID + contact ID     | 3, exponential   | Unique recipient row plus a status check       |
| `followup-reminder` | follow-up ID (delayed)       | 3                | Unique reminder-sent record                    |
| `media-download`    | provider message ID          | 3                | Skip if the media is already stored            |

## The four main paths end to end

**Incoming message (built by MSG, without the lead and assignee parts):** customer phone, WhatsApp, Baileys adapter (skips groups, broadcasts, status and channels; resolves a LID to a phone or skips it; drops protocol messages and reactions; media becomes `unsupported`), worker (one transaction: upsert contact, upsert conversation, insert message with a unique provider message ID, forward-only `lastMessageAt`), then `message.created` and `conversation.updated` over Redis, then the API pushes to `inbox:all`. A duplicate provider ID stops the flow quietly. A message typed on the company phone is stored as outbound with no sender ("Sent from phone"). LEAD adds lead creation, INB the assignee room.

**Outgoing message (built by MSG, without the reply lock):** browser, send route (validate, permission, `clientId` repeat, connected check; INB adds the reply lock), message saved `queued` and pushed, job `outbound-message`, worker sends through the provider, saves the provider ID and `sent`, publishes `message.status`, API pushes the tick update.

**Status ticks (built, `nextStatus` in `packages/shared/src/messages.ts`):** only forward (`queued` → `sent` → `delivered` → `read`; `failed` from `queued` or `sent`). A late or out-of-order receipt is ignored, and an unknown provider ID is ignored and logged. Only what WhatsApp reported is ever shown.

**Campaign:** CSV, validate, segment, preview, confirm, recipient rows, queue at a controlled rate. Before every single send the worker checks for pause, opt-out, and test-only with a non-test contact; it then skips with a reason or sends.

## Who writes what

| Writer | Writes                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------- |
| API    | Users, assignments, lead changes, notes, outbound messages (`queued`), uploads, follow-ups, campaign setup, audit rows for these |
| Worker | Contacts, conversations and inbound messages (**built**), message status (**built**), unread count, auto-created leads, reminders sent, campaign recipient status, WhatsApp session (**built**), audit rows `wa.connected`, `wa.disconnected`, `wa.logged_out` (**built**) |

The worker and the API never call each other directly. They talk only through Redis and the database.

## Demo mode (built, DEMO): the same paths inside the browser

Demo mode (`apps/web/src/demo/`, `docs/specs/004-demo.md`) runs every path above without the api, worker, Postgres, Redis or WhatsApp:

| Real piece | Demo stand-in |
| --- | --- |
| HTTP routes | `api.ts`: one async function per future route, 150–400 ms simulated delay; it reads the session from `sessionStorage` and checks role, Employee scope and reply lock like a route would |
| Postgres | `store.ts`: one Zod-checked document in `localStorage` (`crm-demo-v1`); rows mapped to `@crm/shared` views by `views.ts` |
| Worker and BullMQ | `sim.ts` + `engine.ts`: scheduled tasks stored in the document (QR refresh, connect, reconnect, `sent`/`delivered`/`read` via `nextStatus`, a simulated agent's reply, one campaign send every ~2 s, an auto enquiry every ~45 s); every tab runs due tasks, each runs once |
| Redis pub/sub and Socket.io | `bus.ts`: the real event names (`wa.state`, `wa.qr`, `message.created`, `message.status`, `conversation.updated`) plus drafts (`lock.changed`, `conversation.assigned`); a `BroadcastChannel` carries them to the other tabs, which sync the store first |
| WhatsApp | Simulated, labelled everywhere: QR, scan, drop and reconnect, ticks, failures (one contact always fails) |

- **Incoming (simulated):** Demo controls or the auto enquiry → `engine.receiveInbound` (contact, conversation, New lead when needed, reopen a closed chat, unread +1, STOP → opt-out) → `message.created` + `conversation.updated` → toasts for users who may see the chat.
- **Outgoing:** composer → `api.sendMessage` (role, scope, 1–4096 characters, connected, not locked by someone else) → message `queued` → stored status tasks → `message.status` updates, forward only.
- **Campaign:** wizard checks rows → `api.createCampaign` checks again → `campaign_step` task every ~2 s re-checks opt-outs, waits while disconnected, completes with an audit row.
- **Two tabs:** each write starts from the newest saved copy; tabs sync on the `storage` event, every 1 s, before every api call, and before delivering an event from another tab.

## TODO

- Real route paths and verbs, once INB, LEAD, PROP, FUP, CMP and RPT specs are written.
- Request and response shapes for INB onwards: Zod schemas in `packages/shared`, not yet written (MSG's are in `messages.ts`).
- Reply-lock TTL and whether a Manager can override it (open decision in the dev plan).
