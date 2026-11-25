# Real-estate WhatsApp CRM: project brief for every Claude Code session

## Project
- A web CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared dashboard.
- Users: 1 Super Admin, Managers, up to 10 Employees.
- Flow: customer messages the company number → shared inbox → manager assigns the chat to an employee → employee replies through the CRM → customer sees a normal WhatsApp message from the company.
- Every conversation is linked to a lead that moves from first enquiry to a closed deal.
- Uses a test WhatsApp number and test contacts only. Anything simulated must be labelled as simulated in the UI.

## Modules
| Module | What it does |
|---|---|
| WhatsApp connection | Admin scans a QR code. Status: connected, disconnected or reconnect-required. Reconnects after a server restart without a new QR. Alerts the admin when the connection drops. |
| Shared inbox | Chat list and chat panel. Assign and reassign. Open / pending / closed states plus an unread count. Internal notes (never sent to WhatsApp). A "someone is replying" lock. Sending user shown on every message. |
| Leads | Customer details and property needs (budget, location, type, BHK). Seven stages from New to Converted or Lost. Assignment and full change history. Created automatically from new enquiries; at most one open lead per contact. |
| Properties | Projects and units with photos and brochure PDFs. Search. Share a property into a chat. |
| Follow-ups | Reminders, overdue and upcoming lists. Test-mode auto-replies. Never sends the same reminder twice. |
| Campaigns | CSV import with validation, segments, preview and confirm. Queued sending at a controlled rate, pause/resume. Opt-out list checked before every message. Test-numbers-only switch, on by default. |
| Users and roles | Super Admin, Manager, Employee, checked on the server. Employees see only their own chats and leads. Deactivating a user keeps their history. |
| Dashboard and reports | Counts of leads, chats, follow-ups. Per-employee performance. Filters and CSV export. Tables, not charts. |
| Audit log | Append-only record of logins, assignments, stage changes, campaign actions, WhatsApp connects/disconnects. |

## Tech stack
- Frontend: React + TypeScript, Socket.io client.
- API: Node.js + Express + TypeScript, Socket.io server.
- Database: PostgreSQL + Prisma. Unique constraints are the main defence against duplicates.
- Queue and cache: Redis + BullMQ (sending, campaigns, reminders, retries, reply lock).
- WhatsApp: Baileys (pinned version) in a **separate worker process**, session stored encrypted in Postgres.
- Files: S3 or local disk, served through signed URLs. Uploads checked by real content, not extension.
- Monorepo: `apps/web`, `apps/api`, `apps/worker`, `packages/shared` (Zod schemas, types, events, provider interface, permissions), `packages/db` (Prisma).
- Key design decision: the app talks to WhatsApp only through a provider interface. Baileys is the adapter for now and can later be swapped for the official WhatsApp Cloud API. Only the worker's adapter imports Baileys.

## Data flows
- **Incoming:** WhatsApp → worker → Postgres (unique message ID blocks duplicates) → Redis event → API → live push to the right browsers → contact and lead created if new.
- **Outgoing:** employee clicks send → API checks permission and reply lock → message saved as `queued` → BullMQ job → worker sends → real WhatsApp status saved. Ticks only move forward.
- **Campaign:** segment → preview → confirm → queued at controlled speed → opt-out checked before each message → unique (campaign, contact) key prevents double sends, even after a crash.

## Workflow (spec-driven)
Every feature starts as a short spec with numbered acceptance criteria (e.g. `INB-03`).
1. Spec
2. Contracts (Zod, Prisma, event and job types)
3. Failing tests titled with the criterion ID
4. Code until the tests pass
5. Verify

If a spec is wrong: update the spec, then the test, then the code. Never build something no criterion asks for.

## Build order
- **Phase 1, prove the core works:** foundation, login and roles, Baileys worker, QR page, incoming and outgoing flows, duplicate protection.
  Checkpoint: message the test number from a phone, see it in the CRM, reply, receive the reply on the phone. Restart the server and it stays connected.
- **Phase 2, make it a CRM:** inbox UI, leads, properties, follow-ups, audit log.
  Checkpoint: two employees in two browsers see the same chat live, the reply lock works, a lead moves through its stages with history recorded.
- **Phase 3, extras and documents:** campaigns in safe mode, reports, then the documents.
  Checkpoint: an end-to-end run through every module.

## Priorities
- Must really work: QR connection, live inbox, real replies.
- Can be simplified (and labelled): automations as "Run now (test)" buttons, CSV-only export, tables instead of charts.
- Never: fake delivered/read ticks, real customer numbers, unsolicited bulk sending.

## Hard rules
- Role checks happen on the server (routes and socket rooms). Hiding something in React is not security.
- The reply lock is enforced at the send endpoint, not only in the UI.
- Only one WhatsApp session may be live at a time (a Redis lock is held when the worker starts).
- TypeScript strict mode, no `any`. Zod schemas in `packages/shared` are the single source of truth for every data shape.
- Never fake WhatsApp delivered/read ticks. Show only what the provider reported.
- Test numbers and test contacts only. No unsolicited bulk sending.
- Only `apps/worker` imports Baileys.
- No feature code without a spec criterion. One module at a time.

## Session protocol
- Do not write code until the user gives an explicit go-ahead. Summarise, flag risks, ask questions first.

## Open items
- TODO: `docs/plan/project-summary.md` and `docs/plan/spec-driven-plan.md` are not in the repo. Criterion IDs, the 7 lead stage names and numeric targets come from them. Do not invent these.
- TODO: install, dev, test, typecheck, lint and migrate commands. The repo is not scaffolded yet.