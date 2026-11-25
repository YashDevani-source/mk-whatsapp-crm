// DEMO-03, DEMO-04: the Skyline Realty dataset (design prompt Part F). Every time is relative to
// `now`, so the data looks recent on any day. Ids are fixed per record, so a reset gives the
// same ids again. Customers use only the reserved test range +1 202 555 0100 to 0199.
import type {
  AuditAction,
  AuditEntry,
  CampaignRecipient,
  CampaignView,
  ContactView,
  ConversationStatus,
  InboxItem,
  LeadHistoryEntry,
  LeadNeeds,
  LeadStage,
  MediaFile,
  MessageSender,
  MessageView,
  ProjectView,
  PropertyCard,
  Role,
  UnitView,
  UserView,
} from '@crm/shared';
import type { ConversationRow, DemoData, FollowUpRow, LeadRow } from './store.ts';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_COMPANY = 'Skyline Realty';
export const DEMO_COMPANY_NUMBER = '+12025550100';

// The test range every dummy number comes from (DEMO Decision 10).
export function isTestNumber(phone: string): boolean {
  return /^\+120255501\d{2}$/.test(phone);
}

// A fixed, valid v4 UUID per record kind and number.
export function demoId(kind: number, n: number): string {
  const k = kind.toString(16).padStart(3, '0');
  return `00000000-0000-4000-8${k}-${n.toString(16).padStart(12, '0')}`;
}

const KIND = {
  user: 1,
  contact: 2,
  conversation: 3,
  message: 4,
  note: 5,
  lead: 6,
  history: 7,
  project: 8,
  unit: 9,
  media: 10,
  followUp: 11,
  campaign: 12,
  audit: 13,
} as const;

const USERS: readonly [string, string, Role, boolean][] = [
  ['Aarav Shah', 'aarav@skyline.test', 'SUPER_ADMIN', true],
  ['Neha Kapoor', 'neha@skyline.test', 'MANAGER', true],
  ['Rohan Mehta', 'rohan@skyline.test', 'MANAGER', true],
  ['Priya Nair', 'priya@skyline.test', 'EMPLOYEE', true],
  ['Karan Verma', 'karan@skyline.test', 'EMPLOYEE', true],
  ['Sneha Iyer', 'sneha@skyline.test', 'EMPLOYEE', true],
  ['Vikram Rao', 'vikram@skyline.test', 'EMPLOYEE', true],
  // Deactivated: her past messages keep her name (DEMO-29).
  ['Ananya Das', 'ananya@skyline.test', 'EMPLOYEE', false],
];
const ANANYA = 7;

const CUSTOMERS: readonly (string | null)[] = [
  'Rahul Sharma',
  'Meera Joshi',
  'Arjun Reddy',
  'Kavya Menon',
  'Siddharth Rao',
  null,
  'Pooja Desai',
  'Aditya Kulkarni',
  'Nisha Patel',
  'Varun Malhotra',
  'Ishita Bose',
  'Manish Gupta',
  null,
  'Divya Pillai',
  'Rakesh Yadav',
  'Sana Khan',
  'Harsh Vardhan',
  'Tanvi Shah',
  'Gaurav Singh',
  'Lakshmi Narayan',
  null,
  'Deepak Chawla',
  'Ritu Agarwal',
  'Farhan Ali',
];

export function customerPhone(index: number): string {
  return `+1202555${String(101 + index).padStart(4, '0')}`;
}

// The customer messages of design prompt Part F, used by the simulator too.
export const ENQUIRY_TEXTS: readonly string[] = [
  'Hi, I saw your ad for 2 BHK flats in Green Valley. What is the price?',
  'Can I visit the site this Saturday?',
  'Please share the brochure.',
  'Is a home loan available?',
];

type Step =
  | ['in' | 'out' | 'phone' | 'note' | 'failed', string]
  | ['image', string]
  | ['property', string, number];

const SCRIPTS: readonly Step[][] = [
  [
    ['in', ENQUIRY_TEXTS[0] ?? ''],
    ['in', 'Also, is car parking included?'],
  ],
  [
    ['in', 'Hello, I am looking for a 3 BHK near Hebbal.'],
    [
      'out',
      'Hi! Lakeview Towers in Hebbal has 3 BHK homes from ₹1.35 Cr. Would you like to visit?',
    ],
    ['in', ENQUIRY_TEXTS[1] ?? ''],
  ],
  [
    ['in', ENQUIRY_TEXTS[2] ?? ''],
    ['out', 'Sure, here are the Green Valley Residency details.'],
    ['property', 'Green Valley Residency, 2 BHK, 1,150 sq ft.', 0],
    ['note', 'Wants an east-facing unit only.'],
    ['in', 'Thanks, I will check with my family.'],
  ],
  [
    ['in', ENQUIRY_TEXTS[3] ?? ''],
    ['out', 'Yes, we have tie-ups with SBI and HDFC for up to 80% of the value.'],
    ['in', 'What documents are needed?'],
    ['in', 'And how long does approval take?'],
  ],
  [
    ['in', 'Looking for a villa on Sarjapur Road.'],
    ['out', 'Palm Grove Villas has 4 BHK villas from ₹3.2 Cr.'],
    ['in', 'Can we see one this week?'],
    ['out', 'Sure, Thursday at 11 am works. I will share the location.'],
    ['phone', 'Location: Palm Grove Villas, Sarjapur Road. Gate 2.'],
  ],
  [['in', 'Hi, do you have plots near the airport?']],
  [
    ['in', 'We liked the 3 BHK at Lakeview. Is there any discount?'],
    ['out', 'Let me check with my manager and get back to you today.'],
    ['note', 'Asked for 5% off. Needs manager approval.'],
    ['out', 'We can offer free car parking and waive the club membership fee.'],
    ['in', 'Let me discuss and confirm.'],
  ],
  [
    ['in', 'Hello, what is the possession date for Green Valley?'],
    ['out', 'Possession is planned for March 2027.'],
    ['in', 'OK. What is the price on a higher floor?'],
  ],
  [
    ['in', 'I want a plot of about 2,400 sq ft.'],
    ['out', 'Sunrise Plots in Devanahalli has 2,400 sq ft plots from ₹96 L.'],
    ['in', 'Please share the layout plan.'],
  ],
  [
    ['in', ENQUIRY_TEXTS[1] ?? ''],
    ['out', 'Yes! Saturday 10:30 am at Green Valley Residency. See you there.'],
    ['in', 'Great, thanks.'],
  ],
  [['in', 'Hi, is anyone available to talk now?']],
  [
    ['in', 'We have decided to go ahead with the 2 BHK.'],
    ['out', 'Wonderful! I will send you the booking form.'],
    ['out', 'The booking amount is ₹2 L.'],
    ['in', 'Done, transferred.'],
  ],
  [
    ['image', 'image'],
    ['in', 'This is the floor plan your agent gave me. Is it correct?'],
  ],
  [
    ['in', 'What is the maintenance charge per month?'],
    ['failed', 'It is ₹4 per sq ft per month.'],
    ['in', 'Hello? Did you send something?'],
  ],
  [
    ['in', 'Please do not send me offers.'],
    ['in', 'STOP'],
  ],
];

// [status, assignee (user index), unread, lead stage, script, minutes since the last message]
const PLAN: readonly [ConversationStatus, number | null, number, LeadStage, number, number][] = [
  ['open', null, 2, 'new', 0, 4],
  ['open', 3, 1, 'contacted', 1, 12],
  ['open', 3, 0, 'qualified', 2, 45],
  ['open', 4, 2, 'contacted', 3, 8],
  ['open', 4, 0, 'site_visit', 4, 95],
  ['open', null, 1, 'new', 5, 20],
  ['open', 5, 0, 'negotiation', 6, 130],
  ['open', 5, 1, 'contacted', 7, 30],
  ['open', 6, 0, 'qualified', 8, 200],
  ['open', 6, 1, 'site_visit', 9, 60],
  ['open', null, 1, 'new', 10, 2],
  ['open', 3, 0, 'negotiation', 11, 300],
  ['open', null, 0, 'new', 12, 600],
  ['open', 4, 1, 'contacted', 13, 400],
  ['pending', 3, 0, 'site_visit', 9, 1500],
  ['pending', 5, 0, 'qualified', 1, 1700],
  ['pending', 6, 0, 'negotiation', 6, 2000],
  ['pending', 4, 0, 'contacted', 3, 2600],
  ['pending', null, 0, 'new', 0, 3000],
  ['closed', null, 0, 'converted', 11, 9000],
  ['closed', 5, 0, 'lost', 4, 11000],
  ['closed', 3, 0, 'converted', 9, 14000],
  ['closed', null, 0, 'lost', 8, 16000],
  ['closed', 6, 0, 'lost', 14, 20000],
];
// Every send to this conversation fails (DEMO-16).
const FAILING_CONVERSATION = 13;

const NEEDS: readonly LeadNeeds[] = [
  {
    budgetMin: 7_500_000,
    budgetMax: 9_000_000,
    location: 'Whitefield',
    propertyType: 'apartment',
    bhk: 2,
  },
  {
    budgetMin: 12_000_000,
    budgetMax: 15_000_000,
    location: 'Hebbal',
    propertyType: 'apartment',
    bhk: 3,
  },
  {
    budgetMin: 30_000_000,
    budgetMax: 36_000_000,
    location: 'Sarjapur Road',
    propertyType: 'villa',
    bhk: 4,
  },
  {
    budgetMin: 8_000_000,
    budgetMax: 11_000_000,
    location: 'Devanahalli',
    propertyType: 'plot',
    bhk: null,
  },
  {
    budgetMin: null,
    budgetMax: 9_500_000,
    location: 'Whitefield',
    propertyType: 'apartment',
    bhk: 2,
  },
  { budgetMin: null, budgetMax: null, location: null, propertyType: null, bhk: null },
];
// Which needs each script's customer has.
const SCRIPT_NEEDS: readonly number[] = [0, 1, 0, 4, 2, 3, 1, 0, 3, 0, 5, 4, 5, 4, 5];

const STAGE_PATH: readonly LeadStage[] = [
  'new',
  'contacted',
  'qualified',
  'site_visit',
  'negotiation',
  'converted',
];

type ProjectSeed = [
  string,
  string,
  ProjectView['type'],
  string,
  string[],
  [string, number | null, number, number, number | null, UnitView['status']][],
];

const PROJECTS: readonly ProjectSeed[] = [
  [
    'Green Valley Residency',
    'Whitefield, Bengaluru',
    'apartment',
    'Two towers of 2 and 3 BHK homes near the ITPL tech park, with a 1-acre central garden. Possession March 2027.',
    ['Clubhouse', 'Swimming pool', 'Gym', 'Covered parking', '24x7 security'],
    [
      ['A-302', 2, 1150, 8_200_000, 3, 'available'],
      ['A-705', 2, 1150, 8_600_000, 7, 'available'],
      ['B-1102', 3, 1480, 11_200_000, 11, 'reserved'],
      ['B-204', 2, 1150, 8_000_000, 2, 'sold'],
    ],
  ],
  [
    'Lakeview Towers',
    'Hebbal, Bengaluru',
    'apartment',
    'Premium 3 BHK homes facing Hebbal lake, 20 minutes from the airport road. Ready to move in.',
    ['Lake view', 'Clubhouse', 'Jogging track', "Children's play area"],
    [
      ['T1-1501', 3, 1620, 13_500_000, 15, 'available'],
      ['T1-1803', 3, 1620, 14_200_000, 18, 'available'],
      ['T2-0902', 3, 1620, 13_200_000, 9, 'sold'],
    ],
  ],
  [
    'Palm Grove Villas',
    'Sarjapur Road, Bengaluru',
    'villa',
    'A gated community of 40 independent 4 BHK villas with private gardens.',
    ['Private garden', 'Clubhouse', 'Tennis court', 'Gated community'],
    [
      ['V-12', 4, 3200, 32_000_000, null, 'available'],
      ['V-18', 4, 3400, 34_500_000, null, 'reserved'],
    ],
  ],
  [
    'Sunrise Plots',
    'Devanahalli, Bengaluru',
    'plot',
    'BMRDA-approved residential plots 10 minutes from Kempegowda International Airport.',
    ['Approved layout', 'Underground drainage', 'Wide roads', 'Park'],
    [
      ['P-21', null, 2400, 9_600_000, null, 'available'],
      ['P-22', null, 2400, 9_600_000, null, 'available'],
      ['P-40', null, 3000, 12_000_000, null, 'available'],
    ],
  ],
];

export function buildSeed(now: Date): DemoData {
  const t = now.getTime();
  const ago = (minutes: number): string => new Date(t - minutes * 60_000).toISOString();
  const ahead = (minutes: number): string => new Date(t + minutes * 60_000).toISOString();
  // Later today, but never past the end of the day (the "Today" tab of follow-ups).
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 0, 0);
  const today = (minutes: number): string =>
    new Date(
      Math.max(t + 60_000, Math.min(t + minutes * 60_000, endOfDay.getTime())),
    ).toISOString();

  const users: UserView[] = USERS.map(([name, email, role, active], i) => ({
    id: demoId(KIND.user, i + 1),
    name,
    email,
    role,
    active,
    createdAt: ago(60 * 24 * (90 - i * 8)),
  }));
  const sender = (i: number): MessageSender => {
    const u = users[i];
    if (!u) throw new Error(`no demo user ${i}`);
    return { id: u.id, name: u.name };
  };

  const contacts: ContactView[] = CUSTOMERS.map((name, i) => ({
    id: demoId(KIND.contact, i + 1),
    phone: customerPhone(i),
    name,
  }));

  const projects: ProjectView[] = PROJECTS.map(
    ([name, location, type, description, amenities, units], p) => {
      const slug = name.replace(/\s+/g, '-');
      const media = (n: number): string => demoId(KIND.media, p * 10 + n);
      const photos: MediaFile[] = ['Exterior', 'Living room', 'Site plan'].map((label, n) => ({
        id: media(n + 1),
        name: `${slug}-${label.replace(/\s+/g, '-').toLowerCase()}.jpg`,
        kind: 'image',
        sizeBytes: 820_000 + n * 140_000,
        url: null,
        sessionOnly: false,
      }));
      return {
        v: 1,
        id: demoId(KIND.project, p + 1),
        name,
        location,
        type,
        description,
        amenities,
        photos,
        brochures: [
          {
            id: media(9),
            name: `${slug}-brochure.pdf`,
            kind: 'pdf',
            sizeBytes: 2_400_000,
            url: null,
            sessionOnly: false,
          },
        ],
        units: units.map(([label, bhk, areaSqft, price, floor, status], u) => ({
          id: demoId(KIND.unit, p * 10 + u + 1),
          label,
          bhk,
          areaSqft,
          price,
          floor,
          status,
        })),
      };
    },
  );
  const card = (p: number): PropertyCard => {
    const project = projects[p];
    const unit = project?.units[0];
    if (!project || !unit) throw new Error(`no demo project ${p}`);
    return {
      projectId: project.id,
      unitId: unit.id,
      title: project.name,
      subtitle: `${unit.bhk ? `${unit.bhk} BHK, ` : ''}${unit.areaSqft.toLocaleString('en-IN')} sq ft · ${project.location}`,
      price: unit.price,
    };
  };

  const conversations: ConversationRow[] = [];
  const items: InboxItem[] = [];
  const leads: LeadRow[] = [];
  const leadHistory: LeadHistoryEntry[] = [];
  let messageN = 0;
  let noteN = 0;
  let historyN = 0;

  PLAN.forEach(([status, assignee, unread, stage, script, lastMin], c) => {
    const conversationId = demoId(KIND.conversation, c + 1);
    const contact = contacts[c];
    const steps = SCRIPTS[script] ?? [];
    if (!contact) return;
    // Closed chats without an assignee were Ananya's before she was deactivated.
    const agent = assignee ?? (status === 'closed' ? ANANYA : null);
    const gap = lastMin > 1000 ? 45 : 6;
    const firstAt = ago(lastMin + (steps.length - 1) * gap);
    const lastOut = steps.map((s) => s[0]).lastIndexOf('out');

    steps.forEach((step, k) => {
      const at = ago(lastMin + (steps.length - 1 - k) * gap);
      const kind = step[0];
      if (kind === 'note') {
        noteN += 1;
        items.push({
          kind: 'note',
          note: {
            v: 1,
            id: demoId(KIND.note, noteN),
            conversationId,
            body: step[1],
            author: sender(agent ?? 1),
            at,
          },
        });
        return;
      }
      messageN += 1;
      const base = {
        v: 1 as const,
        id: demoId(KIND.message, messageN),
        conversationId,
        at,
        unsupportedKind: null,
        failureReason: null,
      };
      let message: MessageView;
      if (kind === 'in' || kind === 'image') {
        message = {
          ...base,
          direction: 'inbound',
          type: kind === 'image' ? 'unsupported' : 'text',
          body: kind === 'image' ? null : step[1],
          unsupportedKind: kind === 'image' ? step[1] : null,
          status: null,
          sender: null,
        };
      } else {
        // Only the newest reply of a recent chat is still on its way; WhatsApp reported the rest.
        const status =
          kind === 'failed' ? 'failed' : k === lastOut && lastMin < 60 ? 'delivered' : 'read';
        message = {
          ...base,
          direction: 'outbound',
          type: 'text',
          body: step[1],
          status,
          failureReason: kind === 'failed' ? 'provider_error' : null,
          sender: kind === 'phone' ? null : sender(agent ?? 1),
        };
      }
      items.push({
        kind: 'message',
        message,
        property: kind === 'property' ? card(step[2]) : null,
      });
    });

    const leadId = demoId(KIND.lead, c + 1);
    conversations.push({
      id: conversationId,
      contactId: contact.id,
      status,
      assigneeId: assignee === null ? null : (users[assignee]?.id ?? null),
      unreadCount: unread,
      createdAt: firstAt,
      failsOnSend: c === FAILING_CONVERSATION,
    });

    const closed = stage === 'converted' || stage === 'lost';
    const updatedAt = ago(lastMin);
    leads.push({
      id: leadId,
      contactId: contact.id,
      stage,
      ownerId: assignee === null ? null : (users[assignee]?.id ?? null),
      needs: NEEDS[SCRIPT_NEEDS[script] ?? 5] ?? NEEDS[5]!,
      source: c === 7 || c === 15 ? 'campaign' : 'whatsapp',
      conversationId,
      createdAt: firstAt,
      updatedAt,
      closedAt: closed ? updatedAt : null,
    });

    // History: created, the owner, then each stage step up to the current one.
    const history = (
      field: LeadHistoryEntry['field'],
      from: string | null,
      to: string | null,
      at: string,
      actor: MessageSender | null,
    ): void => {
      historyN += 1;
      leadHistory.push({ id: demoId(KIND.history, historyN), leadId, actor, field, from, to, at });
    };
    history('created', null, 'new', firstAt, null);
    if (agent !== null) history('owner', null, sender(agent).name, firstAt, sender(1));
    const path =
      stage === 'lost'
        ? ['new', 'contacted', 'lost']
        : STAGE_PATH.slice(0, STAGE_PATH.indexOf(stage) + 1);
    for (let s = 1; s < path.length; s += 1) {
      const at = ago(lastMin + (path.length - 1 - s) * gap);
      history(
        'stage',
        path[s - 1] ?? null,
        path[s] ?? null,
        at,
        agent === null ? null : sender(agent),
      );
    }
  });

  // [conversation, due (minutes from now; negative is overdue), note, auto-reply, done]
  const followUpPlan: readonly [number, number | 'today', string, string | null, boolean][] = [
    [
      1,
      -180,
      'Confirm the Saturday site visit time',
      'Hi Meera, just confirming your site visit this Saturday at 10:30 am.',
      false,
    ],
    [
      3,
      -60 * 20,
      'Send the home-loan document list',
      'Here is the home-loan document list: PAN, Aadhaar, 6 months of salary slips and bank statements.',
      false,
    ],
    [6, -60 * 30, 'Get manager approval for the discount', null, false],
    [
      2,
      'today',
      'Call back after the family discussion',
      'Hello Arjun, did your family get a chance to look at the Green Valley details?',
      false,
    ],
    [8, 'today', 'Share the Sunrise layout plan', null, false],
    [
      9,
      'today',
      'Remind about Saturday visit',
      'Looking forward to seeing you at Green Valley Residency on Saturday!',
      false,
    ],
    [4, 60 * 24, 'Villa visit, Thursday 11 am', null, false],
    [11, 60 * 48, 'Collect the booking documents', null, false],
    [
      13,
      60 * 72,
      'Resend the maintenance details',
      'The maintenance charge is ₹4 per sq ft per month.',
      false,
    ],
    [15, 60 * 120, 'Check if the customer is still interested', null, false],
    [
      7,
      -60 * 48,
      'Share the possession date',
      'Possession of Green Valley Residency is planned for March 2027.',
      true,
    ],
    [14, -60 * 72, 'Confirm the site visit happened', null, true],
  ];
  const followUps: FollowUpRow[] = followUpPlan.map(([c, due, note, autoReply, done], i) => {
    const lead = leads[c];
    const dueAt = due === 'today' ? today(60 + i * 45) : due < 0 ? ago(-due) : ahead(due);
    return {
      id: demoId(KIND.followUp, i + 1),
      leadId: lead?.id ?? demoId(KIND.lead, c + 1),
      ownerId: lead?.ownerId ?? sender(3).id,
      dueAt,
      note,
      autoReply,
      sentAt: done && autoReply ? dueAt : null,
      doneAt: done ? dueAt : null,
    };
  });

  const recipient = (
    phone: string,
    name: string | null,
    status: CampaignRecipient['status'],
    reason: CampaignRecipient['reason'],
    at: string | null,
  ): CampaignRecipient => ({ phone, name, status, reason, at });

  const diwaliAt = 60 * 24 * 9;
  const campaigns: CampaignView[] = [
    {
      v: 1,
      id: demoId(KIND.campaign, 1),
      name: 'Site-visit weekend at Green Valley',
      message:
        'Hi {name}, Skyline Realty is holding a site-visit weekend at Green Valley Residency this Saturday and Sunday. Reply YES to book a slot. Reply STOP to opt out.',
      status: 'completed',
      testOnly: true,
      createdBy: sender(1),
      createdAt: ago(diwaliAt + 60),
      startedAt: ago(diwaliAt),
      completedAt: ago(diwaliAt - 20),
      recipients: [
        ...contacts
          .slice(0, 8)
          .map((ct, i) => recipient(ct.phone, ct.name, 'sent', null, ago(diwaliAt - i * 2))),
        recipient(customerPhone(23), 'Farhan Ali', 'skipped', 'opted_out', null),
        recipient('+919876543210', 'Outside contact', 'skipped', 'not_test_number', null),
        recipient(customerPhone(2), 'Arjun Reddy', 'skipped', 'duplicate', null),
        recipient('98765', null, 'skipped', 'invalid_phone', null),
      ],
    },
    {
      v: 1,
      id: demoId(KIND.campaign, 2),
      name: 'Lakeview Towers price update',
      message:
        'Hi {name}, new prices for Lakeview Towers 3 BHK homes start at ₹1.32 Cr. Reply to know more. Reply STOP to opt out.',
      status: 'completed',
      testOnly: true,
      createdBy: sender(2),
      createdAt: ago(60 * 24 * 5 + 30),
      startedAt: ago(60 * 24 * 5),
      completedAt: ago(60 * 24 * 5 - 12),
      recipients: [
        ...contacts
          .slice(14, 19)
          .map((ct, i) => recipient(ct.phone, ct.name, 'sent', null, ago(60 * 24 * 5 - i * 2))),
        recipient(
          customerPhone(19),
          'Lakshmi Narayan',
          'failed',
          'wa_not_connected',
          ago(60 * 24 * 5 - 11),
        ),
      ],
    },
  ];

  let auditN = 0;
  const audit: AuditEntry[] = [];
  const log = (
    minutesAgo: number,
    actor: number | null,
    action: AuditAction,
    target: string | null,
    detail: string | null,
  ): void => {
    auditN += 1;
    audit.push({
      id: demoId(KIND.audit, auditN),
      actor: actor === null ? null : sender(actor),
      action,
      target,
      detail,
      at: ago(minutesAgo),
    });
  };
  log(60 * 24 * 30, 0, 'user.created', 'Vikram Rao', 'Role: Employee');
  log(
    60 * 24 * 14,
    0,
    'user.deactivated',
    'Ananya Das',
    'History kept; open chats and leads unassigned',
  );
  log(
    diwaliAt + 60,
    1,
    'campaign.created',
    'Site-visit weekend at Green Valley',
    '12 rows, 8 valid',
  );
  log(diwaliAt, 1, 'campaign.started', 'Site-visit weekend at Green Valley', 'Test numbers only');
  log(
    diwaliAt - 20,
    null,
    'campaign.completed',
    'Site-visit weekend at Green Valley',
    '8 sent, 4 skipped',
  );
  log(20000, null, 'optout.added', '+1 202 555 0124', 'Customer replied STOP');
  log(60 * 24 * 5 + 30, 2, 'campaign.created', 'Lakeview Towers price update', '6 rows, 6 valid');
  log(60 * 24 * 5, 2, 'campaign.started', 'Lakeview Towers price update', 'Test numbers only');
  log(
    60 * 24 * 5 - 12,
    null,
    'campaign.completed',
    'Lakeview Towers price update',
    '5 sent, 1 failed',
  );
  log(185, 0, 'auth.login', 'Aarav Shah', null);
  log(180, 0, 'wa.connected', DEMO_COMPANY_NUMBER, 'Simulated QR scan');
  log(170, 1, 'auth.login', 'Neha Kapoor', null);
  log(160, 3, 'auth.login', 'Priya Nair', null);
  log(150, 4, 'auth.login', 'Karan Verma', null);
  log(140, 1, 'conversation.assigned', 'Meera Joshi', 'Unassigned → Priya Nair');
  log(120, 1, 'conversation.assigned', 'Kavya Menon', 'Unassigned → Karan Verma');
  log(50, 3, 'lead.stage', 'Arjun Reddy', 'Contacted → Qualified');
  log(35, 5, 'lead.stage', 'Pooja Desai', 'Site visit → Negotiation');

  return {
    v: 1,
    users,
    contacts,
    conversations,
    items,
    leads,
    leadHistory,
    projects,
    followUps,
    campaigns,
    optOuts: [
      { phone: customerPhone(23), reason: 'customer_stop', addedBy: null, at: ago(20000) },
      { phone: '+12025550199', reason: 'manual', addedBy: sender(1), at: ago(60 * 24 * 20) },
    ],
    audit,
    wa: {
      state: { v: 1, state: 'connected', provider: 'fake', at: ago(180) },
      number: DEMO_COMPANY_NUMBER,
      since: ago(180),
      qr: null,
      qrAttempts: 0,
    },
    locks: [],
    settings: { autoActivity: true },
  };
}
