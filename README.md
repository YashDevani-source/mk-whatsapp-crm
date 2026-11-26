# Real-estate WhatsApp CRM

A web CRM where one real-estate sales team handles every customer enquiry through the company's single WhatsApp number, from a shared inbox. It is a prototype for MK Agency's developer assessment, built with a test WhatsApp number and test contacts only. Anything simulated is labelled in the UI.

**Current state (2026-11-26):** Spec 0 (the project skeleton and spec tooling), Spec 1 (FND: env validation, `GET /health`, the database schema and seed, login with Redis sessions, the role→permission map and route guard, and authenticated Socket.io with server-assigned rooms), Spec 2 (WA: the WhatsApp connection) and Spec 3 (MSG: receiving and sending text messages) are built. `pnpm dev` starts the web app on <http://localhost:5173> (login page, Super Admin connection page with the QR, a Messages page for the Super Admin and Managers, and a live connection banner), the api, and the worker, which holds the single-session lock and connects through the Fake provider (labelled "Simulated") or, with `WHATSAPP_PROVIDER=baileys`, the real test number. Customer messages appear live; replies go through a queue and show only the ticks WhatsApp reports. The real test phone check for WA (WA-27) passed; the one for MSG (MSG-28) is open. Spec 4 (DEMO) adds a browser-only demo mode of the whole CRM on dummy data (below); it is built, with the final walk-through in a real browser left for the user.

## Demo mode (prototype, no backend needed)

Spec 4 (`DEMO`, `docs/specs/004-demo.md`) turns the web app into a clickable prototype of the whole CRM that runs entirely in the browser on dummy data for "Skyline Realty". Nothing reaches WhatsApp, Postgres or Redis, and every screen is tagged "Demo · simulated". The real stack (`pnpm dev`, below) is unchanged.

```bash
pnpm install
pnpm --filter @crm/web dev:demo       # http://localhost:5174 (no Docker, no .env)
pnpm --filter @crm/web build:demo     # static site in apps/web/dist (+ 404.html and _redirects)
pnpm --filter @crm/web preview:demo   # serve that build on http://localhost:5174
```

### Accounts

Every account uses the password `demo1234`; the login page has a "Log in as" button for each.

| Role                   | Name                                            | Email                                               |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Super Admin            | Aarav Shah                                      | `aarav@skyline.test`                                |
| Manager                | Neha Kapoor, Rohan Mehta                        | `neha@`, `rohan@skyline.test`                       |
| Employee               | Priya Nair, Karan Verma, Sneha Iyer, Vikram Rao | `priya@`, `karan@`, `sneha@`, `vikram@skyline.test` |
| Employee (deactivated) | Ananya Das                                      | `ananya@skyline.test` (login refused)               |

Each browser tab keeps its own login, so two windows of the same browser can be two people working on the same data live. The data lives in this browser's `localStorage`; "Reset demo data" (login page, or Demo controls) brings the original data back.

### What is in it

- **WhatsApp** (Super Admin): simulated QR with a 20 s countdown, "Simulate scan", log out with a confirm, a banner for everyone.
- **Inbox**: Open/Pending/Closed and Unassigned/Mine/All, unread counts, assign, status, internal notes, the "… is replying" lock with take-over, simulated ticks (clock, ✓, ✓✓, blue ✓✓) and Failed + Retry, "Share property", the lead panel.
- **Leads**: table and board by stage; detail with stage, owner, needs, follow-ups and full history.
- **Properties**: cards with filters; detail with gallery, units, brochures, a session-only upload; "Share into chat".
- **Follow-ups**: Overdue, Today, Upcoming, Done; create, edit, complete; "Run now (test)" sends the test auto-reply once.
- **Campaigns**: Upload CSV (or the sample file) → Segment → Message → Preview & confirm (every skipped row with its reason) → live simulated sending, one message per ~2 s, with pause and resume. Test numbers only by default; the opt-out list.
- **Users**: add, change role, deactivate (history kept, logged out at once). **Reports** (charts, per-employee table, CSV export), **Audit log** (read-only).
- **Dashboard** (Super Admin, Manager) and the Employee **Home**: one three-column layout. A greeting, three pastel cards (New leads, Open chats, Pending follow-ups), Recent conversations, Leads overview and Recent lead activity; a right panel with your profile, the WhatsApp state and a follow-up agenda with a week strip. Employees see only their own work.
- **Themes**: light by default; the sidebar's "Dark theme" button switches every screen and is remembered in this browser.
- **Demo controls** (bottom of the sidebar): a customer writes in (new or existing contact, or STOP), another agent replies (holds the lock ~8 s), drop the connection (back in ~8 s), auto activity (a customer writes about every 45 s), reset.

### Walk-through: the 7-step final demo

Open two windows: **A** as Neha (Manager), **B** as Priya (Employee).

1. **Create a lead and assign it.** In A, Demo controls → "Customer writes in" from "A new test contact" → Send. The new chat opens with a New lead. Set Assignee to Priya.
2. **The employee sees it.** In B the chat appears in Priya's inbox, with a toast; her Leads page shows the lead.
3. **A test message arrives and the employee replies.** In A, Demo controls → the same contact writes again. In B, open the chat and type a reply: A shows "Priya Nair is replying…" and cannot send. B sends; the ticks move clock → ✓ → ✓✓ → blue.
4. **Send a brochure.** In B, "Share property" → Green Valley Residency → Send to customer: a property card with the brochure name.
5. **Run a safe campaign.** In A, Campaigns → New campaign → "Use the sample file" → Segment (all) → Message → Preview: the opted-out number (+1 202 555 0124), the non-test number, the duplicate and the bad number are skipped with reasons. Tick the confirmation → Start; watch it send, pause and resume.
6. **Disconnect and reconnect WhatsApp.** Demo controls → Drop connection: both banners turn amber and Send is disabled; it reconnects after ~8 s. As Aarav, WhatsApp → Log out WhatsApp → confirm → Simulate scan.
7. **Show the reports and the audit log.** In A, Reports (charts, then the table with Export CSV) and Audit log: every step above is listed.

### Hosting the demo build

`build:demo` writes a static site to `apps/web/dist`. Deep links (`/leads/<id>`) work with `preview:demo`, Netlify (`_redirects`) and GitHub Pages on a root domain (`404.html`). The build uses absolute `/assets/` paths, so a sub-path host (e.g. `user.github.io/repo/`) needs `vite build --mode demo --base /repo/`. Publishing it anywhere is an outward step to agree first.

### Limits (simulated on purpose)

- Messages, ticks, the QR and campaign sends are simulated and labelled. Uploads last for the tab's session only. Data is per browser.
- Lead stage names, the 60 s reply lock with Manager take-over, and "closing a chat does not close its lead" are placeholders until the LEAD and INB specs.

## What we did in session 1

- Saved the project brief to memory and to `.claude/CLAUDE.md`.
- Read the plan documents in `docs/plan/` and reported contradictions and questions.
- Wrote and approved Spec 0 (`BOOT`, 17 criteria): `docs/specs/000-bootstrap.md`.
- Followed the spec-driven loop: contracts and failing tests first, then the implementation. All BOOT tests now pass.
- Built the monorepo skeleton, lint rules, Docker Compose, CI workflow and the traceability script.
- Initialised git (two commits so far).

Full detail, including what was authorised and what is still open: [docs/history/](docs/history/README.md).

## Prerequisites

| Tool           | Version                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| Node.js        | 24 LTS (`.nvmrc`). Node 22.22 also works but pnpm prints an engine warning. |
| pnpm           | 10.13.1 (pinned in `package.json`; `corepack enable` installs it)           |
| Docker Desktop | Running, for Postgres and Redis                                             |

## Run it

```bash
pnpm install                    # install all workspace packages
docker compose up -d --wait     # Postgres 16 and Redis 7, wait until healthy
cp .env.example .env            # then fill in the two secrets (see below)
pnpm migrate                    # create the tables in crm_dev
pnpm seed                       # one user per role and two test contacts
pnpm dev                        # starts web (http://localhost:5173), api and worker
curl localhost:4000/health      # {"api":"ok","postgres":"ok","redis":"ok"}
```

Open <http://localhost:5173> and log in with a seeded user (below). The Super Admin sees the WhatsApp connection page and a Messages tab; a Manager lands on Messages; an Employee sees a placeholder home until the inbox module (INB). Everyone sees the connection banner.

`.env` is gitignored. Two secrets are left blank on purpose. Generate each with `openssl rand -hex 32`:

- `SESSION_SECRET`
- `SESSION_ENCRYPTION_KEY`

Until both are set, the api and worker refuse to start and name the missing variables. Every variable is explained in `.env.example`. A variable set in your shell overrides the file.

Seeded users (dev only). Every user has the password `SEED_PASSWORD`, which defaults to `crm-dev-password`. Seed refuses to run when `NODE_ENV=production`. Log in on the login page, or with `curl`:

```bash
curl -c jar -H 'Content-Type: application/json' \
  -d '{"email":"manager@crm.test","password":"crm-dev-password"}' localhost:4000/auth/login
curl -b jar localhost:4000/auth/me             # {"id":"…","name":"Seed Manager","role":"MANAGER"}
curl -b jar -X POST localhost:4000/auth/logout # 204; the cookie now gets 401
```

Socket.io runs on the same port. A connection without a valid `crm_sid` cookie is refused (`unauthenticated`). The server puts each socket in its rooms (`user:<id>` and `global` for everyone, `inbox:all` for Managers and the Super Admin, `admin` for the Super Admin); clients cannot join rooms. Logging out disconnects that session's sockets.

### WhatsApp

- **Fake (default, `WHATSAPP_PROVIDER=fake`):** a simulation. The connection page shows a simulated QR and pairs itself after 5 seconds; the banner shows a "Simulated" tag.
- **Real test number (`WHATSAPP_PROVIDER=baileys pnpm dev`, or set it in `.env` and restart):** the Super Admin opens the connection page, and on the test phone goes to WhatsApp → Linked devices → Link a device and scans the QR. The session is stored encrypted in Postgres (`SESSION_ENCRYPTION_KEY`), so a restart reconnects without a new QR. "Log out WhatsApp…" (with a confirmation click) unlinks the device; "Get new QR" pairs again after a logout or an expired QR. Use a test number only.
- Only one worker may hold the WhatsApp session. A second worker prints `standby, another worker holds the WhatsApp lock` and takes over within about 35 s if the first one dies (at once if it is stopped with Ctrl-C).
- The browser talks only to the Vite dev server, which forwards `/auth`, `/wa` and `/socket.io` to the api, so there is no CORS. The api refuses sockets and non-GET requests from origins not in `ALLOWED_ORIGINS`.

Five failed logins for one email within 15 minutes block that email with 429 (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_SECONDS`).

| Role        | Email                 |
| ----------- | --------------------- |
| Super Admin | `superadmin@crm.test` |
| Manager     | `manager@crm.test`    |
| Employee    | `employee@crm.test`   |

| Service  | Host port | Notes                                                                                                     |
| -------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Postgres | 5433      | user `crm`, password `crm` (dev only); databases `crm_dev` and `crm_test`. Override with `POSTGRES_PORT`. |
| Redis    | 6379      | Override with `REDIS_PORT`.                                                                               |

Stop the services with `docker compose down` (add `-v` to delete the database volume).

## Commands

| Command             | What it does                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm install`      | Install dependencies                                                                                 |
| `pnpm dev`          | Start web, api and worker together (reads the root `.env`)                                           |
| `pnpm test`         | Repo-level tests (`tests/`) plus every package's tests, one package at a time. Needs Docker running. |
| `pnpm typecheck`    | `tsc --noEmit` for the root and all five packages                                                    |
| `pnpm lint`         | ESLint, plus the dependency-direction check                                                          |
| `pnpm migrate`      | Apply pending Prisma migrations (`prisma migrate deploy`); a second run applies nothing              |
| `pnpm seed`         | Create the seeded users and test contacts; safe to rerun; refuses production                         |
| `pnpm traceability` | Lists spec criterion IDs that no test title starts with                                              |
| `pnpm format`       | Format with Prettier (`format:check` only checks)                                                    |

## Layout

```
apps/web         React app (Vite): login page, WhatsApp connection page, Messages page, connection banner
apps/api         Express API: /health, /auth, /wa, /conversations, the send queue, and Socket.io with server-assigned rooms
apps/worker      WhatsApp worker: single-session lock, encrypted session, Fake and Baileys adapters, inbound messages, the send queue processor, message status
packages/shared  Zod schemas, types, events, provider interface, permissions
packages/db      Prisma schema, migrations, client, migrate and seed scripts
scripts/         Traceability and dependency-graph scripts, shared contracts
tests/           Repo-level tests (bootstrap, foundation, whatsapp)
docs/            Plans, specs, data flow, session history
```

Rules enforced by `pnpm lint`: no explicit `any`, Baileys only inside `apps/worker/src/providers/baileys/`, and `apps/web` never imports `packages/db`.

## How we work

Spec-driven: spec, then contracts, then failing tests titled with the criterion ID (e.g. `BOOT-06 …`), then code, then verify. If a spec is wrong, fix the spec first, then the test, then the code. Nothing is built that no criterion asks for.

## Docs

| Where                                       | What                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [docs/plan/](docs/plan/)                    | Project summary, development plan, architecture, data flow                                                       |
| [docs/specs/](docs/specs/)                  | Specs and the template (`000-bootstrap.md`, `001-foundation.md`, `002-whatsapp.md` and `003-messaging.md` built) |
| [docs/data-flow/](docs/data-flow/README.md) | Which route, event and job delivers what (partly built)                                                          |
| [docs/history/](docs/history/README.md)     | Session notes                                                                                                    |
| [.claude/CLAUDE.md](.claude/CLAUDE.md)      | Rules and context loaded in every Claude Code session                                                            |

## Known gaps

- CI has not run yet; it needs a GitHub repo.
- **Live mode** has FND, WA and MSG only. The real specs after MSG (INB, LEAD, …) are not written; in live mode Employees cannot see or send messages, there is no assignment, reply lock or unread count, and only text messages are handled (media shows as "Unsupported message"). Every module is clickable in **demo mode** instead, on dummy data and a simulated WhatsApp.
- The MSG real-phone check (MSG-28) is open.
- Demo mode: the final walk-through in a real browser (DEMO-33) is still to be done by the user; the demo build is not hosted anywhere yet. Lead stage names and the reply-lock rules are placeholders until the LEAD and INB specs.
- If the computer sleeps, the worker loses its WhatsApp lock on wake and takes it again (with Baileys, a reconnect without a QR). Keep the machine awake during a demo.
- The Baileys pin is a release candidate (`7.0.0-rc14`, npm's `latest`); see WA Decision 6.
- See [docs/history/](docs/history/README.md) for the full open-items list.
