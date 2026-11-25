# Data flow: what each route, event and job delivers

Status: **planned, not built.** No route, socket event or queue exists in code yet. Spec 0 built the skeleton, and FND (approved, being built in 5 phases) has fixed the paths of its own routes, marked below. This file turns `docs/plan/data-flow-plan.md` (the source) into a lookup of who calls what and what comes back. It is filled in with real paths when each module's spec is written.

Rule for every flow: validate, write to Postgres, then enqueue or publish, then push to the right browsers. Postgres is always written first.

## HTTP routes (planned)

Paths are not decided yet. Each row says what the route does and which spec will name its path. Every route declares a permission, and a test fails if one has none.

| Route (path decided in spec)  | Who may call it                              | Delivers                                                                                 | Spec |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| Login / logout / current user: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (paths decided in FND, not built yet) | Anyone (login) / any logged-in user (`auth.session`) | httpOnly session cookie and `{id, name, role}`. The audit entry (also for failed login) is written by AUD, not FND (FND Decision 5). | FND, AUD |
| Health: `GET /health` (decided in FND, not built yet) | Public | `api`, `postgres`, `redis` each `ok` or `down`; 503 if any is down | FND |
| Send message                  | Assignee, Manager, Super Admin               | `202` + message ID. Message saved as `queued`, job added. `503` if WhatsApp is not connected, `409` if someone else holds the reply lock. | MSG, INB |
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
| Connection page (QR, status)  | Super Admin                                  | QR and state arrive over the `admin` and `global` rooms, not through a route             | WA   |

## Live events (Redis pub/sub, then Socket.io)

| Event                     | Published by                  | Delivered to                              |
| ------------------------- | ----------------------------- | ----------------------------------------- |
| `message.created`         | worker (inbound), API (outbound) | `inbox:all`, `user:<assignee>`         |
| `message.status`          | worker                        | `inbox:all`, `user:<assignee>`            |
| `conversation.updated`    | API, worker                   | `inbox:all`, old and new assignee         |
| `conversation.lock`       | API                           | `inbox:all`, `user:<assignee>`            |
| `lead.created` / `lead.updated` | worker, API             | `inbox:all`, `user:<owner>`               |
| `followup.due`            | worker                        | `user:<owner>`                            |
| `campaign.progress`       | worker                        | `admin`, Managers                         |
| `wa.state`                | worker                        | `global`                                  |
| `wa.qr`                   | worker                        | `admin`                                   |

Rooms are joined only by the server, and only after a valid session:

| Room         | Members                  | Receives                                   |
| ------------ | ------------------------ | ------------------------------------------ |
| `inbox:all`  | Super Admin, Managers    | Every conversation event                   |
| `user:<id>`  | That user                | Events for chats and leads assigned to them |
| `admin`      | Super Admin              | QR codes, connection alerts                |
| `global`     | Everyone logged in       | WhatsApp connection state banner           |

## Queues (BullMQ)

| Queue               | Job ID                       | Retries          | Idempotency guard                              |
| ------------------- | ---------------------------- | ---------------- | ---------------------------------------------- |
| `outbound-message`  | message ID                   | 3, exponential   | Send only if the message is still `queued`     |
| `campaign-send`     | campaign ID + contact ID     | 3, exponential   | Unique recipient row plus a status check       |
| `followup-reminder` | follow-up ID (delayed)       | 3                | Unique reminder-sent record                    |
| `media-download`    | provider message ID          | 3                | Skip if the media is already stored            |

## The four main paths end to end

**Incoming message:** customer phone, WhatsApp, worker (normalise, upsert contact, upsert conversation, insert message with a unique provider message ID, create a lead if the contact has no open one), then `message.created`, `conversation.updated` and `lead.created` over Redis, then the API pushes to `inbox:all` and the assignee's room. A duplicate provider ID stops the flow quietly.

**Outgoing message:** browser, send route (validate, permission, connected check, reply lock), message saved `queued`, job `outbound-message`, worker sends through the provider, saves the provider ID and `sent`, publishes `message.status`, API pushes the tick update.

**Status ticks:** only forward (`queued` → `sent` → `delivered` → `read`; `failed` from `queued` or `sent`). A late or out-of-order receipt is ignored, and an unknown provider ID is ignored and logged. Only what WhatsApp reported is ever shown.

**Campaign:** CSV, validate, segment, preview, confirm, recipient rows, queue at a controlled rate. Before every single send the worker checks for pause, opt-out, and test-only with a non-test contact; it then skips with a reason or sends.

## Who writes what

| Writer | Writes                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------- |
| API    | Users, assignments, lead changes, notes, outbound messages (`queued`), uploads, follow-ups, campaign setup, audit rows for these |
| Worker | Contacts, conversations and inbound messages, unread count, auto-created leads, message status, reminders sent, campaign recipient status, WhatsApp session, audit rows for connect and disconnect |

The worker and the API never call each other directly. They talk only through Redis and the database.

## TODO

- Real route paths and verbs, once INB, LEAD, PROP, FUP, CMP and RPT specs are written.
- Request and response shapes: they are Zod schemas in `packages/shared`, not yet written.
- Reply-lock TTL and whether a Manager can override it (open decision in the dev plan).
