Status: approved

Approved 2026-11-26 (session 9): the user's "approved" accepted the draft with the recommended answer to each open point (Decision 13). Build: all 5 phases built. DEMO-01, DEMO-03 to DEMO-13, DEMO-15 to DEMO-20 and DEMO-22 to DEMO-31 have passing tests. The manual DEMO-02, DEMO-14, DEMO-21, DEMO-32 and DEMO-34 were checked in headless Chrome (see Manual check results). DEMO-33, the walk-through in a real browser, waits for the user. Phase 6 (DEMO-35, DEMO-36: dashboard charts and a dark theme) was added on 2026-11-26 at the user's request.

Drafted 2026-11-26 (session 9) after the user changed the flow: "complete this project with dummy data and dummy api responses with dummy logins and dummy qrs for prototype". The user chose (Decision 1): a mock mode inside the web app, a light spec with smoke tests, react-router with plain CSS, and live activity by buttons plus a gentle auto mode.

# Spec 4: Demo mode (DEMO)

Every module of the CRM as a clickable prototype in the browser, on dummy data and a dummy in-browser api, with dummy logins and a dummy QR. Nothing reaches WhatsApp, Postgres or Redis in demo mode, and the UI says so.

## Goal

A reviewer opens the web app in demo mode (no Docker, no phone), logs in as any of the seven Skyline Realty users, and walks through the whole product: connects WhatsApp with a simulated QR scan, works the shared inbox (assign, reply, notes, reply lock, ticks, a customer writing live), moves a lead through its stages, shares a property into a chat, handles follow-ups, runs a safe campaign to test numbers, manages users, reads reports and exports CSV, and reads the audit log. Each role sees only what it may see, and the demo api refuses what the role may not do. The real stack (`pnpm dev`) is unchanged and still runs the built FND, WA and MSG flows.

## Scope

- A build-time switch (`vite --mode demo`, or `VITE_DEMO=1`), with the scripts `dev:demo`, `build:demo` and `preview:demo` in `apps/web` (port 5174, so the live dev server on 5173 can run at the same time). Without the flag the web app is today's app, unchanged.
- Draft Zod contracts in `packages/shared/src/crm.ts` for the modules that have no api yet (inbox extras, leads, properties, follow-ups, campaigns, users, reports, audit), so the dummy data has the shapes a real api will return.
- `apps/web/src/demo/`: the dummy dataset (Skyline Realty), an in-browser store saved in `localStorage`, the demo api (one async function per future route, with a short random delay), an in-browser event bus with the real socket event names, and the simulator (customer messages, ticks, another agent typing, connection drops).
- The demo api enforces the role rules and the reply lock itself, as the stand-in for the server (Decision 6).
- react-router, an app shell with a role-based sidebar, a top bar and the WhatsApp banner, and the 12 screens of `docs/design-prompt.md` Part E with their empty, loading, error and no-access states.
- A "Demo controls" drawer: simulate a customer message, simulate another agent replying, drop and restore WhatsApp, auto activity on/off, reset demo data.
- A static build that runs from any static host (hosting it is a separate, outward-facing step that needs the user's go-ahead).

## Out of scope

- Any change to `apps/api`, `apps/worker` or `packages/db`. The real INB, LEAD, PROP, FUP, CAMP, USR, RPT and AUD specs are not written by this spec; its contracts are drafts they may change.
- The new screens in live mode. Live mode keeps today's Connection, Messages and Home pages (Decision 3).
- Real file storage: uploaded photos and brochures live in memory for the session only and are not saved across reloads.
- Real WhatsApp sends, real QR pairing, real numbers. Charts. Dark theme. Mobile below tablet width.
- Browser automation tests (no new test packages); screens are checked by hand (DEMO-33).

## Acceptance criteria

IDs are `DEMO-NN` and are never reused. "Test level" also states how it is verified. Test titles start with the criterion ID. "Demo api" means the in-browser functions in `apps/web/src/demo/`; "Unit" tests run in Vitest without a browser.

**Mode, data and login**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-01 | In demo mode (`--mode demo` or `VITE_DEMO=1`) the app makes no request to `/auth`, `/wa`, `/conversations` or `/socket.io`; without it, the app behaves as before this spec (the existing web tests still pass). | Must | Unit (mode switch) + manual (network tab) |
| DEMO-02 | Every screen in demo mode shows a grey "Demo · simulated" tag in the top bar, and the WhatsApp banner always carries "Simulated". | Must | Manual |
| DEMO-03 | The seed builds the Skyline Realty dataset: the 7 users of design prompt Part F (1 Super Admin, 2 Managers, 4 Employees, one Employee deactivated is added as an 8th for history), 24 customers on `+1 202 555 0100`–`0199` only, 4 projects with units, one conversation per customer (24) across Open/Pending/Closed with assignees, one lead per customer, follow-ups overdue/today/upcoming/done, 2 past campaigns, and audit rows. Every record parses with its `@crm/shared` schema. | Must | Unit |
| DEMO-04 | Seeded times are relative to "now", so the data looks recent on any day. | Must | Unit |
| DEMO-05 | The store is saved in `localStorage` (key `crm-demo-v1`) and survives a reload; "Reset demo data" restores the seed; a stored value that does not parse is replaced by the seed. | Must | Unit (injected storage) |
| DEMO-06 | Login accepts each demo user's email with the password `demo1234`; any other email or password gives "Email or password is incorrect."; a deactivated user cannot log in (same message). The login page lists the demo accounts with a one-click "Log in as" for each. | Must | Unit + manual |
| DEMO-07 | The session is kept in `sessionStorage` across reloads until "Log out"; each login and logout writes an audit row. | Should | Unit |

**Roles**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-08 | The sidebar per role: Super Admin: Dashboard, Inbox, Leads, Properties, Follow-ups, Campaigns, Users, Reports, Audit log, WhatsApp. Manager: the same without WhatsApp. Employee: Home, Inbox, Leads, Properties, Follow-ups. Each role lands on its first item. | Must | Unit (pure nav rule) |
| DEMO-09 | Opening a URL the role may not use shows "You don't have access to this page", and the demo api refuses the call with `forbidden`. | Must | Unit (demo api) + manual |
| DEMO-10 | An Employee's demo api calls return only conversations, leads and follow-ups assigned to them; reading or acting on another one returns `not_found`. | Must | Unit |

**WhatsApp connection (simulated)**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-11 | The Super Admin's WhatsApp page shows the state card (state, number, since, reason) and, in `qr_required`, a QR image generated from a random `DEMO-…` string with the note "Simulated QR — no phone needed", a countdown, and "Get new QR". The QR refreshes every 20 s; after 3 unscanned QRs the state becomes `reconnect_required` (`qr_timeout`). | Must | Unit (state machine) + manual |
| DEMO-12 | "Simulate scan" moves `qr_required` → `connecting` → `connected` (number `+1 202 555 0100`); "Log out WhatsApp" needs a confirmation and moves to `qr_required`. Both write audit rows and every user's banner updates live. | Must | Unit |
| DEMO-13 | "Drop connection" (Demo controls) moves to `disconnected` (`network`), then back to `connected` after ~8 s. While not connected, every composer is disabled with "WhatsApp is not connected" and the demo api refuses sends with `wa_not_connected`. | Must | Unit |

**Inbox**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-14 | The inbox has three columns: chat list (search; Open/Pending/Closed; Unassigned/Mine/All, Employees Mine only; rows with name or phone, preview, time, unread badge, assignee, stage chip), chat panel, and lead panel. | Must | Manual |
| DEMO-15 | Opening a chat clears its unread count; a new inbound message moves the chat to the top and raises the unread count, live for every user who may see it, with a toast. | Must | Unit (demo api + bus) + manual |
| DEMO-16 | A reply appears at once as `queued` with the sender's name, then moves `sent` → `delivered` → `read` on the simulator's timers, only forward (`nextStatus`). Messages to the contact marked "fails on send" end `failed` with Retry; Retry queues a new attempt. | Must | Unit |
| DEMO-17 | The composer enforces 1 to 4096 characters (trimmed) in the UI and in the demo api (`invalid_body`). | Must | Unit |
| DEMO-18 | Internal notes (Note toggle) are stored with the conversation, shown in yellow with "Not sent to the customer", never get ticks, and never appear in the customer-facing message stream the simulator "delivers". | Must | Unit |
| DEMO-19 | Assign/reassign (Super Admin, Manager) and status Open/Pending/Closed (anyone who may see the chat) update the list live and write audit rows. Employees cannot assign (`forbidden`). | Must | Unit |
| DEMO-20 | Reply lock: typing in a chat takes its lock for 60 s (renewed while typing); another user's composer then shows "<name> is replying…" and the demo api refuses their send with `reply_locked`. "Simulate agent replying" makes a chosen Employee hold the lock. A Manager or Super Admin can "Take over". | Must | Unit |
| DEMO-21 | The chat panel shows "Sent from phone" and "Unsupported message (image)" items, day separators and a "New messages" divider. | Should | Manual |
| DEMO-22 | "Simulate customer message" sends one of the Part F texts (or typed text) from a chosen or new test contact; a new contact creates a conversation and a `New` lead (unassigned). With auto activity on, one random enquiry arrives every ~45 s. | Must | Unit |

**Leads, properties, follow-ups**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-23 | Leads: a table with filters (stage, owner, type, search) and a board by stage; a detail page with editable needs (budget, location, type, BHK), owner, chat link, follow-ups and a change history. Every stage, owner or field change adds a history row and an audit row. At most one open lead per customer. | Must | Unit (rules) + manual |
| DEMO-24 | Properties: project cards with filters and search; a detail page with a gallery (generated placeholder images), brochure list and units table; "Share into chat" sends a property card message into a chosen conversation (subject to DEMO-13, DEMO-20). Upload accepts JPG/PNG up to 5 MB and PDF up to 10 MB, kept for the session only and labelled so. | Must | Unit (share, upload rules) + manual |
| DEMO-25 | Follow-ups: tabs Overdue (red), Today, Upcoming, Done; create, edit and complete. "Run now (test)" sends the follow-up's test auto-reply once; a second run of the same follow-up sends nothing and says "Already sent". | Must | Unit |

**Campaigns, users, reports, audit, home**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-26 | Campaign wizard: Upload CSV → Segment → Message → Preview & confirm → Progress. Rows are validated (phone format, duplicates); with "Test numbers only" on (default) any number outside `+1 202 555 01xx` is rejected; opted-out numbers are always skipped. Every rejected or skipped row shows its reason. There is no "send to everyone now" button. | Must | Unit |
| DEMO-27 | Progress sends one message every ~2 s (simulated), with Pause and Resume; the counts (sent, skipped, failed) and the recipient table update live. Campaign actions write audit rows. | Must | Unit |
| DEMO-28 | Opt-out list: add and remove numbers; a customer message "STOP" adds the number automatically. | Should | Unit |
| DEMO-29 | Users (Super Admin, Manager): table, add user, change role, deactivate with "History is kept". A Manager cannot create, promote to or change a Super Admin. A deactivated user's chats and leads become unassigned; their past messages keep their name. | Must | Unit |
| DEMO-30 | Dashboard and reports: number cards (open chats, unassigned, new leads, overdue follow-ups, converted this month) and a per-employee table (chats, replies, leads by stage, follow-ups done), with date-range and employee filters, and "Export CSV" downloading exactly the rows shown. Reports are tables; the dashboard's charts are DEMO-35 (Decision 36). | Must | Unit (CSV) + manual |
| DEMO-31 | Audit log (Super Admin, Manager): read-only table, newest first, filters by actor, action and date. There is no edit or delete. | Must | Unit |
| DEMO-32 | Employee home: my unread chats, my follow-ups today and overdue, my leads by stage. | Must | Manual |

**Verification**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-33 | Manual walk-through in the browser of the 7-step final demo (`docs/plan/project-summary.md`) as Super Admin, Manager and Employee in two windows, including every state listed under "States to cover" in design prompt Part E. | Must | Manual |
| DEMO-34 | `pnpm --filter @crm/web build:demo` produces a static site that runs with `preview:demo` and from a plain static server (deep links work). | Should | Manual |

**Dashboard charts and dark theme (phase 6, added 2026-11-26)**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| DEMO-35 | The Super Admin and Manager dashboard shows charts drawn only from the demo data: a greeting with today's date; number cards (open chats with new chats per day for 7 days as a sparkline, unassigned chats, New leads with leads created this month against last month, converted this month against last month); new chats per day for 14 days as bars with each day's count; leads by stage as a donut with a legend; team workload (each active Employee's open and pending chats) as stacked bars; follow-ups as overdue, today, upcoming and done; each campaign's sent, skipped, failed and pending recipients; and tiles linking unassigned chats (with how many wait for a reply) to the inbox and overdue follow-ups to Follow-ups. Every chart has text labels or a legend, so nothing depends on colour alone. | Must | Unit (pure rules) + manual |
| DEMO-36 | Demo mode uses a dark theme on every screen (shell, sidebar with icons, banner, pages, drawers, dialogs, toasts). Body text, status tags and "Simulated" labels stay readable (WCAG AA contrast), and keyboard focus stays visible. Live mode is unchanged. | Must | Manual |

## Contracts touched

- `packages/shared/src/crm.ts` (new, draft for INB/LEAD/PROP/FUP/CAMP/USR/RPT/AUD; types only):
  - `ConversationStatus` (`open | pending | closed`), `InboxConversation` = `ConversationSummary` + `status`, `assignee` (`MessageSender | null`), `unreadCount`, `leadId`, `leadStage`.
  - `InboxItem`: a message (`MessageView`), an internal note (`NoteView`), or a property card (`PropertyCardMessage`).
  - `LeadStage` (7 values, Decision 7), `LeadView`, `LeadHistoryEntry`.
  - `ProjectView`, `UnitView`, `MediaFile`.
  - `FollowUpView` (`dueAt`, `doneAt`, `autoReply`, `sentAt`).
  - `CampaignView`, `CampaignRecipient` (status `pending | sent | skipped | failed`, `reason`), `OptOut`.
  - `UserView` (`id`, `name`, `email`, `role`, `active`).
  - `AuditEntry` (`actor`, `action`, `target`, `at`, `detail`).
  - `ReplyLock` (`conversationId`, `holder`, `expiresAt`).
- Reused unchanged: `SessionUser`, `Role`, `MessageView`, `ConversationSummary`, `MessageStatusUpdate`, `nextStatus`, `MAX_TEXT_LENGTH`, `WaState`, `WaQr`, `ApiError`.
- `apps/web/src/demo/api.ts`: one exported function per future route (e.g. `listConversations`, `sendMessage`, `assignConversation`, `updateLead`, `shareProperty`, `runFollowUp`, `createCampaign`, `deactivateUser`, `listAudit`). Errors use `ApiError` codes: `invalid_credentials`, `forbidden`, `not_found`, `invalid_body`, `wa_not_connected`, `reply_locked`, `already_sent`.
- The demo bus emits the real event names (`wa.state`, `wa.qr`, `message.created`, `message.status`, `conversation.updated`) plus drafts `lock.changed`, `lead.updated`, `campaign.progress`.

## Edge cases

- A send while WhatsApp drops between queue and "send": the message ends `failed` (`wa_not_connected`), never `sent`.
- A status update for a message already `read` or `failed` changes nothing (`nextStatus`).
- Two windows (two tabs) logged in as different users share one `localStorage`: a change in one tab reaches the other through the `storage` event, so the "two people, one chat" demo works in one browser.
- The reply lock expires after 60 s without typing; the holder logging out releases it.
- Reassigning a chat away from an Employee while they have it open: their view says "This chat was reassigned" and the composer locks.
- A CSV with a header only, an empty file, a file over 1,000 rows (rejected), Windows line endings, quoted commas.
- Deactivating the last active Super Admin is refused.
- A corrupted or older `localStorage` value: replaced by the seed (DEMO-05).

## Manual check

1. `pnpm --filter @crm/web dev:demo`, open http://localhost:5174 in two windows. Check the network tab shows no api calls (DEMO-01).
2. Window A: Super Admin. WhatsApp page: watch the QR refresh, "Simulate scan", see every banner go green. "Log out WhatsApp" → confirm → QR again; scan again.
3. Window B: Employee Priya. Demo controls → simulate a customer message to a chat assigned to Priya: toast, unread badge, chat at top.
4. A assigns a new enquiry to Priya; it appears in B. B types: A sees "Priya is replying…" and cannot send; A takes over.
5. B replies: ticks clock → ✓ → ✓✓ → blue; a note stays yellow and unsent. Send to the failing contact: Failed + Retry.
6. B moves the lead through stages; history shows each change. Share Green Valley Residency into the chat.
7. Follow-ups: Run now (test) twice; second says "Already sent". Drop connection: banner amber, Send disabled, back after ~8 s.
8. A: campaign wizard with a CSV mixing test, non-test, duplicate and opted-out numbers; check reasons; pause and resume.
9. A: Users: deactivate Karan; his chats become unassigned, his messages keep his name. Reports: filter and export CSV. Audit log shows every step above.
10. As Employee, open `/users` by URL: no-access page. `build:demo` and `preview:demo`: deep link to `/leads` works.

## Manual check results (2026-11-26, headless Chrome against `build:demo`)

| ID | Result |
| --- | --- |
| DEMO-02 | Pass. A sweep of every page for Super Admin, Manager and Employee at 1280 × 800: the top bar has "Demo · simulated" and the banner "Simulated" on every page, including no-access and not-found. |
| DEMO-14 | Pass. Three columns; Open/Pending/Closed with counts; Unassigned/Mine/All for staff, none for Employees; rows with name or phone, preview, time, unread badge, assignee and stage chip. |
| DEMO-21 | Pass. "Sent from phone" (Siddharth Rao), "Unsupported message (image)" (+1 202 555 0113), day separators and the "New messages" divider seen in screenshots. |
| DEMO-32 | Pass. Priya's home: her unread chats, today's and overdue follow-ups, her leads by stage. |
| DEMO-34 | Pass. `build:demo` writes `404.html` and `_redirects`. Deep links (`/leads/<id>`, `/campaigns/opt-outs`, `/properties/<id>`) open on `preview:demo` and on a plain static server that serves files and `404.html` only (GitHub Pages behaviour). |
| DEMO-33 | Waiting for the user. A scripted run of the README walk-through in two tabs (Neha, Priya) passed steps 1 to 4 and 6; steps 5 and 7 were checked in phase 4. |
| DEMO-35 | Waiting for phase 6's check. |
| DEMO-36 | Waiting for phase 6's check. |

## Proposed changes

- **CLAUDE.md "Hard rules" and "Priorities"** (on approval): add "Demo mode (`VITE_DEMO=1`) is a labelled simulation for the prototype: its ticks, QR and messages are simulated and the UI says so. Live mode keeps the real rules (never fake ticks; QR, live inbox and replies must really work)."
- **MSG-28** stays open; it can still be run on the live stack at any time.
- **Later real specs** (INB, LEAD, …) start from the draft contracts in `crm.ts` and the demo api's function list.

## Decisions

1. The user's choices (2026-11-26): mock mode in the web app (not dummy routes on the api, not a hybrid); a light spec with smoke tests (unit tests for the demo api and pure rules, screens checked by hand); react-router plus plain CSS with hand-made components; live activity by Demo controls buttons plus auto activity (~45 s, can be turned off), data in `localStorage` with a reset.
2. The flag is build-time (`import.meta.env.VITE_DEMO`), so a demo build contains no live api calls and a live build contains no demo code paths in use.
3. Live mode keeps today's pages. Putting the new screens on the live api would need the INB and later routes, which do not exist; mixing real and dummy data in one screen would confuse a reviewer.
4. Shapes come from `@crm/shared`: the demo reuses the MSG schemas and adds draft ones in `crm.ts`. The demo store parses every stored record on load.
5. The demo api is async with a 150–400 ms random delay, so loading states are real and the later swap to `fetch` keeps the same call sites.
6. The demo api is the "server" of demo mode: every function takes the session user and checks the role, the Employee scope and the reply lock itself, with the same rules a real route will have. The UI only hides what the demo api would refuse.
7. Lead stages are placeholders until the LEAD spec: New, Contacted, Qualified, Site visit, Negotiation, Converted, Lost. Shown in Decisions and the README as placeholders (CLAUDE.md open item).
8. Reply lock placeholders: 60 s, renewed while typing; Managers and the Super Admin can take over. Closing a chat does not close its lead (placeholder).
9. Prices in Indian rupees (₹, lakh/crore display), matching the Indian names in the dataset.
10. Dummy numbers come only from `+1 202 555 0100`–`0199` (design prompt Part F), not the `+1999…` range the MSG tests use.
11. Routing: `BrowserRouter`. `preview:demo` serves deep links; a static host needs a fallback to `index.html` (a `_redirects`/`404.html` copy is added with DEMO-34).
12. Placeholder images are generated in the browser (SVG gradients with the project name), so the demo needs no network and no image files.

13. Open points settled as recommended with the approval: placeholder lead stages (Decision 7); 60 s reply lock with Manager and Super Admin take-over (Decision 8); no public hosting in this spec; live mode keeps today's pages (Decision 3).
14. Phase 1: the mode is `import.meta.env.MODE === 'demo'` (from `vite --mode demo`) or `VITE_DEMO=1`, checked by `isDemoMode` in `apps/web/src/mode.ts`. A `.env.demo` file was not used because `.gitignore` ignores `.env.*`. `main.tsx` loads either the demo entry or the live app with a dynamic import, so only one of them runs; the build still emits both chunks.
15. Phase 1: `apps/web` now depends on `zod` (4.6.7, the version `@crm/shared` pins) for the demo store schema, and on `react-router` 8.5.3.
16. Phase 1: the demo api keeps the logged-in user's id in `sessionStorage` (`crm-demo-session`), the data in `localStorage` (`crm-demo-v1`), and sends live events to the other tabs through a `BroadcastChannel` (`crm-demo`); the `storage` event reloads the store in the other tabs.
17. Phase 1: ids in the seed are fixed v4 UUIDs (`demoId(kind, n)`), so a reset gives the same ids and links stay valid. Runtime rows use `crypto.randomUUID()`.
18. Phase 1: the eslint ignores and `.prettierignore` gained `.agents/`, `.aider-desk/` and `skills-lock.json`, local AI-tool files that appeared in the working tree on 2026-11-26 (not created by this build, not committed). Without the ignores `pnpm lint` and `format:check` fail on them.
19. Phase 2: simulated work that happens later (QR refresh, connect, reconnect, ticks, a simulated agent's reply) is stored as tasks in the demo data (`sim.tasks`), not as browser timers. Every open tab runs the simulator (`sim.ts`, every 500 ms); a store write takes the due tasks out of the newest saved copy and runs them in one synchronous step, so a task runs once however many tabs are open. A first version let only one tab run the simulator (a Web Lock); it was dropped because Chrome throttles timers in hidden tabs, so ticks froze when the leader tab was in the background. Only a visible tab starts an auto enquiry, so two tabs do not both send one.
20. Phase 2: sending a message releases the sender's reply lock (the lock means "is typing a reply"). Typing renews it at most every 5 s; it expires 60 s after the last renewal; logging out or losing the chat (reassignment) releases it. Notes need neither the lock nor a connection.
21. Phase 2: cross-tab sync. The store remembers the saved text it last read; `sync()` reloads only when the saved text differs. Every demo api call syncs first, the simulator syncs before each round, and each tab also syncs on the `storage` event and every 1 s (headless Chrome did not always deliver the `storage` event to background tabs). A write always starts from the newest saved copy and, when a change throws half way, drops the in-memory copy.
22. Phase 2: Retry on a failed message sends a new message with the same text (and property card); the failed one stays failed, so status only moves forward. Assigning a chat also moves its open lead to the new owner (with a history row), and a reply to a closed chat reopens it; a customer whose leads are all closed gets a new New lead. A STOP message adds the number to the opt-out list (DEMO-28's automatic part).
23. Phase 2: errors from actions show as toasts; a new customer message the user may see shows a toast with "Open chat" unless that chat is open. New error code `wrong_state` (409) for actions in the wrong connection or message state.
24. Phase 3: changing a lead's owner also assigns its chat while the lead is open (and assigning a chat moves its open lead, Decision 22), so an Employee always owns both or neither. Moving a closed lead back to an open stage is refused (`wrong_state`) when the customer already has another open lead.
25. Phase 3: "Run now (test)" sends the auto-reply into the lead's chat as an outbound message whose sender reads "<owner> · auto-reply (test)", sets `sentAt`, and writes a `followup.sent` audit row; a second run answers `already_sent`. It obeys the same send rules as a reply (connection, reply lock). A sent auto-reply can no longer be edited. Running does not complete the follow-up; "Complete" does.
26. Phase 3: uploads are checked in the page and again in the demo api (`uploadProblem`: JPG/PNG up to 5 MB, PDF up to 10 MB, not empty). The file becomes an object URL held in the demo api's memory for that tab (`sessionMedia`), never in `localStorage`, and is tagged "Session only". Only Managers and the Super Admin can upload. Seeded brochures are tagged "Demo file" and do not download.
27. Phase 3: lead budgets are typed in lakh (₹ L) and stored in whole rupees. Follow-up tabs: Done (has `doneAt`), Overdue (due before now), Today (later today, local time), Upcoming. `FollowUpInput` joins the draft contracts in `packages/shared/src/crm.ts`.
28. Phase 3: toasts moved to the bottom left, beside the sidebar, after the top right covered page buttons and the bottom right covered Send.
29. Phase 4: campaign sending is a stored task (`campaign_step`, every 2 s) like the ticks, with one chain per campaign (a resume removes any waiting step first). Each step re-checks the opt-out list; while WhatsApp is down the campaign waits instead of failing recipients. Campaign messages are recorded on the campaign only; they do not create inbox messages, because a conversation exists only after the contact writes first (MSG Decision 13). The wizard checks rows as you go; `createCampaign` checks them again and refuses a list with nothing to send. The confirm step needs a tick ("every contact agreed") and there is no send-to-everyone button.
30. Phase 4: CSV rules (`campaigns.ts`): a `phone` column is required, `name` and other columns optional (other columns feed the Segment step), at most 1,000 rows, quoted fields and CRLF handled, a BOM ignored. Phones are normalised (spaces, brackets, dashes; `00` → `+`) and must be E.164. Skip reasons in order: invalid number, duplicate, not a test number (while "Test numbers only" is on, the default), opted out. A sample file ("Use the sample file") has one row of each problem for the walk-through.
31. Phase 4: users. New users log in with the demo password. A Manager cannot create, promote to, change or deactivate a Super Admin; nobody changes their own role or deactivates themself; the last active Super Admin cannot be deactivated. Deactivation unassigns the user's open chats and open leads (with lead history rows), drops their locks, and ends their session: every tab re-checks the session on each store change and goes to the login page (checked with two tabs).
32. Phase 4: reports. The dashboard counts open chats, unassigned open or pending chats, New leads, overdue follow-ups and leads converted this calendar month. The per-employee report lists Employees (deactivated ones only with activity in the range); the date range applies to replies sent, follow-ups done and the stage counts (by the lead's last update); chats assigned and open leads are current. The CSV holds exactly the rows shown. The audit log is read-only: the demo api has `listAudit` and nothing else for audit.
33. Phase 5: `build:demo` runs `scripts/static-fallback.mjs` after the build, copying `index.html` to `404.html` and writing `_redirects`, so deep links work on GitHub Pages (root domain) and Netlify. The build uses absolute `/assets/` paths; a sub-path host needs `--base`. Publishing is not part of this spec.
34. Phase 5: polish from a sweep of every page per role at 1280 px and a scripted run of the README walk-through: inputs and long file names no longer widen the lead and property detail columns; the tab title and icon are set for demo mode (the live `index.html` is unchanged); "Reset demo data" is also on the login page; the Demo controls drawer closes after "Send as customer" so the new chat is visible.
35. Phase 5: a new bus event `conversation.assigned` gives the new assignee a "<name> assigned you a chat" toast (assignment from the inbox, or from a lead's owner). An event from another tab now syncs the store before it is delivered (`DemoBus.onRemote`), so the list updates together with the toast instead of up to a second later.
36. Phase 6 (2026-11-26, the user's request "redesign the super admin dashboard … take inspiration from this image", then "use graphs and charts and colours in the dashboard"): the dashboard gets charts; DEMO-30's "Tables, no charts" now applies to Reports only. Charts are hand-drawn SVG and CSS (no chart library, no new package). Month comparisons show the difference in counts ("+2 vs last month"), never a percentage, so a zero last month gives no division and no invented trend. Numbers that are current state (open, unassigned, workload) have no history in the demo data, so they get no change chip.
37. Phase 6: the dark theme is one set of CSS variables in `demo.css` (`:root` tokens), loaded only by the demo entry, so live mode keeps its look. Status colours keep their meaning (green ok, amber warning, red error, blue info, grey for Simulated and Test); chart colours avoid violet. The style follows the user's reference image (dark cards, one highlighted card, coloured headers) and the `design-taste-frontend` skill's rules that fit an app screen (one card style, one radius scale, equal edges, hover lift and press, one entrance, no scroll fades); its website rules (hero, photographs, effects, finish gate) do not apply to a CRM screen and were not used.
38. Phase 6: the login page (DEMO-06) follows the user's second reference image: one rounded frame with a flat Skyline artwork (waves, towers, chat bubbles; `login-art.tsx`, decorative SVG) on the left and an amber card on the right. The reference's "Remember me" and social sign-up are left out because they would be controls that do nothing; the demo accounts take the social buttons' place as one-click buttons, "Forgot password?" shows the demo password, and the eye button really shows the password. Login logic is unchanged.

## Build phases

Same routine as before: at the end of each phase run the gate (typecheck, lint, test, traceability, format:check), update CLAUDE.md and the docs, make one local commit, and stop for the user's "next" (or go on if the user asks for several phases in one go).

1. Approve the spec. Install `react-router` (exact pin). Draft contracts in `crm.ts`, `it.todo` for every DEMO criterion, the mode switch, dataset and store, the demo api core (auth, roles, scope), the bus, the router, shell, sidebar, login and no-access page (DEMO-01 to DEMO-10).
2. Simulated WhatsApp and the inbox: QR state machine, banner, Demo controls, chat list, chat panel, notes, assign/status, reply lock, ticks, simulated customers (DEMO-11 to DEMO-22).
3. Leads, properties (with share and upload), follow-ups (DEMO-23 to DEMO-25).
4. Campaigns and opt-outs, users, dashboard and reports with CSV, audit log, Employee home (DEMO-26 to DEMO-32).
5. States and polish, static build, README "Demo mode" section, the manual walk-through with the user (DEMO-33, DEMO-34).
6. Dashboard charts and dark theme (DEMO-35, DEMO-36), added 2026-11-26 at the user's request.

Timing: the deadline is 2026-11-27. Phases 1 and 2 are the core of the demo; if time runs short, phase 4's Should items and DEMO-34 go first.

## Open points for review

1. **Lead stage names** (Decision 7): keep the placeholders, or give the real five middle stages now?
2. **Reply lock** (Decision 8): 60 s and Manager take-over, as placeholders?
3. **Hosting**: should the demo build be put on a public static host (Vercel, Netlify, GitHub Pages) for the reviewers? That is outward-facing and needs a remote; not part of this spec unless you say so.
4. **Live mode**: keep today's pages (Decision 3), or should the live app also get the new shell with "Demo only" placeholders for unbuilt modules?
