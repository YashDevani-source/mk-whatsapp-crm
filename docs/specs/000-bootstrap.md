Status: approved

# Spec 0: Bootstrap (BOOT)

## Goal
After this spec is built, a fresh clone installs, typechecks, lints, tests and runs in CI with one command each. The repo enforces the architecture's hard rules mechanically (no `any`, Baileys only in its adapter folder, web never imports db), and spec criteria can be traced to tests. No product features.

## Scope
- Monorepo workspace: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/db`, with the dependency directions from `docs/plan/Architure-plan.md` §2.
- One shared strict TypeScript base config; one typecheck command for the whole repo.
- Lint rules that fail the build (see BOOT-05 to BOOT-07).
- A test runner in every package; one command runs all tests.
- Docker Compose for Postgres and Redis (development and tests).
- `docs/specs/_template.md`.
- A traceability script.
- A CI pipeline.
- The standard root commands.

## Out of scope
- Any product feature, Prisma model, Zod schema, route, socket event, queue or job (FND, WA, MSG and later specs).
- Env validation and `/health` (stay in FND).
- The provider interface and the Fake/Baileys adapters (WA).
- Seed data content (FND). BOOT only requires the `seed` command to exist.
- Deployment.

## Acceptance criteria

"Test level" also states how the criterion is verified: **CI script**, **test** (Vitest) or **manual**. Test titles start with the criterion ID, e.g. `BOOT-06 Baileys import outside the adapter folder fails lint`.

| ID | Criterion | Priority | Test level |
|---|---|---|---|
| BOOT-01 | From a clean checkout, `pnpm install --frozen-lockfile` exits 0, and `pnpm -r list --depth -1` lists exactly these five workspace packages: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/db`. | Must | CI script |
| BOOT-02 | Internal dependencies declared in the five `package.json` files are a subset of: web→shared, api→shared, api→db, worker→shared, worker→db, db→shared. Adding any other internal dependency (e.g. `shared`→`db`, `web`→`api`) makes the check exit non-zero and name the offending edge. | Must | Test (fixture workspaces) |
| BOOT-03 | `pnpm typecheck` runs `tsc --noEmit` in all five packages and exits 0 on the skeleton. Introducing a type error in any one package makes it exit non-zero and name that package. | Must | CI script + test |
| BOOT-04 | Every package's `tsconfig.json` extends one root base config with `"strict": true`. A check fails if any package sets `strict` to false or does not extend the base. | Must | Test |
| BOOT-05 | `pnpm lint` exits non-zero for an explicit `any` (annotation, `as any`, generic argument) in any package, and exits 0 once removed. | Must | Test (lint fixture) |
| BOOT-06 | `pnpm lint` exits non-zero for any import of a Baileys package (static, `import type`, dynamic `import()`, `require`, re-export) in any file outside `apps/worker/src/providers/baileys/**`, and exits 0 for the same import inside that folder. | Must | Test (lint fixture) |
| BOOT-07 | `pnpm lint` exits non-zero when any file in `apps/web` imports `packages/db` (directly or by its package name), and exits 0 once removed. | Must | Test (lint fixture) |
| BOOT-08 | `pnpm test` runs Vitest in all five packages (each has at least one test) and exits 0. A failing test in any one package makes it exit non-zero. The output names every package. | Must | CI script |
| BOOT-09 | On a machine with Docker, `docker compose up -d --wait` leaves Postgres 16 and Redis 7 healthy. `pg_isready` and `redis-cli ping` succeed against the documented ports. | Must | Manual (and CI service check) |
| BOOT-10 | After `docker compose up -d --wait`, a dev database and a separate test database both accept connections, and the test commands use the test database only. | Should | Integration test |
| BOOT-11 | `docs/specs/_template.md` exists, starts with a `Status:` line, and contains headings for Goal, Scope, Out of scope, Acceptance criteria (columns ID, Criterion, Priority, Test level), Contracts touched, Edge cases and Manual check. | Must | Test |
| BOOT-12 | `pnpm traceability` prints every criterion ID found in `docs/specs/*.md` whose spec status is not `draft` and for which no test title starts with that ID, and exits non-zero if the list is non-empty. A spec with `Status: draft` is ignored. An ID that appears only in the middle of a test title does not count as covered. An `it.todo` title that starts with the ID counts as covered (this is how manual criteria such as BOOT-09 and BOOT-16 are traced). | Must | Test (fixture specs and tests) |
| BOOT-13 | The CI workflow runs on push and pull request, with separate named steps in this order: install, typecheck, lint, test, traceability. A failing step stops the later ones. | Must | Test (parse the workflow file) + manual (first push to GitHub) |
| BOOT-14 | Root `package.json` defines `dev`, `test`, `typecheck`, `lint`, `migrate`, `seed` and `traceability` scripts (install is `pnpm install`). Each exits 0 or starts successfully on the skeleton. | Must | Test |
| BOOT-15 | `pnpm migrate` and `pnpm seed` each exit 0 against the Compose `crm_test` database. (Reworded 2026-11-25, see Decision 10. Was: "On an empty schema (no models), `pnpm migrate` and `pnpm seed` each exit 0 against the Compose Postgres.") | Should | Integration test |
| BOOT-16 | `pnpm dev` starts web, api and worker together. Each prints a startup line, and stopping the command stops all three. | Should | Manual |
| BOOT-17 | `pnpm format:check` exits non-zero when a tracked file is not Prettier-formatted, and exits 0 after `pnpm format`. | Could | CI script |

## Contracts touched
No Zod schema, Prisma model, event or job type. Files this spec introduces when built:
- `pnpm-workspace.yaml`, root `package.json` scripts, `.nvmrc` and `engines`.
- `tsconfig.base.json` and one `tsconfig.json` per package.
- `eslint.config.js` (flat config), `.prettierrc`.
- Vitest config per package plus a root run.
- `docker-compose.yml`.
- `scripts/traceability.*`.
- `.github/workflows/ci.yml`.
- `docs/specs/_template.md`.
- Workspace package names (decided 2026-11-25): `@crm/web`, `@crm/api`, `@crm/worker`, `@crm/shared`, `@crm/db`. Used by BOOT-02 and BOOT-07.
- Compose names (decided 2026-11-25, needed by BOOT-10 and BOOT-15): services `postgres` and `redis`, Postgres user `crm`, databases `crm_dev` and `crm_test`.
- Baileys package names banned by BOOT-06 (checked on npm 2026-11-25): `@whiskeysockets/baileys` and `baileys` (both at `7.0.0-rc14`, `latest`), plus the deprecated `@adiwajshing/baileys`. Which version to pin is a WA decision, not BOOT's.

## Edge cases
- The repo path contains spaces and a trailing space (`build your own claude code `). Scripts, CI and Compose paths must quote paths, or the folder is renamed (see Suggested additions).
- BOOT-06: type-only imports, dynamic imports, `require` and `export … from` all count as imports. Test files outside the adapter folder are not exempt.
- BOOT-12: the "test title" is the leaf `it`/`test` title. A `describe` title does not count.
- BOOT-12: ID matching is case-sensitive and anchored at the start of the title. `BOOT-1` does not match `BOOT-01`.
- BOOT-12: a spec with no `Status:` line is treated as non-draft, so it is checked.
- BOOT-09/10: ports already in use on the developer machine, and containers left running from a previous run.
- BOOT-13: CI must use the same Node version as `.nvmrc`.
- While this spec is `draft`, the traceability script ignores it, so CI stays green. This is expected. It is checked once the status changes.

## Manual check
1. Fresh clone (or `git clean -xdf`), then run `pnpm install --frozen-lockfile`. It exits 0.
2. Run `docker compose up -d --wait`, then `pg_isready` and `redis-cli ping`. Both succeed.
3. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm traceability`. All exit 0.
4. Add `const x: any = 1` to `apps/api/src`. `pnpm lint` fails. Remove it.
5. Add a Baileys import to `apps/api/src`. `pnpm lint` fails. Move it into `apps/worker/src/providers/baileys/`. It passes.
6. Add an import of the db package to `apps/web/src`. `pnpm lint` fails. Remove it.
7. Run `pnpm dev`. All three apps print a startup line. Ctrl-C stops all.
8. Push to GitHub. The CI run shows the five steps in order and goes green.

## Proposed changes
Changes to your defaults. They are not in the criteria yet.

| Default | Proposal | Trade-off |
|---|---|---|
| Node LTS, exact version stated | **Node 24 (LTS "Krypton")**, major pinned in `.nvmrc` and `engines`. The exact patch is resolved at build time (`nvm ls-remote --lts`), because I could not look it up reliably. | The official page still listed v26 as "Current", but the schedule implies v26 should be in LTS since about Oct 2026. Sources disagree, so I could not confirm. Node 24 is LTS until 2028-04-30 either way. Switch to 26 only if nodejs.org shows it as LTS. |
| Everything else (pnpm, Vitest, ESLint flat config, Prettier, GitHub Actions, Postgres 16, Redis 7) | No change. | — |

The existing root `package.json` already pins `pnpm@10.13.1`. I propose keeping it.

## Overlap with FND
**Resolved 2026-11-25:** FND is `docs/specs/001-foundation.md`. Its "Overlap with BOOT" section is the reference: BOOT-01 to BOOT-09 cover the monorepo, strict TypeScript, the `any` ban and Compose, and FND numbers its own criteria from FND-01. The text below is the original note, kept for history.

`docs/specs/FND.md` does not exist yet, so I could not check this. From the topics in `docs/plan/development-plan.md` §3 step 1 ("monorepo, strict TypeScript, lint rule banning `any`, Docker Compose for Postgres + Redis, env validation with Zod, `/health`. (`FND-01`, `02`, `12`)"), the likely overlap is:

- Monorepo, strict TypeScript, the `any` ban and Docker Compose are covered by BOOT-01 to BOOT-09. Proposed wording for the matching FND criteria: "moved to BOOT-NN (Spec 0)", where NN is the covering criterion.
- Env validation with Zod and `/health` are not covered by BOOT, so they stay in FND.

Please confirm which of `FND-01`, `02` and `12` this covers once `FND.md` exists.

## Suggested additions
Not in the criteria.
- Rename the folder and root package name to remove the trailing space (e.g. `mk-whatsapp-crm`).
- A CI step that checks the Baileys version is pinned exactly (`development-plan.md` §7 lists it).
- Traceability: ignore struck-through (dropped) criterion IDs, and fail on duplicate IDs across specs (`development-plan.md` §1: "IDs are never reused").
- Add `pnpm format:check` to the CI pipeline (BOOT-17 only creates the command).
- A `.env.example` and a `.gitignore`.

## Decisions
Defaults used when the spec was drafted (2026-11-25). All accepted when the spec was approved the same day.
1. Folder rename is not a criterion. The repo folder is renamed to `mk-whatsapp-crm` by hand, outside the spec.
2. The Baileys boundary path is the architecture's strict `apps/worker/src/providers/baileys/**`.
3. Test titles start with the bare ID (`BOOT-01 …`, per the dev plan), not `[BOOT-01]`.
4. `migrate` and `seed` are no-ops that exit 0 on an empty schema until FND adds models (BOOT-15).
5. The traceability script ignores only `draft`. "Approved" and later statuses are all checked.
6. CI is GitHub Actions, and BOOT-13 is partly verified manually on the first push, because the folder is not a git repo yet.
7. Manual criteria are traced with `it.todo` titles (BOOT-12 wording above).
9. Host ports (2026-11-25): Postgres is published on 5433 (overridable with `POSTGRES_PORT`) because 5432 was already in use on the dev machine. Redis stays on 6379 (`REDIS_PORT`).
8. Node 24 LTS, with the major pinned. Still to confirm at build time: whether Node 26 has become LTS.
10. BOOT-15 reworded (2026-11-25, approved by the user as FND Decision 6). FND makes `migrate` and `seed` real and adds env validation, so "empty schema" no longer holds and the test must not touch `crm_dev` (BOOT-10). The test change (`DATABASE_URL` set to `crm_test`) lands in FND phase 3, together with the real commands. Landed in FND phase 3 (2026-11-25): the test passes `NODE_ENV=test`, a `crm_test` URL and its own `SEED_PASSWORD`.
