# 2026-11-26. After MSG phase 5: lock losses explained, arena skipped, MSG-28 phone check started

Purpose: record what was done, who authorised it, and where it ended. Session 8, after the MSG phase 5 commit (`f205b0b`).

## Summary
- The user typed `/arena` with no task and ran `pnpm dev` (Fake provider) themselves, then "continue".
- Their dev log showed "lost the WhatsApp lock" 4 times with a single worker. Watching `wa:lock` in Redis db 0 for 45 s showed one owner refreshed every 10 s. `pmset -g log` showed the Mac asleep from 01:09:53 with dark wakes at 01:10, 01:19, 01:35 and 01:53, one per loss: the heartbeat was paused past the 30 s TTL, and on each wake the worker found the lock gone, closed WhatsApp and took it again. That is WA-04's intended behaviour, not a bug.
- I asked what the arena should compete on (no task was given; the fallback was the already-committed MSG build, 595 sub-agent calls). The user rejected the question and said "continue", so I ran `ARENA plan` (writes nothing) and started on it; the user interrupted with "continue with no arena". No arena ran and no `.arena/` folder exists.
- MSG-28: I stopped the user's Fake dev stack (their background task) and started `WHATSAPP_PROVIDER=baileys pnpm dev` (the env var overrides `.env`, which was not changed). The worker reconnected to the real test number without a QR (`connected`, 20:40:22 UTC). A read-only recorder subscribes to `crm:events:0` and logs event types, directions and statuses only (no message text, nothing published). The user got the MSG-28 steps.
- The user then asked to update CLAUDE.md and the other docs to this point: CLAUDE.md, this file, the history index, `docs/data-flow/README.md` and `README.md`.

## Timeline

| # | What happened | Authorised by |
| --- | --- | --- |
| 1 | Read the user's dev log; watched `wa:lock` (read-only); read `pmset -g log`. | User: "continue" after `/arena` and `pnpm dev`. |
| 2 | Asked what the arena should run on; question rejected. Ran `ARENA plan --agents 100` (100 agents, 7 rounds, 595 calls); interrupted. | User: "continue", then "continue with no arena". |
| 3 | Stopped the Fake dev stack, started the Baileys dev stack, waited for `connected`, started the event recorder, gave the phone steps. | User: "continue with no arena" (the next open item was MSG-28). |
| 4 | Docs updated to this point. No code changed. | User: "update the claude.md till this work and other files also for now". |

## Permissions
**Explicit go-aheads**: the doc update. The phone check itself is the user's, step by step.
**Taken on my judgement**: stopping the user's Fake dev stack to run the Baileys one (needed for MSG-28); the recorder (listen-only, on the dev channel, never publishing).
**Not done**: no arena; no MSG-28 result yet; no push.

## Where it ended
The Baileys dev stack is connected to the test number and the recorder is running. Waiting for the user to do the MSG-28 phone steps; then the restart-with-a-queued-message step, then closing MSG and the Phase 1 checkpoint.
