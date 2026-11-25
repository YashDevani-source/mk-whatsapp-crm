We are starting the Real-estate WhatsApp CRM. This session is about "Spec 0" only. Spec 0 is the bootstrap spec: it sets up the repo and the tools that every later spec depends on.

Do NOT write any code or config files and do NOT install anything in this session. You may create or edit only Markdown files in docs/.

## Step 1: Read and report back (then stop)

Read these files fully:
- CLAUDE.md
- docs/plan/development-plan.md
- docs/plan/architecture.md
- docs/plan/data-flow.md
- docs/specs/ (every file present)

Then reply with:
1. A summary of the project in 5 bullets or fewer, to show you understood it.
2. Anything in these documents that contradicts something else in them, quoting both places.
3. Your questions for me: only the ones whose answer changes what Spec 0 contains.

Stop after Step 1 and wait for my answers.

## Step 2: Draft Spec 0 (after I answer)

Create docs/specs/000-bootstrap.md using the spec template described in docs/plan/development-plan.md (Goal, Scope / Out of scope, Acceptance criteria table with ID | Criterion | Priority | Test level, Contracts touched, Edge cases, Manual check). Put "Status: draft" at the top.

Use the ID prefix BOOT (BOOT-01, BOOT-02, ...).

Spec 0 covers only the project skeleton and the spec tooling. It contains no product features. It must cover:
- Monorepo workspace with apps/web, apps/api, apps/worker, packages/shared, packages/db, and the dependency directions from architecture.md.
- One shared strict TypeScript base config. Typecheck passes across the whole repo with one command.
- Lint rules that fail the build on: explicit `any`; any import of Baileys outside apps/worker's Baileys adapter folder; web importing db.
- A test runner wired into every package, with one command that runs all tests.
- Docker Compose that starts Postgres and Redis for development and tests.
- A spec template file at docs/specs/_template.md.
- A traceability script that lists every criterion ID in docs/specs/ that has no test whose title starts with that ID, ignoring specs with status "draft".
- A CI pipeline that runs install, typecheck, lint, tests and the traceability script.
- The standard root commands: install, dev, test, typecheck, lint, migrate, seed, and a traceability check.

My default choices are below. Use them unless you see a concrete reason not to. If you do, list it under "Proposed changes" with the trade-off, and don't put the change into the criteria yet:
- pnpm workspaces, Node LTS (state the exact version you propose)
- Vitest, ESLint (flat config), Prettier
- GitHub Actions
- Docker Compose for Postgres 16 and Redis 7

Rules for the criteria:
- Each criterion must be observable and testable on its own. Write it as an outcome ("running X does Y"), not as a task ("set up X").
- For each criterion, say how it is verified: a CI script, a test or a manual check.
- Mark each one Must, Should or Could.
- Check docs/specs/FND.md. Any FND criterion that Spec 0 now fully covers must be listed under "Overlap with FND", with your proposed wording for marking it "moved to BOOT-NN". Do not edit FND.md yourself.
- Do not add anything no line above asks for. If you think something is missing, put it under "Suggested additions"; don't put it into the criteria.

## Step 3: Hand back

Finish with:
- The path of the file you created.
- A table of the BOOT criteria: ID, one-line summary, priority.
- Proposed changes, Overlap with FND, and Suggested additions (each "none" if empty).
- The exact lines you propose adding to CLAUDE.md to replace the TODO about install, dev, test, typecheck, lint and migrate commands. Do not edit CLAUDE.md yet.

Then stop. I will review it, change the status to approved, and only then will we start the contracts and failing tests for BOOT.