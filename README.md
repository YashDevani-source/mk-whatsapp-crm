# Real-estate WhatsApp CRM

A web CRM where one real-estate sales team handles every customer enquiry through the company's single WhatsApp number, from a shared inbox. It is a prototype for MK Agency's developer assessment, built with a test WhatsApp number and test contacts only. Anything simulated is labelled in the UI.

**Current state (2026-11-25):** Spec 0 (the project skeleton and spec tooling) is built. Spec 1 (FND: env, health, schema, seed, auth, permissions, sockets) is approved and being built in 5 phases. Phase 1 is done (packages, contracts, placeholder tests). There are still no product features, no HTTP routes and no UI. `pnpm dev` starts three placeholder processes.

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
pnpm dev                        # starts web, api and worker (placeholders for now)
```

| Service  | Host port | Notes                                                                                                     |
| -------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Postgres | 5433      | user `crm`, password `crm` (dev only); databases `crm_dev` and `crm_test`. Override with `POSTGRES_PORT`. |
| Redis    | 6379      | Override with `REDIS_PORT`.                                                                               |

Stop the services with `docker compose down` (add `-v` to delete the database volume).

## Commands

| Command             | What it does                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install`      | Install dependencies                                                                   |
| `pnpm dev`          | Start web, api and worker together                                                     |
| `pnpm test`         | Repo-level tests (`tests/bootstrap`) plus every package's tests. Needs Docker running. |
| `pnpm typecheck`    | `tsc --noEmit` for the root and all five packages                                      |
| `pnpm lint`         | ESLint, plus the dependency-direction check                                            |
| `pnpm migrate`      | Placeholder until the schema exists (FND)                                              |
| `pnpm seed`         | Placeholder until the schema exists (FND)                                              |
| `pnpm traceability` | Lists spec criterion IDs that no test title starts with                                |
| `pnpm format`       | Format with Prettier (`format:check` only checks)                                      |

## Layout

```
apps/web         React app (placeholder)
apps/api         Express + Socket.io API (placeholder)
apps/worker      WhatsApp worker; the only place Baileys may be imported (placeholder)
packages/shared  Zod schemas, types, events, provider interface, permissions
packages/db      Prisma schema and client (placeholder)
scripts/         Traceability and dependency-graph scripts, shared contracts
tests/bootstrap  Tests for the Spec 0 criteria
docs/            Plans, specs, data flow, session history
```

Rules enforced by `pnpm lint`: no explicit `any`, Baileys only inside `apps/worker/src/providers/baileys/`, and `apps/web` never imports `packages/db`.

## How we work

Spec-driven: spec, then contracts, then failing tests titled with the criterion ID (e.g. `BOOT-06 …`), then code, then verify. If a spec is wrong, fix the spec first, then the test, then the code. Nothing is built that no criterion asks for.

## Docs

| Where                                       | What                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [docs/plan/](docs/plan/)                    | Project summary, development plan, architecture, data flow                                   |
| [docs/specs/](docs/specs/)                  | Specs and the template (`000-bootstrap.md` built, `001-foundation.md` approved, in progress) |
| [docs/data-flow/](docs/data-flow/README.md) | Which route, event and job delivers what (planned)                                           |
| [docs/history/](docs/history/README.md)     | Session notes                                                                                |
| [.claude/CLAUDE.md](.claude/CLAUDE.md)      | Rules and context loaded in every Claude Code session                                        |

## Known gaps

- CI has not run yet; it needs a GitHub repo.
- FND is in progress: phase 1 of 5 done. Next is phase 2, config and `/health`.
- See [docs/history/](docs/history/README.md) for the full open-items list.
