# 2026-11-25. MSG spec drafted (Spec 3, draft)

Purpose: record what was done, who authorised it, and where it ended. This is session 8. It drafts Spec 3 (MSG) only. No contracts, code or installs.

## Summary
- The user asked to "take context from the claude.md". I summarised the state after WA, flagged the MSG risks (no faked ticks, the reply lock belongs to INB, Baileys RC message events unproven, dedupe and ordering, the undecided lead stages), and asked three questions.
- The user answered "yes, yes, yes": draft the spec now; text only, media later; MSG owns the contact and conversation columns it needs.
- I read `development-plan.md`, `Architure-plan.md`, `data-flow-plan.md`, the WA and FND specs, `schema.prisma`, `packages/shared/src/{wa,auth,rooms}.ts`, `apps/worker/src/main.ts`, the opening of both adapters, and Baileys 7.0.0-rc14's message key and event types (read-only). Ran `npm view bullmq` (read-only).
- Wrote `docs/specs/003-messaging.md` (`Status: draft`, MSG-01 to MSG-28). `pnpm traceability` still passes (draft specs are skipped).

## Timeline

| # | What happened | Authorised by |
| --- | --- | --- |
| 1 | Read CLAUDE.md. Summarised and asked: go-ahead for the draft, text only or media, who creates the contact and conversation columns. | User: "take context from the claude.md". |
| 2 | Read the plans, specs and code listed above; checked the Baileys types for LID addressing (`remoteJidAlt`, `lidMapping.getPNForLID`) and the BullMQ release dates. | User: "yes, yes, yes". |
| 3 | Wrote the spec, this file, the history index row, and the "Current state" lines in CLAUDE.md. | Same. |

## Permissions
**Explicit go-aheads given this session**
- Draft the MSG spec; text only; MSG adds the contact and conversation columns it needs.

**Taken on my judgement, within the draft**
- The 28 criteria and their priorities, the provider event shape, the `msg-core` migration columns, `nextStatus`'s table, the Super Admin and Manager-only permissions, the `bullmq` 6.7.5 pin, the Baileys socket options, the retry timings and the five build phases. All are marked "Proposed in this draft" (Decisions 5 to 16) or listed under Proposed changes and Open points.

**Not done**
- No contracts, tests, code, installs or migration.
- No commit: the spec is committed in MSG phase 1 after approval, as FND and WA were.
- `docs/data-flow/README.md` is not updated; it gets the real MSG paths when they are built.

## Where it ended
The MSG spec is a draft, waiting for the user's review of Decisions 5 to 16, the Proposed changes, and the three open points (the crash-between-send-and-save window, Employee access before INB, a simulated inbound button for the Fake).
