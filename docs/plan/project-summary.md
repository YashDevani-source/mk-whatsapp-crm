# Project summary: Real-estate WhatsApp CRM

## What I'm building
A web-based CRM for one real-estate company. The whole sales team handles every customer enquiry through the company's single WhatsApp number, from one shared dashboard.

- **Users:** 1 Super Admin, Managers, and up to 10 Employees.
- **Flow:** a customer messages the company number → the message lands in a shared inbox → a manager assigns the chat to an employee → the employee replies through the CRM, and the customer sees a normal WhatsApp message from the company.
- Every conversation is linked to a **lead** that moves from first enquiry to a closed deal.
- The CRM also manages a **property catalogue**, **follow-up reminders**, **safe bulk campaigns** and **reports**.

**Context:** this is a prototype for MK Agency's developer assessment, built in 2–3 days with a **test WhatsApp number and test contacts only**. Anything simulated must be labelled as simulated in the UI.

## Core modules
| Module | What it does |
|---|---|
| WhatsApp connection | Admin scans a QR code. Status shows connected, disconnected or reconnect-required. Reconnects after a server restart without a new QR. Alerts the admin when the connection drops. |
| Shared inbox | Chat list and chat panel. Assign and reassign. Open / pending / closed states plus an unread count. Internal notes (never sent to WhatsApp). A "someone is replying" lock. The sending user shown on every message. |
| Leads | Customer details and property needs (budget, location, type, BHK). Seven stages from New to Converted or Lost. Assignment and full change history. Created automatically from new enquiries; at most one open lead per contact. |
| Properties | Projects and units with photos and brochure PDFs. Search. Share a property into a chat. |
| Follow-ups | Reminders, plus overdue and upcoming lists. Test-mode auto-replies. Never sends the same reminder twice. |
| Campaigns | CSV import with validation, segments, preview and confirm. Queued sending at a controlled rate, with pause/resume. Opt-out list checked before every message. A test-numbers-only switch that is on by default. |
| Users and roles | Super Admin, Manager and Employee, checked on the server. Employees see only their own chats and leads. Deactivating a user keeps their history. |
| Dashboard and reports | Counts of leads, chats and follow-ups. Per-employee performance. Filters and CSV export. Tables, not charts. |
| Audit log | Append-only record of logins, assignments, stage changes, campaign actions and WhatsApp connects/disconnects. |

## Tech stack
| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript, Socket.io client | Live inbox updates |
| API | Node.js + Express + TypeScript, Socket.io server | Core stack |
| Database | PostgreSQL + Prisma | Relational data; unique constraints are the main defence against duplicates |
| Queue / cache | Redis + BullMQ | Sending, campaigns, reminders, retries, reply locks |
| WhatsApp | Baileys (pinned version) in a **separate worker process** | Light, TypeScript-native; session stored encrypted in Postgres |
| Files | S3 or local disk, served through signed URLs | Uploads checked by their real content, not the file extension |

**Monorepo layout:**
- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/shared`: Zod schemas, types, events, provider interface, permissions
- `packages/db`: Prisma

**Key design decision:** the app talks to WhatsApp only through a **provider interface**. Baileys is the adapter for now; in production it can be swapped for the official **WhatsApp Cloud API** without a rewrite. Only the worker's adapter imports Baileys.

## How data flows
- **Incoming:** WhatsApp → worker → Postgres (the unique message ID blocks duplicates) → Redis event → API → live push to the right browsers → contact and lead created if new.
- **Outgoing:** employee clicks send → API checks permission and the reply lock → message saved as `queued` → BullMQ job → worker sends → the real WhatsApp status is saved. Ticks only move forward.
- **Campaign:** segment → preview → confirm → queued at a controlled speed → opt-out checked before each message → a unique (campaign, contact) key prevents double sends, even after a crash.

## How I work: spec-driven development
Every feature starts as a short spec with numbered acceptance criteria, such as `INB-03`. The loop is:

1. Spec
2. Contracts (Zod, Prisma, event and job types)
3. Failing tests titled with the criterion ID
4. Code until the tests pass
5. Verify

If a spec turns out to be wrong, update the spec first, then the test, then the code. Never build something no criterion asks for.

## Building plan
### Day 1: prove the core works
- Foundation: monorepo setup; PostgreSQL tables for users, contacts, conversations, messages and the WhatsApp session; Redis; login with role checks on the server.
- WhatsApp connection: Baileys worker, QR page, status states, encrypted saved session, provider interface.
- Message flow: receive, store, push live; send through the queue; duplicate protection; contacts created automatically.
- Start the risk write-up: library version and licence, the fact that it's unofficial, ban risk, and the plan if it breaks.

✅ **Checkpoint:** message the test number from a phone, see it in the CRM, reply, and receive the reply on the phone. Restart the server and it stays connected.

### Day 2: make it a CRM
- Shared inbox UI: assignment, states, notes, reply lock, disconnected banner.
- Leads: fields, stages, history, auto-creation, employees see only their own.
- Properties: images and PDFs with file checks, share into a chat.
- Follow-ups and audit log.

✅ **Checkpoint:** two employees in two browsers see the same chat live, the reply lock works, and a lead moves through its stages with history recorded.

### Day 3: extras and documents
- Campaigns in safe mode: CSV checks, segments, queue, pause/resume, opt-out, test-numbers-only switch.
- Dashboard and reports: counts, per-employee stats, filters, CSV export.
- Documents: architecture and ER diagrams, setup and environment guide, backup and restore steps, test results, known limitations, user guides, cost estimate.

✅ **Final checkpoint — the full acceptance demo:**
1. Create a lead and assign it.
2. The employee sees it.
3. A test message arrives and the employee replies.
4. Send a brochure.
5. Run a safe campaign and show the opted-out number being skipped.
6. Disconnect and reconnect WhatsApp.
7. Show the reports and the audit log.

## Priorities
- **Must really work:** the QR connection, the live inbox, and real replies.
- **Can be simplified (and labelled):** automations as "Run now (test)" buttons, CSV-only export, tables instead of charts.
- **Never:** fake delivered/read ticks, real customer numbers, or unsolicited bulk sending.

## Non-negotiable rules
- Role checks happen on the server, for both routes and socket rooms. Hiding something in React is not security.
- The reply lock is enforced at the send endpoint, not only shown in the UI.
- Only one WhatsApp session may be live at a time (a Redis lock is held when the worker starts).
- TypeScript strict mode, no `any`. Zod schemas in `packages/shared` are the single source of truth for every data shape.