# 2026-11-25. WA spec drafted (Spec 2, draft)

Purpose: record what was done, who authorised it, and where it ended. This is session 7. It drafts Spec 2 (WA) only. No contracts, code or installs.

## Summary
- The user asked to "take context from the claude.md". I summarised the state after FND, flagged the risks (`node_modules/` in the first commit, the FND-03 timeout, CI not run, the pending folder rename, `docs/specs/spec-0.md` next to `000-bootstrap.md`), and asked four questions.
- The user said "go ahead, draft the WA spec using plan mode". In plan mode I read the plan documents, the FND spec and the worker, shared, schema and web code, and checked the npm versions. I asked four design questions, and the user took the recommended option each time. The user approved the plan.
- Wrote `docs/specs/002-whatsapp.md` (`Status: draft`, WA-01 to WA-27).

## Timeline

| # | What happened | Authorised by |
| --- | --- | --- |
| 1 | Read CLAUDE.md, git log, specs and history list. Summarised and asked: go-ahead for the draft, CORS via a Vite proxy, lock takeover, Baileys version. | User: "take context from the claude.md". |
| 2 | Plan mode: read `development-plan.md`, `Architure-plan.md`, `data-flow-plan.md`, `project-summary.md`, `docs/data-flow/README.md`, the FND and BOOT specs, `apps/worker/src/main.ts`, `packages/shared/src/{env,rooms,index}.ts`, `schema.prisma`, `apps/api/src/{sockets,main}.ts`, `apps/web`. Ran `npm view` for `baileys`, `@whiskeysockets/baileys`, `qrcode`, `vite`, `react` (read-only). | User: "go ahead, draft the WA spec using plan mode". |
| 3 | Four questions; the user chose the recommended answer each time: connection-only scope; `fake` as the dev default, labelled Simulated; Vite + React with no router; WA writes its own audit rows. | User answers. |
| 4 | Plan approved. Wrote the spec, updated CLAUDE.md "Current state" and "Open items", wrote this file and the history index row. | User approved the plan. |

## Permissions
**Explicit go-aheads given this session**
- Draft the WA spec (in plan mode), and the plan as written.

**Taken on my judgement, within the draft**
- The criteria split (27 criteria), the Redis key names, the schema change for `WhatsAppSession` and the new keys table, the lock defaults, the encrypted value format, and the five build phases. All are marked "Proposed in this draft" in the spec, for the user to accept at review.

**Not done**
- No contracts, tests, code, installs or migration.
- No commit: the spec is committed in WA phase 1 after approval, as FND was.
- `docs/data-flow/README.md` is not updated; it gets the real WA paths when they are built.

## Where it ended
The WA spec is a draft, waiting for the user's review of Decisions 5 to 11 and the three open points (lock TTL, Baileys RC versus legacy, "Get new QR" in `disconnected`).
