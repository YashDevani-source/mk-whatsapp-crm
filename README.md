# Real-estate WhatsApp CRM

A web CRM where one real-estate sales team handles every customer enquiry through the company's single WhatsApp number, from a shared inbox. It is a prototype for MK Agency's developer assessment, built with a test WhatsApp number and test contacts only. Anything simulated is labelled in the UI.

**Current state (2026-11-26):** Spec 0 (the project skeleton and spec tooling), Spec 1 (FND: env validation, `GET /health`, the database schema and seed, login with Redis sessions, the role→permission map and route guard, and authenticated Socket.io with server-assigned rooms), Spec 2 (WA: the WhatsApp connection) and Spec 3 (MSG: receiving and sending text messages) are built. `pnpm dev` starts the web app on <http://localhost:5173> (login page, Super Admin connection page with the QR, a Messages page for the Super Admin and Managers, and a live connection banner), the api, and the worker, which holds the single-session lock and connects through the Fake provider (labelled "Simulated") or, with `WHATSAPP_PROVIDER=baileys`, the real test number. Customer messages appear live; replies go through a queue and show only the ticks WhatsApp reports. The real test phone check for WA (WA-27) passed; the one for MSG (MSG-28) is in progress.

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
- Specs after MSG (INB, LEAD, …) are not written yet. Until INB, Employees cannot see or send messages, there is no assignment, reply lock or unread count, and only text messages are handled (media shows as "Unsupported message").
- The MSG real-phone check (MSG-28) is in progress.
- If the computer sleeps, the worker loses its WhatsApp lock on wake and takes it again (with Baileys, a reconnect without a QR). Keep the machine awake during a demo.
- The Baileys pin is a release candidate (`7.0.0-rc14`, npm's `latest`); see WA Decision 6.
- See [docs/history/](docs/history/README.md) for the full open-items list.
