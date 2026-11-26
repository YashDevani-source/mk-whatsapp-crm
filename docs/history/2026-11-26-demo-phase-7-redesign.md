# 2026-11-26, session 11: DEMO phase 7, light redesign after a reference image

## What the user asked
Redesign the whole frontend after a reference screenshot (a light SaaS dashboard: minimal sidebar, three pastel number cards, rounded white cards, a right panel with a profile and an agenda), UI only, both modes, without changing behaviour, roles or data.

## What the user decided (asked before any code)
- Light theme by default, dark kept behind a toggle (DEMO-36 amended).
- The DEMO-35 dashboard charts move to Reports.
- `git init` with a local baseline commit, then `pnpm install` (this copy had no `.git` and no `node_modules`).
- Build everything in one go.

## What was built
- Spec: DEMO-37 to DEMO-41, DEMO-32/35/36 amended, Decisions 39 to 43, build phase 7, manual check results.
- `theme.ts` (light/dark, stored per browser, safe when storage is blocked), applied in `main.tsx` before the first render; switch in the sidebar (and the phone top bar).
- `app.tsx`: light sidebar with brand, nav, Demo controls, theme switch and user card with Log out; top bar keeps the Demo tag and the banner as a pill.
- `dashboard-page.tsx` + `overview.ts`: the three-column dashboard and Employee home from `listConversations`, `listLeads`, `listFollowUps` (role-scoped already); agenda with a week strip.
- `report-charts.tsx`: the DEMO-35 charts at the top of Reports.
- `demo.css`: light tokens on `:root`, the phase 6 dark tokens under `[data-theme='dark']`, hard-coded colours replaced by tokens, old dashboard-only rules removed, a phase 7 section (shell, cards, tables, inputs, pastel stat cards, dashboard, right panel, inbox frame, responsive at 1320/1180/960/760/640 px).
- `styles.css` (live): same palette and shapes, same class names.
- Fixes found in the screenshots: `td.row-actions` used `display: flex` and broke table rows; table links, link buttons, the chat header name wrapping.

## Checks
- typecheck, lint, traceability, format:check pass. `@crm/web` 54 passed, 18 todo; `@crm/shared` 9 passed. `build:demo` passes.
- Root and db tests that need Postgres (BOOT-08, BOOT-10, BOOT-15, FND-04) fail because Docker was not running; not related to this change. Run the full `pnpm test` with Docker.
- Headless Chrome (CDP script in the session scratchpad, not kept): every page at 1440 px, the dashboard at 1024 and 390 px, dark theme, Employee home, a scripted click run (theme switch and reload, day picker, card and row links, Demo controls, Log out).

## Open
- DEMO-41 live connection and Messages pages: check with `pnpm dev` (needs Docker and `.env`).
- DEMO-33 walk-through by the user, now in the new design; confirm the focus ring in both themes.
