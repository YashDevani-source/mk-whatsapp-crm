# Design prompt: Real-estate WhatsApp CRM

Paste everything below the line into a design tool or give it to a designer. In order, it covers:
1. What the project is and who it is for.
2. The kinds of APIs the app has and what data each one returns.
3. How data moves through the system.
4. Every user flow.
5. The screens, states, dummy data and design rules.

Items marked **(built)** already exist in the code. Items marked **(planned)** will be built later; their exact paths and field names are not final, but their meaning is.

---

# PART A: What the project is

## A1. One-line summary

A web CRM that lets the whole sales team of one real-estate company handle every customer enquiry that arrives on the company's **single WhatsApp number**, from **one shared inbox**, with leads, properties, follow-ups, safe campaigns, reports and an audit log around it.

## A2. Who it is for

**The client: a real-estate company** (placeholder name "Skyline Realty") that sells flats, villas and plots across several projects. Its customers find it through ads, hoardings and portals, and almost all of them write on **WhatsApp**.

**The problem today:**
- The company number lives on one phone. Only one person can answer at a time.
- Enquiries are missed, and two people sometimes answer the same customer.
- Nobody knows who promised what. Leads are not tracked from first message to deal, and follow-ups are forgotten.
- Managers cannot see how fast each salesperson replies or how many deals they close.

**What the CRM changes:**
- The company number is linked to the CRM once, by scanning a QR code, the same way WhatsApp Web is linked.
- Every message reaches a shared web inbox in real time.
- A manager assigns each chat to a salesperson, who replies from the browser. **The customer sees a normal WhatsApp reply from the company number.** The customer never installs anything and never sees the CRM.
- Each customer becomes a **lead** that moves through stages until the deal is **Converted** or **Lost**.

**The people who use it every day:**

| Role | How many | Their goal | What they can do |
|---|---|---|---|
| **Super Admin** (owner or IT person) | 1 | Keep WhatsApp connected and the system safe | Connect and disconnect WhatsApp (QR), manage users, see everything, read the audit log, plus everything a Manager can do |
| **Manager** (sales head) | 2 to 3 | Make sure every enquiry is answered and converted | See the whole inbox, assign and reassign chats, reply, manage leads and properties, run campaigns, read reports |
| **Employee** (salesperson) | up to 10 | Answer their customers fast and close deals | See **only the chats and leads assigned to them**, reply, add internal notes, update leads, handle follow-ups, share properties |

Customers are **not** users of the app. They only use WhatsApp on their phones.

## A3. Context and limits of this version

- It is a **prototype** for a developer assessment (MK Agency). It runs with a **test WhatsApp number and test contacts only**.
- Anything **simulated** is labelled **"Simulated"** or **"Test"** in the UI. Examples: the fake WhatsApp connection used during development, and "Run now (test)" automation buttons.
- It is a desktop-first web app used all day by office staff (laptops of 1280 px and wider). It should still be usable on a tablet.
- **Priorities:**
  - Must really work: the WhatsApp connection, the live inbox, real replies.
  - May be simplified and labelled: automations as "Run now (test)", CSV-only export, tables instead of charts.
  - Never: fake delivery ticks, real customer numbers, unsolicited bulk messages.

## A4. Modules

| Module | What it does |
|---|---|
| WhatsApp connection | The Super Admin scans a QR code. The status shows connected, disconnected or reconnect-required. Reconnects after a server restart without a new QR. Warns everyone when the connection drops. |
| Shared inbox | Chat list and chat panel. Assign and reassign. Open / Pending / Closed states with an unread count. Internal notes, never sent to the customer. A "someone is replying" lock. The sender's name on every outgoing message. |
| Leads | Customer details and property needs: budget, location, property type, BHK. Seven stages from **New** to **Converted** or **Lost**. Owner, assignment and full change history. Created automatically from new enquiries, at most one open lead per customer. |
| Properties | Projects and their units, with photos and brochure PDFs. Search. Share a property into a chat. |
| Follow-ups | Reminders, with overdue, today and upcoming lists. Test-mode auto-replies. The same reminder is never sent twice. |
| Campaigns | CSV import with validation, segments, preview and confirm. Slow, queued sending with pause and resume. An opt-out list checked before every message. A "test numbers only" switch that is on by default. |
| Users and roles | Super Admin, Manager, Employee. Deactivating a user keeps their history. |
| Dashboard and reports | Counts of leads, chats and follow-ups, and per-employee performance. Filters and CSV export. Tables, not charts. |
| Audit log | An append-only record of logins, assignments, stage changes, campaign actions and WhatsApp connects and disconnects. |

---

# PART B: How the system is built (only as much as the design needs)

## B1. The pieces

```
 Customer's phone ──WhatsApp──▶ Company WhatsApp number
                                        │ (linked like WhatsApp Web)
                                        ▼
                              ┌──────────────────┐
                              │  Worker           │  holds the one WhatsApp session,
                              │  (background)     │  receives and sends messages
                              └──────────────────┘
                                 │            ▲
                    database + event bus      │ job queue
                                 ▼            │
 Browser (React app) ◀──live events──  ┌──────────────────┐
         │                             │  API server       │  login, permissions,
         └──────HTTP requests─────────▶│                   │  all data, live push
                                       └──────────────────┘
```

- **Browser:** the web app you are designing. It talks only to the API.
- **API server:** answers HTTP requests (load lists, save changes) and pushes **live events** to open browsers over a WebSocket.
- **Worker:** a background process that keeps the WhatsApp connection, stores incoming messages, sends queued messages and reports delivery ticks.
- **Database** (PostgreSQL) stores everything. **Redis** carries live events, the job queue and short-lived locks.

What this means for the design:
- Screens update **live**, without refresh: new messages, ticks, assignments, connection status.
- Sending is **not instant**. A message is first **queued** (clock icon), then **sent** (one tick), then **delivered** (two ticks), then **read** (two blue ticks). It can also be **failed**.
- If WhatsApp is disconnected, nothing can be sent or received, and the UI must say so everywhere.

## B2. Three kinds of API

| Kind | What it is | When the UI uses it |
|---|---|---|
| **1. HTTP (REST) requests** | The browser asks for data or sends a change, and gets JSON back | Loading pages and lists, saving forms, sending a message, assigning a chat |
| **2. Live events (WebSocket)** | The server pushes a small update to the browsers that are allowed to see it | New message, tick change, chat assigned, lead updated, reminder due, campaign progress, WhatsApp status |
| **3. Background jobs** (not called by the UI) | Work done later or slowly: sending messages, campaign sending, reminders at a due time | The UI shows their **progress and result** through live events: queued → sent, campaign counts, reminder pop-ups |

Every request needs a logged-in user, except login itself. The server checks the role on every request:
- **401** means the user is not logged in. The UI goes to the login page.
- **403** means the role is not allowed. The UI shows "You don't have access to this".

Errors come back as `{ "error": "<code>" }`, for example `wa_not_connected`.

## B3. HTTP APIs and the data they return

### Authentication (built)

| Request | Who | Returns |
|---|---|---|
| `POST /auth/login` with `{ email, password }` | anyone | The user `{ id, name, role }` and a session cookie. Every failure gives the same "Email or password is incorrect". After 5 failures in 15 minutes: "Too many attempts". |
| `GET /auth/me` | logged in | The current user `{ id, name, role }`. Used on page load to decide which navigation to show. |
| `POST /auth/logout` | logged in | Nothing. The session ends and live updates stop. |

### WhatsApp connection (built)

| Request | Who | Returns |
|---|---|---|
| `POST /wa/qr` | Super Admin | "Accepted". A new QR code then arrives as a live event. Refused if the state is not "reconnect required". |
| `POST /wa/logout` | Super Admin | "Accepted". The company number is unlinked; the state becomes "reconnect required". Needs a confirm dialog. |

The status and the QR code themselves arrive only as live events (B4).

### Inbox and messages (built; assignment, status, notes and lock planned)

| Request | Who | Returns |
|---|---|---|
| `GET /conversations` (built) | Super Admin, Manager. Planned: Employees, who will see only their own chats | Up to 200 chats, newest first. Each has the contact (phone, name) and the last message as a preview. Planned additions: status, assignee, unread count, lead stage, paging. |
| `GET /conversations/:id/messages` (built) | same | The last 100 messages of one chat, oldest first. Planned: "load older". |
| `POST /conversations/:id/messages` with `{ text }` (built) | Super Admin, Manager. Planned: the assigned Employee | The new message with status **queued**. Errors: "WhatsApp is not connected" (not saved), "queue unavailable" (saved as failed), and planned "someone else is replying" (refused while another user holds the reply lock). Text is 1 to 4096 characters. |
| Assign / reassign a chat (planned) | Manager, Super Admin | The updated chat with its new assignee. The chat's open lead moves to the same person. |
| Change chat status: Open / Pending / Closed (planned) | assignee, Manager, Super Admin | The updated chat |
| Add internal note (planned) | assignee, Manager, Super Admin | The note: text, author, time. Never sent to WhatsApp. |
| Take / refresh / release the reply lock (planned) | anyone allowed to reply | Who holds the lock and until when |
| Mark chat as read (planned) | assignee, Manager, Super Admin | The unread count goes back to 0 |

### Leads (planned)

| Request | Returns |
|---|---|
| List leads, with filters (stage, owner, date, search) | Rows: name, phone, stage, budget, location, type, BHK, owner, last activity, next follow-up |
| Get one lead | All fields, the linked chat, notes, follow-ups, earlier closed leads of the same customer |
| Update a lead (fields, stage, owner) | The updated lead. Every change also writes a history row (old value, new value, who, when). |
| Lead history | The timeline of all changes |

Employees can only list and change their own leads.

### Properties (planned)

| Request | Returns |
|---|---|
| List / search projects and units (location, type, BHK, price) | Cards: project name, location, cover photo, unit details, price, availability |
| Get a project or unit | Photo gallery, brochure PDFs, details |
| Upload a photo or PDF | The saved file, or an error ("not an image or PDF", "file too large"). The type is checked from the file's real content. Files are shown through short-lived private links. |
| Share a property into a chat | A media message, **queued**, like a text message, with the same "not connected" and "someone is replying" errors |

### Follow-ups (planned)

| Request | Returns |
|---|---|
| List follow-ups (overdue / today / upcoming / done; mine or all) | Rows: lead, contact, due time, note, owner, done or not |
| Create / edit / mark done | The saved follow-up. Changing the due time moves the reminder. |
| "Run now (test)" auto-reply | What was sent, to test contacts only, labelled Test |

### Campaigns (planned; Super Admin, Manager)

| Request | Returns |
|---|---|
| Upload CSV | A validation report: valid rows, invalid rows with reasons (bad phone number, duplicate, missing field) |
| Build segment | The matching contacts |
| Preview | Recipient count, a sample of recipients, the message, how many are **opted out** (skipped), whether **test numbers only** is on. Nothing is sent yet. |
| Confirm | The campaign starts, at a controlled rate |
| Pause / resume | The new campaign status |
| Campaign detail | Status, counts (sent, skipped, failed, waiting), and per-recipient status with reasons |
| Opt-out list (view, add) | Numbers that must never be messaged |

### Users (planned)

| Request | Who | Returns |
|---|---|---|
| List users | Super Admin, Manager | Name, email, role, active or deactivated, last login |
| Create user, change role, deactivate | Super Admin | The updated user. Deactivating logs them out at once and keeps their history. |

### Dashboard, reports and audit (planned)

| Request | Who | Returns |
|---|---|---|
| Dashboard counts | everyone (scoped) | New leads today, open chats, unassigned chats, overdue follow-ups, converted this period |
| Per-employee report with filters | Manager and Super Admin see everyone; Employees see only their own figures | Per person: assigned chats, replies sent, average first-response time, leads by stage, converted, overdue follow-ups |
| CSV export | same | A CSV file of the current report |
| Audit log with filters | Super Admin | Time, user, action, target, details, IP. Read-only, nothing can be edited or deleted. |

### Health (built)
`GET /health` returns whether the API, the database and Redis are up. It is for operations and is not a screen.

## B4. Live events (WebSocket push)

The browser opens one live connection after login. The **server decides who receives what**: everyone, admins only, the whole inbox (Super Admin and Managers), or only the assigned person.

| Event | Data it carries | Who receives it | What the UI does |
|---|---|---|---|
| `wa.state` (built) | Connection state (connecting / qr_required / connected / disconnected / reconnect_required), provider (real or simulated), reason, time | everyone | Update the status banner and the Connection page |
| `wa.qr` (built) | The QR code text and time | Super Admin only | Show or refresh the QR image |
| `message.created` (built) | A full message (see B5) | inbox (Super Admin, Managers); planned: also the assignee | Add the bubble to the open chat; show a toast if another chat |
| `message.status` (built) | Message id, new status, failure reason, time | same | Change the tick in place, or show "Failed" |
| `conversation.updated` (built) | The chat summary (contact, last message, time; planned: assignee, status, unread) | same; planned: old and new assignee | Move the chat to the top, update the preview and unread badge; add the chat to or remove it from an employee's list when reassigned |
| `conversation.lock` (planned) | Chat id, who is replying, until when | inbox and assignee | Show "Priya is replying…" and lock the composer |
| `lead.created` / `lead.updated` (planned) | The lead | inbox and owner | Update the lead panel, lists and stage chips |
| `followup.due` (planned) | The follow-up | its owner only | Reminder pop-up and badge |
| `campaign.progress` (planned) | Campaign id, counts, status | Super Admin, Managers | Update progress numbers and the recipient table |

## B5. The data (main records and their fields)

Shapes marked **(built)** are exact. The others are planned; their fields show what the screens need.

```text
User (built)
  id, name, role: SUPER_ADMIN | MANAGER | EMPLOYEE
  planned for screens: email, active/deactivated, last login

Contact (built)
  id, phone (international format), name or empty, isTest

Conversation summary (built)
  id, contact { id, phone, name }, lastMessageAt, lastMessage (a Message)
  planned: assignee { id, name } or unassigned, status: open | pending | closed,
           unreadCount, lead stage, reply lock { user, until }

Message (built)
  id, conversationId
  direction: inbound (from customer) | outbound (from company)
  type: text | unsupported            (planned: image, document, property card)
  body: the text, or empty
  unsupportedKind: e.g. "image", "video", "audio", "sticker" (shown as "Unsupported message (image)")
  status (outbound only): queued | sent | delivered | read | failed
  failureReason: wa_not_connected | provider_error | reported_failed
  sender: { id, name } of the CRM user who sent it,
          or empty on an outbound message = "Sent from phone"
  at: time on WhatsApp

Internal note (planned)
  id, conversationId, author { id, name }, text, time

Lead (planned)
  id, contact, owner { id, name }, stage (7 stages: New … Converted | Lost),
  budget (min–max), preferred location, property type (flat, villa, plot…), BHK,
  source, created time, last activity, next follow-up, open or closed
Lead history row (planned)
  field, old value, new value, changed by, time

Project (planned)
  id, name, location, description, photos[], brochures[]
Unit (planned)
  id, project, tower/block, floor, BHK, area (sq ft), price, availability

Follow-up (planned)
  id, lead, owner, due time, note, done (time) or not

Campaign (planned)
  id, name, message text, segment, testNumbersOnly (default on),
  status: draft | running | paused | finished,
  counts { total, sent, skipped, failed, waiting }
Campaign recipient (planned)
  contact, status: waiting | sent | skipped | failed,
  reason: opted out | not a test number | send failed
Opt-out (planned)
  phone, added by, time

Audit entry (planned UI; some entries are already written)
  time, user (or "system"), action, target, details, IP

WhatsApp state (built)
  state: connecting | qr_required | connected | disconnected | reconnect_required
  provider: fake (Simulated) | baileys (real) | empty when the worker is offline
  reason: network | logged_out_from_phone | logged_out_by_admin | qr_timeout |
          session_unreadable | worker_offline | other
  time
```

---

# PART C: Data flows (what happens behind each screen)

Every change follows the same pattern: **check input and permission → save to the database → queue a job or publish an event → push to the right browsers.** The database is always written first, so a crash never leaves a "ghost" message.

## C1. Incoming customer message (built; lead and assignee parts planned)

1. A customer sends "Hi, price of 2 BHK in Green Valley?" to the company number.
2. The worker receives it. Groups, broadcasts, status updates and reactions are ignored.
3. In one database step, the worker:
   - creates the **contact** if the number is new,
   - creates the **conversation**, or reopens it if it was closed,
   - stores the **message**; a duplicate is ignored,
   - planned: adds 1 to the **unread count** and creates a **lead** at stage New if the contact has no open lead.
4. The worker publishes `message.created` and `conversation.updated` (planned: `lead.created`).
5. The API pushes them to the Super Admin, the Managers and (planned) the assigned employee.
6. **The UI:** the chat jumps to the top of the list with an unread badge. If it is open, the bubble appears. Otherwise a toast shows "New message from Ravi Kumar".

Special cases the UI must show:
- A photo, video, voice note or sticker is shown as "**Unsupported message (image)**" in this version.
- A message typed on the company phone itself appears as outbound with the label "**Sent from phone**".

## C2. Sending a reply (built; reply lock and assignee planned)

1. The employee types a reply and presses Send.
2. The API checks, in order:
   - the text (1 to 4096 characters),
   - the permission (assignee, Manager or Super Admin),
   - that WhatsApp is connected,
   - (planned) that nobody else holds the reply lock.
3. The message is saved as **queued** and pushed to everyone viewing that chat. The bubble shows a **clock**.
4. A send job is queued. The worker sends it through WhatsApp and saves **sent** (one tick).
5. WhatsApp later reports **delivered** (two ticks) and **read** (two blue ticks). Each report is pushed as `message.status`.
6. If sending fails, the worker retries 3 times, then marks it **failed** with a reason. The UI shows a red "Failed" with **Retry**, and a retry creates a new message.
7. A double click never sends twice: each send carries a client id, and a repeat returns the same message.

**Tick rule:** ticks only move forward (queued → sent → delivered → read, or → failed). They only show what WhatsApp actually reported. **A tick is never faked or guessed.**

## C3. WhatsApp connection (built)

```
connecting ──▶ connected                     (saved session found)
connecting ──▶ qr_required ──scan──▶ connected (no session yet)
connected ──network drop──▶ disconnected ──auto retry──▶ connecting
connected ──logged out on phone / admin logout / QR expired──▶ reconnect_required
reconnect_required ──Super Admin clicks "Get new QR"──▶ qr_required
```

- Only **one** WhatsApp session may be live. A lock stops a second worker from connecting.
- After a server restart it reconnects **without a new QR**.
- Auto retry waits 1 s, 2 s, 4 s… up to 60 s.
- Every state change goes to everyone's banner. The QR goes only to the Super Admin.
- Connects, disconnects and logouts are written to the audit log.

## C4. Assignment (planned)

1. A Manager picks an employee in the chat header's Assign dropdown.
2. The chat and its open lead get the new owner. A lead history row and an audit entry are written.
3. `conversation.updated` goes to the inbox, the old assignee and the new assignee.
4. **The UI:** the chat disappears from the old assignee's list and appears in the new assignee's list, live. The header shows the new name.

## C5. Reply lock: "someone is replying" (planned)

1. When a user starts typing in a chat, the browser takes a short lock (a few seconds) and keeps refreshing it while they type.
2. Everyone else viewing that chat gets `conversation.lock` and sees "**Priya is replying…**". Their composer is disabled.
3. If someone else still presses Send, the server refuses it ("someone else is replying"). The lock is enforced on the server, not only in the UI.
4. The lock ends when the reply is sent, when typing stops, or when it expires. The lock timeout and whether a Manager can override it are not decided yet.

## C6. Lead lifecycle (planned)

```
new enquiry ─▶ lead auto-created (stage New) ─▶ assigned with the chat
   ─▶ employee fills needs (budget, location, type, BHK)
   ─▶ stage changes … ─▶ Converted  or  Lost  (lead closed)
   ─▶ the same customer writes again later ─▶ a new lead is created
```

- At most **one open lead per customer**.
- Every field, stage and owner change is recorded (old value → new value, who, when). Stage changes also go to the audit log.
- Employees see and edit only their own leads.
- There are 7 stages: the first is **New**, and the last are **Converted** and **Lost**. The five middle stage names are not decided; use clearly marked placeholders.

## C7. Sharing a property (planned)

1. In a chat, the employee clicks "Share property", searches, picks a unit and sees a preview (photo, caption, brochure).
2. It is sent like a reply, with the same checks: connection, permission, lock. It shows queued → sent → delivered → read.
3. The customer receives the photo or PDF with a caption on WhatsApp.

Uploads: photos and PDFs are checked by their real content and size before saving.

## C8. Follow-up reminders (planned)

1. On a lead, a user creates a follow-up: date, time, note.
2. At the due time, the owner gets a `followup.due` pop-up, and the item moves to **Today** and then to **Overdue** if not done.
3. Each reminder fires **once**, even after restarts.
4. "Run now (test)" auto-replies send only to test contacts and are labelled Test.

## C9. Campaigns (planned)

```
upload CSV ─▶ validate rows ─▶ (errors: fix and re-upload)
           ─▶ build segment ─▶ write message ─▶ PREVIEW (count, sample, opted-out, test-only on?)
           ─▶ CONFIRM ─▶ sending slowly ─▶ pause / resume ─▶ finished
```

Just before **each** message, the worker checks:
- Is the campaign paused?
- Has this number **opted out**?
- Is "**test numbers only**" on and this number not a test number?

If any check fails, the recipient is marked **skipped** with the reason. No customer can be messaged twice by the same campaign, even after a crash. Every campaign action is in the audit log.

## C10. Audit log (partly built)

Written automatically, in the same database step as the change itself, for:
- logins, logouts and failed logins,
- assignments,
- lead stage changes,
- user created, deactivated or role changed,
- campaign created, confirmed, paused, resumed and finished,
- WhatsApp connected, disconnected and logged out, and QR requested.

It can only be added to, never edited or deleted.

## C11. Reports (planned)

Filters (date range, employee, stage) give tables computed from stored records. Nothing is estimated. Employees see only their own numbers. CSV export downloads the same table.

---

# PART D: Application flows (user journeys)

## D1. First-time setup (Super Admin)
1. Log in.
2. Land on **Connection**. The banner says "Waiting for the Super Admin to scan the QR".
3. A QR code appears with steps: "On the company phone: WhatsApp → Linked devices → Link a device". A countdown runs, because the QR expires after about 60 s; then "Get new QR".
4. Scan it. The state changes live to **Connected**, showing the number and since when, and the banner turns green for everyone.
5. Go to **Users** and add the Managers and Employees.

## D2. A manager's day
1. Log in and land on the **Inbox** (All chats).
2. A new chat from an unknown number appears live at the top: "Unassigned", "New" lead, unread 1.
3. Open it, read it, and **assign** it to Priya. It disappears from "Unassigned".
4. Check the **Dashboard**: unassigned chats, overdue follow-ups, per-employee response times. Export CSV.
5. Prepare a **campaign** for a new project launch to test contacts: upload, preview, confirm, watch progress, pause if needed.

## D3. An employee's day
1. Log in and land on **My chats / Home**: their unread chats, today's and overdue follow-ups.
2. Open a chat. Read the customer's question. The lead panel on the right shows the stage and needs.
3. Type a reply. Colleagues see "Priya is replying…". Send it and watch clock → ✓ → ✓✓ → blue ✓✓.
4. Add an **internal note** ("Customer prefers east-facing, ask about loan"). It is yellow and never sent.
5. Click **Share property** and send the Green Valley 2 BHK brochure.
6. Update the lead: budget, BHK, and stage New → next stage. The history records it.
7. Create a **follow-up** for Saturday 11:00, "Site visit confirmation".
8. Later, a reminder pops up. Open the chat from it and mark the follow-up done.
9. The deal closes: move the lead to **Converted**, and set the chat to **Closed**.

## D4. Two people, one chat
- Rohan (Manager) and Priya (Employee) both have the chat open. Priya starts typing, so Rohan sees "Priya is replying…" and Rohan's composer is locked.
- Priya sends, the lock is released, and Rohan can type.
- If Rohan forces a send during the lock, Rohan gets the error "Priya is replying. Try again in a moment."

## D5. WhatsApp drops
1. Network loss: every user's banner turns amber, "WhatsApp is disconnected. Reconnecting…". The Send button is disabled, with a short reason.
2. A message sent just before the drop shows "Failed: WhatsApp not connected" and **Retry**.
3. WhatsApp reconnects by itself, the banner turns green, and messages flow again.
4. If the phone unlinks the CRM, the state is "Reconnect required: logged out from the phone". Only the Super Admin sees "Get new QR".

## D6. Reassignment and deactivation
- A Manager moves a chat from Karan to Sneha. Karan's list loses it live, and Sneha's list gains it with a toast.
- The Super Admin deactivates Karan. Karan is logged out at once, and Karan's past messages still show "Karan Verma (deactivated)".

## D7. Safe campaign
Upload CSV (12 rows):
- 2 invalid rows, with reasons.
- 10 valid rows go to the segment.
- The preview shows 10 recipients: 1 opted out and 2 that are not test numbers will be skipped, so 7 will be sent. "Test numbers only: ON".

Confirm. The progress table updates live (sent 7, skipped 3). Pause and resume work.

## D8. Login and errors
- Wrong password gives "Email or password is incorrect", the same message every time.
- Five failures give "Too many attempts. Try again later."
- An expired session sends the user back to login with "Your session ended. Please log in again."

---

# PART E: Screens to design

1. **Login:** email, password, error states, company logo placeholder.
2. **App shell:** a left sidebar whose items depend on the role, and a top bar with the user's name, role badge and logout. The **WhatsApp status banner** sits under it:
   - green connected (compact),
   - blue connecting,
   - amber for QR required, disconnected and reconnecting, reconnect required (with the reason), and worker offline,
   - plus a grey **"Simulated"** tag when the fake provider is used.
3. **WhatsApp connection** (Super Admin): a state card (state, number, since, reason), a QR panel with instructions and a countdown, "Get new QR", and "Log out WhatsApp" with a confirm dialog. The simulated variant reads "Simulated QR — no phone needed".
4. **Shared inbox**, the main screen, in three columns:
   - **Chat list:** search; tabs Open / Pending / Closed; Unassigned / Mine / All (Employees: Mine only). Each row: name or phone, preview, time, unread badge, assignee avatar, stage chip.
   - **Chat panel:**
     - Header: contact, phone, Assign dropdown, status selector.
     - Bubbles: inbound on the left; outbound on the right with the **sender's name** and ticks (clock, ✓, ✓✓, blue ✓✓, red Failed + Retry).
     - Special items: "Sent from phone", "Unsupported message (image)", property cards, and yellow **internal notes** ("Not sent to the customer"). Day separators, a "New messages" divider, load older.
     - Composer: a 4096-character limit, a Note toggle, Share property, a locked state ("Priya is replying…"), and a disabled state ("WhatsApp is not connected").
   - **Lead panel:** contact, stage selector, needs (budget, location, type, BHK), next follow-up, history timeline.
5. **Leads:** a table, plus an optional board by stage. Filters and search. A lead detail page with editable fields, chat link, notes, follow-ups, full change history and earlier closed leads.
6. **Properties:** project and unit cards with filters; detail with gallery, brochures and units table; upload with errors; a "Share into chat" modal with preview.
7. **Follow-ups:** tabs Overdue (red), Today, Upcoming, Done; a create/edit modal; "Run now (test)" labelled Test.
8. **Campaigns:**
   - a list with status chips,
   - a 5-step wizard: Upload CSV → Segment → Message → Preview & confirm → Progress,
   - pause/resume, a recipient table with reasons, and the **Opt-out list** page.
9. **Users:** a table, add user, change role, deactivate (with a note that history is kept).
10. **Dashboard & reports:** number cards and a per-employee table, with filters and Export CSV. No charts.
11. **Audit log:** a filterable, read-only table.
12. **Employee home:** my unread chats, my follow-ups (today and overdue), my leads by stage.

Show the role differences: one view each of the sidebar and inbox for Super Admin, Manager and Employee.

## States to cover on every relevant screen
- Empty (with a helpful line), loading skeletons, errors with a next step.
- Live arrivals: a new chat at the top, ticks changing in place, toasts.
- Disconnected banner and disabled Send; reply lock; Simulated and Test labels.
- No access ("You don't have access to this page").

---

# PART F: Dummy data, style and rules

## Dummy data
- Company: "Skyline Realty".
- Users: Super Admin "Aarav Shah"; Managers "Neha Kapoor", "Rohan Mehta"; Employees "Priya Nair", "Karan Verma", "Sneha Iyer", "Vikram Rao".
- Customers: fictional names on **fictional test numbers only**, from the reserved range `+1 202 555 0100` to `0199`.
- Properties:
  - Green Valley Residency: 2 BHK, 1,150 sq ft
  - Lakeview Towers: 3 BHK, 1,620 sq ft
  - Palm Grove Villas: 4 BHK villa
  - Sunrise Plots: 2,400 sq ft plot

  Use one consistent currency for prices.
- Messages:
  - "Hi, I saw your ad for 2 BHK flats in Green Valley. What is the price?"
  - "Can I visit the site this Saturday?"
  - "Please share the brochure."
  - "Is a home loan available?"

## Style
- A calm, trustworthy work tool, like a modern helpdesk or CRM. Dense enough for all-day use, still easy to scan.
- Chat bubbles may feel familiar (left and right, ticks), but **do not copy WhatsApp's branding, logo, colours or exact look**. The CRM has its own brand.
- Status colours: green ok, amber warning, red error or overdue, blue info, and neutral grey for "Simulated" and "Test" (never confused with a real status).
- Accessible: WCAG AA contrast, visible focus, statuses shown with icon and text, not colour alone.
- Light theme first; dark theme optional.

## Rules the design must respect
- **Never show a delivered or read tick that WhatsApp did not report.**
- **Internal notes are never sent** and must look clearly different from messages.
- **Employees see only their own chats and leads.** Their navigation has no Connection, Users, Campaigns or Audit log.
- **Everything simulated or test-only is labelled.**
- **Campaigns are safe by default:** test numbers only on, opt-outs always skipped, a preview and confirm step, and no "send to everyone now" button.
- One WhatsApp number, one live connection, and the Connection page is for the Super Admin only.

## Open points (design with placeholders and note them)
- The five middle lead stage names.
- How long the reply lock lasts, and whether a Manager can take over a locked chat.
- Whether closing a chat also closes its lead.

## What to deliver
1. A small design system: colours, type scale, spacing, and components (buttons, inputs, chips and badges, tables, chat bubbles, ticks, banners, modals, toasts, wizard steps).
2. All screens in Part E at desktop size with the dummy data, including the role differences and the key states.
3. A short note listing every assumption made, especially the placeholders in "Open points".
