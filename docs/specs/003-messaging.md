Status: approved

Drafted and approved 2026-11-25 (session 8). The user's "approved" accepted the draft with Decisions 5 to 16 and the recommended answer to each open point (Decision 17).

Build: all 5 phases built. Every criterion except the manual MSG-28 (real phone) and the browser part of MSG-24 has passing tests. MSG closes after the MSG-28 phone check with the user. The user asked for phases 2 to 5 in one go, with a commit per phase.

# Spec 3: Messages (MSG)

Receiving and sending WhatsApp text messages: the provider interface's message part in both adapters, inbound storage with dedupe, outbound sending through a BullMQ queue, forward-only message status, live push, and a minimal messages page.

## Goal

After this spec is built, a customer messages the test number from a phone and the message appears live in the CRM for the Super Admin and Managers. One of them replies in the CRM, the reply goes through the queue, and it arrives on the phone as a normal WhatsApp message. Its ticks (sent, delivered, read) change only when WhatsApp reports them. The same WhatsApp message is never stored twice, a send job never sends twice when it runs twice, and a message typed on the company phone itself shows as "Sent from phone". This closes the Phase 1 checkpoint ("message in, reply out, restart still connected").

## Scope

- The provider interface's message part (`packages/shared`, types only): `sendText`, and two new provider events, an inbound message and a status report.
- Both adapters: the Fake (controllable from tests) and Baileys (text in and out, status receipts, phone-number normalisation).
- The worker's inbound handler: filter, normalise, upsert Contact and Conversation, insert Message (unique provider message ID), publish.
- The worker's send processor: the BullMQ `outbound-message` queue, run only by the lock holder, with retries and an idempotent "send only if still queued" check.
- The forward-only status rule (`nextStatus`, one pure function in `packages/shared`) and the worker's status handler.
- Api routes to list conversations, list a conversation's messages, and send a text message.
- The socket events `message.created`, `message.status` and `conversation.updated`, pushed to `inbox:all` only.
- A migration that adds the columns MSG needs to the existing `contacts`, `conversations` and `messages` tables (FND created them with minimal columns, FND Decision 2).
- A minimal messages page in `apps/web` for the Super Admin and Managers: conversation list, message list, text box, ticks.

## Out of scope

- Media in either direction: images, documents, audio, video, stickers (Decision 2). MSG stores them as "unsupported" so no customer message is silently lost (MSG-05). Sending media is PROP ("share a property"); receiving and downloading media is a later spec.
- Assignment, conversation states (open, pending, closed), unread counts, internal notes, and the reply lock (INB). The send endpoint has no reply-lock check in MSG; INB adds it before Employees can send (Proposed changes).
- Employee access to conversations (INB scopes it by assignment). In MSG, Employees get 403 on every message route and receive no message events.
- Lead auto-creation on a new enquiry (LEAD).
- Audit rows for messages (AUD decides if any are needed).
- Marking customer messages as read on WhatsApp (sending blue ticks to the customer).
- Starting a new conversation from the CRM. A conversation exists only after the contact has written first (Decision 13).
- Reactions, edits, deletions, replies-with-quote rendering, forwarded-message labels, polls, calls, and WhatsApp's history sync of older chats.
- Search, pagination beyond the last 100 messages, and a router (INB adds the full inbox UI).
- The Socket.io Redis adapter for more than one api instance.

## Acceptance criteria

IDs are `MSG-NN` and are never reused. "Test level" also states how it is verified. Test titles start with the criterion ID, e.g. `MSG-03 the same provider message delivered twice is stored once`.

**Inbound**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| MSG-01 | An inbound text from a number with no Contact creates one Contact (phone in E.164, `name` from the WhatsApp profile name when there is one), one Conversation, and one `INBOUND` `TEXT` Message holding the body, the provider message ID and the WhatsApp timestamp as `at`. The Conversation's `lastMessageAt` is that timestamp. | Must | Worker test |
| MSG-02 | A later message from the same number reuses its Contact and Conversation, and moves `lastMessageAt` forward (never backward: an older message arriving late leaves it unchanged). A Contact's existing `name` is never overwritten by the profile name. | Must | Worker test |
| MSG-03 | The same provider message reported twice, one after the other or at the same moment, is stored once and published once. The second report is treated as already processed, not as an error. | Must | Worker test |
| MSG-04 | Messages from groups, broadcast lists, status updates and channels, and messages whose sender phone number cannot be determined, store nothing and publish nothing. The worker logs one line per skipped message giving the reason only, never a number or text. | Must | Worker test |
| MSG-05 | An inbound image, video, audio, document, sticker, location or contact card is stored as an `UNSUPPORTED` Message with its kind (for example `image`) and no body, and is published like a text. Reactions, edits, deletions and other protocol messages store nothing. | Should | Worker test |
| MSG-06 | A message typed on the company phone itself (reported with the from-me flag, not sent through the CRM) is stored as `OUTBOUND` with no sender, with the status the provider reports, and the page labels it "Sent from phone". | Must | Worker test + Manual |
| MSG-07 | The worker handles provider messages and statuses only while it holds `wa:lock`, and only from its current connection. A standby worker, or an event from an older connection, stores nothing and publishes nothing. | Must | Worker test |

**Read and send over the api**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| MSG-08 | `GET /conversations` (`inbox.read`) returns conversations ordered by `lastMessageAt`, newest first, each with the contact's phone and name and a preview of the last message. `GET /conversations/:id/messages` (`inbox.read`) returns that conversation's last 100 messages, oldest first by `at`. An unknown or malformed id gives 404 `not_found`. | Must | Integration test |
| MSG-09 | `POST /conversations/:id/messages` (`messages.send`) with `{ text }` stores an `OUTBOUND` `TEXT` Message with status `queued` and the sender's user id, adds an `outbound-message` job whose job id is the message id, pushes `message.created`, and returns 202 with the message. The Message is written before the job is added. | Must | Integration test |
| MSG-10 | A send with text that is empty or only whitespace, longer than 4096 characters, or a body with unknown fields gets 400 `invalid_request`. An unknown conversation gets 404 `not_found`. In each case nothing is stored and nothing is queued. | Must | Integration test |
| MSG-11 | A send while `wa:state` is anything but `connected` (including a missing key, `worker_offline`) gets 503 `wa_not_connected`, and nothing is stored or queued. | Must | Integration test |
| MSG-12 | An Employee gets 403 `forbidden` on all three routes, and nothing is stored or queued. The Super Admin and Managers are allowed. | Must | Integration test |
| MSG-13 | A send that repeats a `clientId` already used in that conversation returns 200 with the existing message, and stores and queues nothing new. | Should | Integration test |

**Sending in the worker**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| MSG-14 | The send job calls the provider's `sendText` with the contact's phone and the text, saves the returned provider message ID, sets the status to `sent`, and publishes `message.status`. | Must | Worker test |
| MSG-15 | A job whose message is not `queued` (already `sent` or `failed`, or deleted) calls `sendText` zero times. Running the same job twice sends once. | Must | Worker test |
| MSG-16 | When `sendText` throws or WhatsApp is not connected, the job is retried, 3 attempts in all, with exponential backoff. After the last attempt the message is `failed` with a reason (`wa_not_connected` or `provider_error`) and `message.status` is published. An attempt that is retried publishes nothing. | Must | Worker test |
| MSG-17 | A CRM-sent message is stored once, even when the provider also reports it back as a from-me message. | Must | Worker test + Manual |
| MSG-18 | Only the worker holding `wa:lock` takes send jobs. A standby takes none. When the holder is killed with a job queued, the next holder sends it once, after the lock takeover. | Should | Worker test |
| MSG-19 | Send jobs run one at a time, so two messages queued for one conversation reach the provider in the order they were queued. | Should | Worker test |

**Status**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| MSG-20 | `nextStatus(current, reported)` in `packages/shared` implements the forward-only table under Contracts: it returns the new status or "no change", for every pair of current status and reported status. | Must | Unit test |
| MSG-21 | A provider status report for a known outbound message applies `nextStatus`. When the status changes, the new status and its time are stored and `message.status` is published; otherwise nothing is written or published. A report for an unknown provider message ID, or for an inbound message, changes nothing and publishes nothing. | Must | Worker test |
| MSG-22 | The CRM never sets `delivered` or `read` itself: those only come from a provider status report. The Fake in `pnpm dev` reports no `delivered` or `read`, so a dev send stays at `sent`. | Must | Worker test |

**Live push and the page**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| MSG-23 | The api pushes `message.created`, `message.status` and `conversation.updated` to `inbox:all` only. With one connected client per role, the Super Admin and the Manager receive each event once, and the Employee receives none. | Must | Socket test |
| MSG-24 | The messages page (Super Admin and Managers) lists conversations and shows the chosen conversation's messages, both updating live. Each outbound message shows its sender's name, or "Sent from phone"; its tick comes only from its status (`queued` clock, `sent` one tick, `delivered` two ticks, `read` two blue ticks, `failed` a marker with the reason). An unsupported message shows "Unsupported message (kind)". The text box sends with Enter and shows a send error in place. | Must | Unit test (labels and ticks) + Manual |
| MSG-25 | A failed message offers "Resend", which sends its text as a new message. The failed one stays as it was. | Should | Unit test + Manual |
| MSG-26 | No api or worker log line contains a message body or a full phone number. | Should | Worker test + Integration test |

**Baileys and the phone**

| ID | Criterion | Priority | Test level |
| --- | --- | --- | --- |
| MSG-27 | The Baileys adapter's pure helpers are unit tested: a jid to E.164 (a phone jid, a jid with a device suffix, a LID jid with a phone alternative, a LID jid with no known phone, which gives none); group, broadcast, status and channel jids are skipped; message content to text, unsupported kind, or skip; Baileys status codes to `sent`, `delivered`, `read` or `failed`. | Must | Unit test |
| MSG-28 | With the real test phone and `WHATSAPP_PROVIDER=baileys`: a message from the phone appears on the messages page within a few seconds; a reply from the CRM arrives on the phone once; its ticks follow the phone (delivered when the phone is online, read when the chat is opened with read receipts on); a message typed on the company phone shows as "Sent from phone"; restarting the stack with a message queued sends it once, and no message is shown twice after the restart. | Must | Manual |

Priority: Must (blocks the checkpoint), Should (do in the phase if time allows), Could (only if trivial).

## Contracts touched

Types only, written before the tests (MSG phase 1).

- Zod in a new `packages/shared/src/messages.ts`:
  - `MessageDirection`: `inbound`, `outbound`. `MessageType`: `text`, `unsupported`.
  - `MessageStatus`: `queued`, `sent`, `delivered`, `read`, `failed`. `ReportedStatus` (what a provider may report): `sent`, `delivered`, `read`, `failed`.
  - `MessageFailureReason`: `wa_not_connected`, `provider_error`, `reported_failed`.
  - `SendMessageRequest`: `{ text, clientId? }`, strict. `text` is trimmed, 1 to 4096 characters; `clientId` is a UUID.
  - `MessageView`: `{ v: 1, id, conversationId, direction, type, body, unsupportedKind, status, failureReason, sender: { id, name } | null, at }`. `status` is null for inbound. "Sent from phone" is `direction = outbound` with `sender = null`.
  - `ConversationSummary`: `{ v: 1, id, contact: { id, phone, name }, lastMessageAt, lastMessage: MessageView | null }`.
  - `MessageStatusUpdate`: `{ v: 1, messageId, conversationId, status, failureReason, at }`.
  - `OutboundMessageJob`: `{ v: 1, messageId }`. `QUEUES.outboundMessage = 'outbound-message'`.
  - `nextStatus(current: MessageStatus, reported: ReportedStatus): MessageStatus | null` (null means no change):

    | Reported → / Current ↓ | `sent` | `delivered` | `read` | `failed` |
    | --- | --- | --- | --- | --- |
    | `queued` | `sent` | `delivered` | `read` | `failed` |
    | `sent` | no change | `delivered` | `read` | `failed` |
    | `delivered` | no change | no change | `read` | no change |
    | `read` | no change | no change | no change | no change |
    | `failed` | no change | no change | no change | no change |

    A report that skips a step (for example `read` while `sent`) is applied, because a missed receipt must not hold back a later one. `failed` after `delivered` is ignored: the message did reach the phone.
- `CrmEvent` (`packages/shared/src/wa.ts`) gains `message.created` (`MessageView`), `message.status` (`MessageStatusUpdate`) and `conversation.updated` (`ConversationSummary`).
- Provider interface (`packages/shared/src/wa.ts`, types only):
  - `ProviderEvent` gains `{ type: 'message', message: ProviderInboundMessage }` and `{ type: 'status', providerMessageId, status: ReportedStatus, at: Date }` (Decision 5).
  - `ProviderInboundMessage`: `{ providerMessageId, from (E.164), fromMe, profileName?, content: { kind: 'text', text } | { kind: 'unsupported', unsupportedKind }, at: Date }`. Messages the adapter skips (MSG-04, the ignored part of MSG-05) never become events; the adapter reports only a skip reason, for the log.
  - `WhatsAppProvider` gains `sendText(to: string, text: string): Promise<{ providerMessageId: string; at: Date }>`. It rejects when there is no open connection.
- Permissions (`packages/shared/src/auth.ts`): `inbox.read` and `messages.send`, for the Super Admin and Managers (Decision 8). INB extends them to Employees, scoped to their assigned conversations.
- Routes: `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`. New `ApiError` code `wa_not_connected`.
- Socket: typed server-to-client events `message.created`, `message.status` and `conversation.updated` on `CrmServer`.
- Prisma migration `msg-core` (adds columns and enums, drops nothing):
  - `Message` gains `type` (enum `TEXT` | `UNSUPPORTED`), `body` (text, nullable), `unsupportedKind` (nullable), `status` (enum `QUEUED` | `SENT` | `DELIVERED` | `READ` | `FAILED`, nullable; null for inbound), `failureReason` (nullable), `statusAt` (nullable), `sentById` (nullable, references `users`), `clientId` (UUID, nullable), `at` (the WhatsApp timestamp for messages that came from WhatsApp, the queue time for CRM sends), `createdAt`. Unique (`conversationId`, `clientId`). Index (`conversationId`, `at`).
  - `Conversation` gains `lastMessageAt` (nullable) and `createdAt`. Index on `lastMessageAt`.
  - `Contact` gains `createdAt`.
- Queue: BullMQ `outbound-message`, job id = message id, 3 attempts, exponential backoff with a 2 s base (Decision 11). No new env variables: the worker's attempt count and backoff are constants that tests override through the worker's config, like the WA timings.
- Package: `bullmq`, exact version, in `@crm/api` and `@crm/worker` (Decision 9).

## Edge cases

- MSG-03: two reports of one message race; the unique index on `provider_message_id` decides, and the losing insert is caught and treated as "already stored". A transaction never leaves a Contact or Conversation half made: Contact and Conversation are upserts, so a retry finds them.
- MSG-01 and MSG-02: the first two messages from a new number arrive at the same moment. Both upserts succeed and there is still one Contact and one Conversation (unique `phone`, unique `contactId`).
- MSG-02: a message arrives with a WhatsApp timestamp older than the newest stored one (late delivery after a reconnect). It is stored in its `at` place, and `lastMessageAt` does not move backward.
- MSG-04: Baileys 7 can address a sender by LID instead of phone number. The adapter uses the phone alternative WhatsApp sends with the message, then Baileys' LID-to-phone mapping; with neither, the message is skipped (MSG-27). A phone number is never invented.
- MSG-06 and MSG-17: from-me messages come both from the company phone and, as an echo, from the CRM's own sends. The Baileys adapter does not echo its own sends (Decision 10), and the worker also treats a from-me message whose provider ID is already stored as already processed.
- MSG-09: the job is added after the Message is committed. If adding the job fails, the api marks the Message `failed` (`provider_error`), publishes `message.status`, and answers 503, so no `queued` message is left with no job.
- MSG-11: WhatsApp drops after the api's check but before the job runs. The job fails its attempts (MSG-16) and ends `failed` with `wa_not_connected`; the user can resend.
- MSG-15: a status report arrives for a message before its send job has saved the provider ID. It matches nothing and is ignored (MSG-21). Baileys sends the server receipt after the send call returns, so in practice the order is send, save, receipt.
- MSG-16: a crash after WhatsApp accepted the message but before the worker saved `sent` can send it again when BullMQ re-runs the stalled job (open point 1).
- MSG-18: BullMQ's stalled-job check returns a killed worker's active job to the queue; the next lock holder picks it up after its takeover (about 35 s, WA Decision 8, plus the stalled-check interval).
- MSG-21: `delivered` arrives after `read` (out of order) and is ignored. `sent` reported by WhatsApp's server receipt after the send call already set `sent` is "no change" and publishes nothing.
- MSG-23: an Employee socket never receives a message body, by event or by preview in `conversation.updated`.
- MSG-26: the Baileys logger stays silent (WA); the worker's skip and failure lines name only the reason and error name.
- Tests: worker tests use Redis db 2 and api tests db 1, so their BullMQ keys never meet the dev queue on db 0. No test adds, reads or removes a job on db 0 (WA Decision 43).

## Manual check

1. `pnpm migrate`, then `pnpm dev` with the Fake. Log in as the Manager, open the messages page: it is empty, the banner shows "Simulated". As Employee, there is no messages page, and `curl -b jar localhost:4000/conversations` gives 403.
2. Set `WHATSAPP_PROVIDER=baileys` and restart; the test number reconnects without a QR (WA-27).
3. From the test phone, send "hello" to the company number. It appears on the Manager's page within a few seconds, with the phone's profile name.
4. Reply from the CRM. The message shows the clock, then one tick; the phone receives it once; the ticks move to two, then blue when the chat is opened on the phone.
5. Type a message on the company phone itself to the test phone. It appears as "Sent from phone".
6. Stop the worker, send a reply (it gets 503, Not connected), start the worker. Send again and restart the stack before the tick appears; after the restart the message is on the phone once, and the page shows each message once.
7. Send a photo from the test phone. It shows as "Unsupported message (image)".

## Proposed changes

Changes to the plan's defaults or to earlier specs, for the user to accept at review.

| Default | Proposal | Trade-off |
| --- | --- | --- |
| CLAUDE.md and WA Decision 1: MSG adds `onMessage` and `onStatus` to the provider interface | Two new members of the existing `ProviderEvent` union, delivered through the same `onEvent` callback as `qr`, `open` and `close` (Decision 5). | One callback and one in-order queue in the connection manager; the generation check of WA Decision 21 covers message events too. |
| Data-flow plan §1: inbound also increments the unread count and creates a Lead | MSG stores and publishes only. Unread counts are INB, lead creation is LEAD. | INB and LEAD each add a step to the inbound handler. |
| Data-flow plan §2: the send endpoint allows the assignee and checks the reply lock | MSG allows only the Super Admin and Managers, with no reply-lock check. INB adds assignment, the Employee scope and the 409 lock check together, so an Employee can never send without the lock. | Employees cannot use messages until INB. |
| Data-flow plan §12: message events go to `inbox:all` and `user:<assignee>` | `inbox:all` only, because there is no assignee yet. INB adds the assignee rooms. | None until INB. |
| User's choice "MSG creates the conversation and contact tables" | FND already created the tables with minimal columns (FND Decision 2). MSG adds the columns it needs by migration. Assignee and state columns stay with INB. | — |

## Decisions

Taken with the user on 2026-11-25, before drafting:

1. Draft the MSG spec now, as a draft only: no contracts, tests or code.
2. Text only. Media in or out is not part of MSG; inbound media is stored as "unsupported" (MSG-05).
3. MSG owns the contact and conversation columns it needs (see Proposed changes for the exact meaning).
4. The plan's rule stands: never show a tick the provider did not report (MSG-22).

Proposed in this draft, to be accepted at review:

5. Provider events: `message` and `status` join `ProviderEvent`; `sendText` is a method. The Fake gains `receive(...)`, `report(providerMessageId, status)` and `failNextSends(n)`, and records each `sendText` call for tests.
6. The api pushes `message.created` for its own sends directly to the rooms, and relays the worker's events from the events channel. One function in the api picks the rooms for every `CrmEvent`, so both paths push to the same rooms (MSG-23).
7. Message ordering in the UI uses `at`: the WhatsApp timestamp for messages from WhatsApp, the queue time for CRM sends. A CRM send keeps its place even if WhatsApp's own timestamp is a second later.
8. `inbox.read` and `messages.send` go to the Super Admin and Managers only in MSG. Server-side, safe by default: the Employee scope arrives with assignment (INB).
9. Package pin: `bullmq` 6.7.5, exact (npm, checked 2026-11-25). npm's `latest` is 6.7.10, published 2026-11-24 together with 6.7.9; 6.7.5 (2026-11-11) is the newest release that is two weeks old. The worker's BullMQ connection uses `maxRetriesPerRequest: null`, as BullMQ requires.
10. Baileys socket options for MSG: `emitOwnEvents: false` (no echo of the CRM's own sends, MSG-17) and `syncFullHistory: false`; `messaging-history.set` is ignored. The adapter takes `messages.upsert` (both `notify` and `append`), `messages.update` for status, and relies on the unique provider ID for repeats.
11. Retry: 3 attempts, backoff 2 s then 4 s, so a failed send is reported in about 6 s. Concurrency 1 (MSG-19).
12. `sent` means WhatsApp's server accepted the message (the send call returned its ID), which is what one grey tick means on the phone. A later server receipt for `sent` is "no change".
13. No "test contacts only" block on replies. A conversation exists only after the contact wrote first, and MSG has no way to start one, so MSG cannot send an unsolicited message. The test-only switch stays a campaign guard (CMP).
14. The worker starts its BullMQ processor when it takes the lock and closes it before it releases or loses the lock (MSG-18), in the same order as WA Decision 21: stop taking work, then close WhatsApp.
15. The Fake in `pnpm dev` returns a simulated ID from `sendText` and reports nothing further, so a dev send stays at `sent` (MSG-22). There is no "simulate an incoming message" control in dev; inbound is checked with the real phone (open point 3).
16. Contact `name`: set from the WhatsApp profile name only when the Contact is created or has no name. Staff edits (a later spec) are never overwritten.

Made during MSG phase 1 (2026-11-25), within the approved build:

17. Approval and open points: the user's "approved" (2026-11-25) accepted the draft, Decisions 5 to 16 and the Proposed changes, and the recommendation on each open point: (1) the crash-between-send-and-save window is accepted and documented, no `sending` state; (2) Employees get no message access before INB; (3) no "Simulate incoming message" button. It also started phase 1, as the review message said it would.
18. `Message.type` defaults to `TEXT` and `Message.at`, `createdAt` and the new `createdAt` columns default to the current time. FND-05 inserts messages by raw SQL with only the FND columns, and the defaults keep those inserts valid. MSG code always sets `type` and `at` itself.
19. `messages.sent_by_id` references `users` with `ON DELETE RESTRICT` instead of Prisma's default `SET NULL`: deleting a sender must never turn their messages into "Sent from phone". Users are deactivated, not deleted. Tests that delete their users must delete those users' messages first.
20. `failureReason` is a Prisma enum (`WA_NOT_CONNECTED`, `PROVIDER_ERROR`, `REPORTED_FAILED`), mapped to the lower-case `MessageFailureReason`, like `MessageType` and `MessageStatus`.
21. Installed, exact: `bullmq` 6.7.5 in `@crm/api` and `@crm/worker`. Its dependencies are `tslib`, `semver`, `msgpackr`, `cron-parser` and `node-abort-controller`; `ioredis` is an optional peer (`>=5`), resolved to the project's 6.1.0. MIT licence.
22. Contracts are types only. `nextStatus` is declared as the `NextStatus` type; the function is written in phase 4 after its MSG-20 test. `sendText` was added to `WhatsAppProvider`, so both adapters have a placeholder that rejects with "not built yet" until phase 4 (Fake) and phase 5 (Baileys). The connection manager's event switch now names `close` explicitly and ignores `message` and `status` until phases 2 and 4.
23. The migration `20261125180408_msg-core` was generated with `prisma migrate diff --from-config-datasource --to-schema` against `crm_dev` (WA Decision 16). The SQL was reviewed: three enums, new columns on `contacts`, `conversations` and `messages`, two indexes, one unique index (`messages_conversation_id_client_id_key`) and the `sent_by_id` foreign key. It drops nothing. Applied to `crm_dev` with `pnpm migrate`; `crm_test` gets it from the test global setups.
24. Placeholders: `packages/shared/src/messages.test.ts` (MSG-20), `apps/worker/src/messages.test.ts` (MSG-01 to MSG-07, MSG-14 to MSG-19, MSG-21, MSG-22, worker MSG-26), `apps/worker/src/providers/baileys/baileys.test.ts` (MSG-27), `apps/api/src/messages.test.ts` (MSG-08 to MSG-13, MSG-23, api MSG-26), `apps/web/src/messages.test.ts` (MSG-24, MSG-25, MSG-28 manual).

Made during MSG phase 2 (2026-11-25), within the approved build:

25. A from-me message (typed on the company phone, MSG-06) is stored with status `sent`: it reached the CRM through WhatsApp's servers, so WhatsApp has accepted it. Later receipts move it on through `nextStatus` like any outbound message. This is reported by the provider, not invented (MSG-22).
26. Contract addition: `ProviderEvent` gains `{ type: 'skipped', reason }` with `ProviderSkipReason` (`group`, `broadcast`, `status`, `channel`, `unknown_sender`). The adapter classifies and drops; the worker only logs `@crm/worker: skipped a message (<reason>)`. MSG-04's worker test proves that a skip stores nothing and logs only the reason; the classification itself is tested on the Baileys helpers (MSG-27). Protocol messages are dropped by the adapter without an event (MSG-05).
27. Row-to-view mappers live in `@crm/db` (`packages/db/src/views.ts`: `messageView`, `conversationSummary`, `messageInclude`, `conversationInclude`, and the enum maps `dbStatus`, `statusOf`, `dbFailureReason`), so the worker and the api build identical payloads. db→shared is an allowed dependency.
28. Worker layout: `apps/worker/src/messages.ts` (`createMessageHandler`, `publishEvents`, `isUniqueViolation`). `startWaWorker` creates the handler itself and calls it from its in-order event queue, behind the existing generation and lock check (WA Decision 21), so no new worker dependency. One transaction per message: contact upsert, name fill, conversation upsert, message insert, `lastMessageAt` forward-only update. A unique violation is "already stored" when the provider ID exists, otherwise (a contact or conversation created at the same moment) the transaction is retried once.
29. Known limitation: if storing an inbound message fails (Postgres down), the worker logs `message store failed (<error name>)` and the message is not stored; WhatsApp does not deliver it again. Recorded for the DOC known-limitations list.
30. The Fake gains `receive`, `skip` and `receiveOnOldConnection` (it keeps the last closed connection). Worker test contacts use the fictional `+1999` range, removed by `resetMessages` in `test-support.ts`. MSG-03 also has a direct test of two concurrent `onMessage` calls for a new number. Mutation check: removing the generation and lock guard for message events made both stale-connection MSG-07 tests fail.

Made during MSG phase 3 (2026-11-26), within the approved build:

31. If adding the job fails after the message is stored, the api sets it `failed` (`provider_error`), pushes `message.status`, logs `api: queueing a message failed (<error name>)` and answers 503 with the new `ApiError` code `queue_unavailable` (the edge case under MSG-09). `wa_not_connected` would be misleading there.
32. List responses are wrapped: `ConversationList` (`{ conversations }`) and `MessageList` (`{ messages }`), new Zod contracts in `messages.ts`. `GET /conversations` returns at most 200 conversations; INB adds paging. Conversations with no `lastMessageAt` sort last. `RouteId` (a UUID) checks `:id`; anything else is a 404.
33. Order in the send route: body (400), id and conversation (404), repeated `clientId` (200, checked before the WhatsApp state so a retried request still gets its message), WhatsApp state (503), then one transaction (insert, forward-only `lastMessageAt`), then the pushes (`message.created`, `conversation.updated`), then the job. The pushes come before the job, so a `message.status` can never reach a browser before its message. Two sends with the same `clientId` at the same moment: the unique index decides, and the loser returns the winner's message with 200.
34. Api layout: `apps/api/src/messages.ts` (`messagesRouter`, mounted at `/conversations`), `queue.ts` (`createOutboundQueue`: BullMQ `Queue` on the api's own Redis client, job id = message id, 3 attempts, exponential backoff from `OUTBOUND_BACKOFF_MS` = 2 s, completed and failed jobs trimmed to the last 1000). `sockets.ts` gains `pushEvent(io, event)`, the one room choice used by both the relay and `SocketControl.push`. `AppDeps` gains `outbound`; `testApp` takes an optional `outbound` stub, and the FND health test passes an unused one.
35. The api test files now run one at a time (`fileParallelism: false`), like the worker's. In parallel, the WA tests' `beforeEach` deleted `wa:state` on db 1 while an MSG test was sending, which gave a 503. The api tests' queue keys are on db 1 and are removed with `obliterate` before and after each MSG test.
36. Mutation check: sending `message.created` to `global` made MSG-23 fail. One full `pnpm test` run failed FND-04 by timeout (its second `pnpm migrate` was killed after 59 s) while the machine's load average was 11; FND-04 alone passed in 5 s and the next full run passed. Same family as the open FND-03 timing item.

Made during MSG phase 4 (2026-11-26), within the approved build:

37. Each send runs inside the connection manager's in-order queue (`exclusive`), the same queue as provider events. An echo of the send (MSG-17) or a receipt that WhatsApp reports while `sendText` is still running is therefore handled after the provider ID has been saved. This replaces any "pending sends" bookkeeping and also covers the edge case of a receipt before the ID is saved. `ready` is true only for the connected lock holder; otherwise the attempt fails with `WaNotConnected`.
38. The BullMQ processor (`apps/worker/src/send.ts`, `createSender`) starts on the first `open` after the lock is taken, not on the lock alone, so jobs waiting through a takeover do not spend attempts while WhatsApp is still connecting. It stops (and waits for its active job) before the provider closes, on lock loss and on shutdown. Its blocking Redis connection is `redis.duplicate({ maxRetriesPerRequest: null })`, so it stays on the worker's database.
39. The last attempt is detected in the processor (`attemptsMade + 1 >= attempts`): it marks the message `failed` (`wa_not_connected` for `WaNotConnected`, else `provider_error`) and publishes `message.status` before rethrowing. Earlier attempts publish nothing. Each failure logs `@crm/worker: sending a message failed (<error name>)`.
40. Both the "send" save and the status update are conditional updates (`where status = <expected>`), so a write never overrides a status that changed in between. A status report for an unknown provider ID logs `status for an unknown message ignored` (no ID).
41. `nextStatus` ranks `queued < sent < delivered < read`; `read` and `failed` are final; `failed` after `delivered` is ignored. Two tests: the spec's 20-cell table, and "no two reports in a row ever move a status backward".
42. The Fake gains `sendText` (rejects when not connected), `failSends`, `delaySends`, `echoNextSend` (emits the from-me echo, then holds the send for 100 ms, as Baileys does when it echoes its own sends), `report`, and the counters `sends`, `sendCalls`, `maxActiveSends`. `createProvider('fake')` (the dev Fake) reports nothing after a send (MSG-22).
43. MSG-18's takeover test kills a spawned worker that holds the lock and is connected through a stored Fake session, then queues a job; the in-process standby takes over and sends it once. A job that is active at the moment of the kill is returned by BullMQ's stalled-job check (default lock 30 s); that path is BullMQ's and is not tested here.
44. Mutation checks: removing the "still queued" guard failed MSG-15; bypassing the in-order queue failed MSG-17 (after the Fake's echo hold was added; before it, the race went the safe way and the test passed). Raising BullMQ concurrency to 2 did not fail MSG-19, because the in-order queue alone also runs sends one at a time. `concurrency: 1` is kept as a second guard.

Made during MSG phase 5 (2026-11-26), within the approved build:

45. WA-23 changed (spec, then test, then code): Managers now land on the messages page instead of the placeholder home. The Super Admin still lands on the connection page and has a Messages tab (`tabsFor`); Employees keep the home page.
46. Baileys: the pure helpers are in `providers/baileys/helpers.ts` (`e164`, `phoneJid`, `senderPhone`, `messageContent`, `reportedStatus`, `timestampOf`). The adapter sets `emitOwnEvents: false`, handles `messages.upsert` one message at a time (so a LID lookup never reorders them) and `messages.update` receipts for its own messages only, and `sendText` sends to `<digits>@s.whatsapp.net`. Edits and protocol messages are dropped before unwrapping. None of this has run against WhatsApp yet; MSG-28 is its first real test.
47. Web: one shared socket (`useSocket`); `useMessages` loads over HTTP and stays live over the socket (reloads after a reconnect); `messages-view.ts` holds the pure rules (ticks, labels, resend, ordering, forward-only status in the UI). The Vite proxy adds `/conversations`.
48. Browser check on 2026-11-26 with `pnpm dev` (Fake, `crm_dev`), through Playwright: a test conversation (`+19995550123`) was inserted by SQL. A Manager send through the proxy got 202 `queued` and then `sent` from the worker. As Super Admin, the Messages tab showed the conversation; Enter sent a reply, the box cleared, and the tick went from the clock to one tick live. Afterwards the test rows were deleted and the stack stopped.

## Build phases

Proposed, the same routine as FND and WA: at the end of each phase run the gate (typecheck, lint, test, traceability, format:check), update CLAUDE.md and the docs, make one local commit, and stop for the user's "next".

1. Approve the spec. Install `bullmq`. Write the contracts, the `msg-core` migration, and an `it.todo` for every MSG criterion.
2. Worker inbound on the Fake: filter, store, dedupe, lock and generation checks, publish (MSG-01 to MSG-07).
3. Api: the three routes, the room choice, the socket events (MSG-08 to MSG-13, MSG-23, the api part of MSG-26).
4. Worker sending and status: the queue processor, retries, lock gating, `nextStatus` and status reports (MSG-14 to MSG-22, the worker part of MSG-26).
5. Web messages page, the Baileys message parts with their unit tests, and the manual check with the test phone (MSG-24, MSG-25, MSG-27, MSG-28). Close MSG and the Phase 1 checkpoint.

## Open points for review

1. **Crash between WhatsApp's acceptance and saving `sent`.** BullMQ then re-runs the job, the message is still `queued`, and the customer can get it twice. The window is milliseconds. I recommend accepting and documenting it (the plan's design). The alternative is to mark the message `sending` before the call and, on a re-run, mark it `failed` instead of sending, so a crash can never send twice but can show `failed` for a message that did arrive.
2. **Employee access before INB.** As drafted, Employees see no messages until INB. The alternative is read-only access to all conversations, which INB would have to take away again. I recommend no access.
3. **Inbound with the Fake in dev.** As drafted, the only way to see an inbound message in dev is the real phone. A Could item would add a Super Admin "Simulate incoming message" button, shown only with the Fake and labelled simulated. I recommend leaving it out unless the demo needs it.
