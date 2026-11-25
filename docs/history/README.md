# Session history

One file per working session, or per build phase when a spec is built in phases (FND has 5): what was done, what permission the user gave (and what was done on judgement), and where it ended. Add a new file at the end of each session or phase; never rewrite old ones.

| Date | File | Phase | Outcome |
| --- | --- | --- | --- |
| 2026-11-25 | [2026-11-25-session-1.md](./2026-11-25-session-1.md) | Project brief, Spec 0 (BOOT) drafted, approved and built | BOOT implemented, 75 tests pass, 2 todo; repo initialised |
| 2026-11-25 | [2026-11-25-fnd-phase-1.md](./2026-11-25-fnd-phase-1.md) | Spec 1 (FND) drafted, verified, approved; FND phase 1 of 5 (contracts, test skeleton) | FND approved; packages installed; contracts written; all 20 FND criteria have `it.todo` placeholders; 80 pass, 24 todo |
| 2026-11-25 | [2026-11-25-fnd-phase-2.md](./2026-11-25-fnd-phase-2.md) | FND phase 2 of 5 (config and health: FND-01, 02, 03, 19) | Env validation at boot, `GET /health`, `.env.example`; 94 pass, 18 todo; 16 of 20 FND criteria still placeholders |
| 2026-11-25 | [2026-11-25-fnd-phase-3.md](./2026-11-25-fnd-phase-3.md) | CLAUDE.md review; FND phase 3 of 5 (database: FND-04, 05, 06, BOOT-15 test) | `init` migration, real `migrate` and `seed`, unique constraints tested by raw SQL; 103 pass, 15 todo; 13 of 20 FND criteria still placeholders |
| 2026-11-25 | [2026-11-25-fnd-phase-4.md](./2026-11-25-fnd-phase-4.md) | FND phase 4 of 5 (auth and permissions over HTTP: FND-07 to 14, 18) | Login, logout, `/auth/me`, Redis sessions, rate limit, permission map, route guard; 116 pass, 6 todo; 4 of 20 FND criteria still placeholders |
| 2026-11-25 | [2026-11-25-fnd-phase-5.md](./2026-11-25-fnd-phase-5.md) | FND phase 5 of 5 (sockets: FND-15, 16, 17, 20), manual check, FND closed | Socket handshake on the session cookie, server-assigned rooms, disconnect on logout and deactivation; 124 pass, 2 todo; all 20 FND criteria real and passing |
| 2026-11-25 | [2026-11-25-wa-spec-draft.md](./2026-11-25-wa-spec-draft.md) | Spec 2 (WA) drafted in plan mode | `docs/specs/002-whatsapp.md`, `Status: draft`, WA-01 to WA-27; no code; awaiting review |
| 2026-11-25 | [2026-11-25-wa-phase-1.md](./2026-11-25-wa-phase-1.md) | WA approved; WA phase 1 of 5 (packages, contracts, migration, test skeleton) | Pinned installs, `wa.ts` contracts, `wa-session` migration; 124 pass, 29 todo |
| 2026-11-25 | [2026-11-25-wa-phase-2.md](./2026-11-25-wa-phase-2.md) | WA phase 2 of 5 (worker: WA-01 to WA-14, worker parts of WA-18 to WA-20) | Lock, encrypted session, connection manager, Fake and Baileys adapters; 148 pass, 15 todo |
| 2026-11-25 | [2026-11-25-wa-phase-3.md](./2026-11-25-wa-phase-3.md) | WA phase 3 of 5 (api: WA-15 to WA-22) | Event relay, state on connect, `/wa` routes, origin checks, api audit rows; 163 pass, 7 todo |
| 2026-11-25 | [2026-11-25-wa-phase-4.md](./2026-11-25-wa-phase-4.md) | WA phase 4 of 5 (web: WA-23 to WA-25) | Vite + React login, connection page, banner; browser check passed; 170 pass, 6 todo |
| 2026-11-25 | [2026-11-25-wa-phase-5.md](./2026-11-25-wa-phase-5.md) | WA phase 5 of 5 (WA-26, docs) | Baileys pin test; WA built except WA-27 (real phone, manual); 173 pass, 5 todo |
| 2026-11-25 | [2026-11-25-wa-phone-check.md](./2026-11-25-wa-phone-check.md) | WA-27 with the real phone; logout confirmation (WA-24) | All WA-27 steps passed; WA closed |
| 2026-11-25 | [2026-11-25-wa-channel-fix.md](./2026-11-25-wa-channel-fix.md) | Incident: a test run logged out the live session; WA-28 fix | Pub/sub channels scoped by Redis db; 177 pass, 5 todo |
