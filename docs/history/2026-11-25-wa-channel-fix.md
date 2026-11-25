# 2026-11-25. WA-28: a test run logged out the live WhatsApp session; channels scoped by Redis db

Purpose: record what was done, who authorised it, and where it ended. Session 7, end.

## What happened
- After WA-27 passed, I ran `pnpm test` for the gate while the dev stack stayed connected to the real test number. At 17:30:44 the dev worker logged the number out: it obeyed a `logout` command published by the worker tests. A test `new_qr` then started a fresh pairing, and the dev api relayed the tests' events (8 × `dropped event` from WA-17) to the user's open browser.
- Cause: my test isolation used Redis database numbers (Decisions 25 and 34). Keys are per database, but pub/sub channels are shared by the whole Redis server.
- I reported it to the user before doing anything else and proposed the fix.

## Timeline

| # | What happened | Authorised by |
| --- | --- | --- |
| 1 | Found the logout without a `wa.logout_requested` row in `crm_dev`, and the dropped-event lines in the dev api log. Reported cause and fix; held the WA-27 commit. | — |
| 2 | Spec: new criterion WA-28, channel names `crm:events:<db>` / `wa:commands:<db>` under Contracts touched, Decision 43, correction notes on 25 and 34. | User: "go ahead". |
| 3 | Stopped the dev stack (old code on the old channels). Contract `waChannels(db)`; test helpers moved to the db channels; four WA-28 tests. Against the old code 17 worker and 6 api tests failed, as expected. | Same. |
| 4 | Code: worker (`connection.ts`), api relay (`events.ts`) and routes (`wa.ts`) take the db from their own Redis client (`redis.options.db`). `EVENTS_CHANNEL` and `WA_REDIS.commands` removed from shared, so nothing can use a global name. | Same. |
| 5 | Gate: typecheck, lint, test (177 passed, 5 todo), traceability, format:check all exit 0. Data-flow and CLAUDE.md updated. One local commit with the logout confirmation (Decision 41) and the WA-27 records (Decision 42). | Phase-end routine. |

## Still to do
- The test number must be paired again (the incident logged it out). Then a live check: run `pnpm test` while the dev stack is connected and confirm the dev worker stays `connected`.
