# 2026-11-26. Session 9 summary: flow changed to a demo prototype; DEMO built

Purpose: one page on what session 9 did and where it ended. The detail is in the phase files linked below.

## What happened
1. Took context from CLAUDE.md. The MSG-28 dev stack from session 8 was no longer running.
2. Committed the pending docs (`cde3acf`) on the user's request.
3. **Flow change.** The user asked to "complete this project with dummy data and dummy api responses with dummy logins and dummy qrs for prototype". I flagged the conflict with the hard rules and the deadline and asked four questions; the user chose a mock mode in the web app, a light spec with smoke tests, react-router with plain CSS, and buttons plus auto activity.
4. Drafted Spec 4 (`DEMO`, `docs/specs/004-demo.md`, DEMO-01 to DEMO-34); the user approved it.
5. Built it in five phases, each with the gate, docs and one local commit, each started by the user's "next":

| Phase | Commit | Content | History |
| --- | --- | --- | --- |
| 1 | `06e5096` | Contracts, dataset, store, demo api core, router, shell, login, role guard | [demo-phase-1](./2026-11-26-demo-phase-1.md) |
| 2 | `498f1b5` | Simulated WhatsApp, inbox, notes, assign, reply lock, ticks, Demo controls | [demo-phase-2](./2026-11-26-demo-phase-2.md) |
| 3 | `09022d3` | Leads, properties (share, upload), follow-ups | [demo-phase-3](./2026-11-26-demo-phase-3.md) |
| 4 | `9c98317` | Campaigns, opt-outs, users, dashboard, reports, audit, Employee home | [demo-phase-4](./2026-11-26-demo-phase-4.md) |
| 5 | `2dc3f83` | Polish, static build with deep links, README walk-through | [demo-phase-5](./2026-11-26-demo-phase-5.md) |

6. The user asked for the demo credentials (given) and, at the end, for the docs and CLAUDE.md to be brought up to date (this file, CLAUDE.md "Current state" restructured into the demo and the live stack, README "Known gaps", `docs/how-it-works.md`, `docs/data-flow/README.md` demo section).

## Where it ended
- Demo mode is built: `pnpm --filter @crm/web dev:demo` (port 5174), logins `<first name>@skyline.test` / `demo1234`. `pnpm test`: 261 passed, 13 todo (all manual).
- Open: DEMO-33, the user's walk-through in a real browser (README "Walk-through: the 7-step final demo"); MSG-28 on the live stack; hosting (needs a remote and a go-ahead; squash `node_modules/` out of the first commit before any push); the folder rename.
- Not committed by me: `.agents/`, `.aider-desk/`, `skills-lock.json` (local AI-tool files).

## Lessons worth keeping
- Browser checks with headless Chrome caught real bugs the unit tests could not: layout overflow, a flickering lock indicator, stale tabs, frozen ticks in hidden tabs, a missing assignment notice. Script the README walk-through before handing it over.
- Kill headless Chrome with SIGKILL after each scripted run; a survivor kept old storage and looked like an app bug.
