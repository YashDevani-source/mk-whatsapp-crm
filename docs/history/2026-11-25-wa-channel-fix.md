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

## Second incident, same session
- The live check (dev connected at 17:42:08, then `pnpm test`) failed at 17:43:07: my new WA-28 tests themselves published on db 0's channels to stand for "another database", so the dev worker obeyed a test `logout` again, and the api test pushed a fake QR and states to the user's browser.
- Fixed: the WA-28 tests use db 9 (unused) and never publish or listen on db 0 (spec Decision 43, extended). Checked the other tests: only `boot.test.ts` (spawned api, publishes nothing) and `health.test.ts` (`PING`) touch db 0.
- Re-run with a recorder on `crm:events:0` and `wa:commands:0`: 0 messages during the whole `pnpm test` (17:45:40 to 17:47:51), 0 dropped events in the dev api, 177 passed. One local commit.

## Live proof (done)
- The user paired the test number again (connected 17:50:34). With a recorder on `crm:events:0` and `wa:commands:0`, `pnpm test` ran from 17:50:46 to 17:52:57: 177 passed, 0 messages on the dev channels, 0 dropped events in the dev api, no new `wa.*` audit rows, and the dev worker stayed `connected`.
- The dev stack (`WHATSAPP_PROVIDER=baileys`) is left running and connected for the user.
