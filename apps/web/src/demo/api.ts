// The demo api: one async function per future route, run in the browser against the demo store.
// It is the "server" of demo mode (DEMO Decision 6): every call reads the session like a cookie,
// checks the role and the Employee scope, and only then answers. Nothing here calls `fetch`.
import {
  CLOSED_LEAD_STAGES,
  type AuditEntry,
  type FollowUpView,
  type InboxConversation,
  type InboxItem,
  type LeadHistoryEntry,
  type LeadView,
  type MessageSender,
  type ProjectView,
  type SessionUser,
  type UserView,
} from '@crm/shared';
import { demoCan, scopedToSelf, type DemoAction } from './access.ts';
import type { DemoBus } from './bus.ts';
import { DEMO_PASSWORD } from './seed.ts';
import type { ConversationRow, DemoData, DemoStore, FollowUpRow, LeadRow, WaRow } from './store.ts';

export type DemoErrorCode =
  | 'invalid_credentials'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body'
  | 'wa_not_connected'
  | 'reply_locked'
  | 'already_sent';

const STATUS: Record<DemoErrorCode, number> = {
  invalid_credentials: 401,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_body: 400,
  wa_not_connected: 409,
  reply_locked: 409,
  already_sent: 409,
};

export class DemoApiError extends Error {
  readonly status: number;
  readonly code: DemoErrorCode;
  constructor(code: DemoErrorCode) {
    super(code);
    this.code = code;
    this.status = STATUS[code];
  }
}

// Where the logged-in user's id is kept: sessionStorage in the browser, so each tab can be a
// different user (DEMO-07).
export interface SessionSlot {
  get(): string | null;
  set(userId: string | null): void;
}

export function memorySession(): SessionSlot {
  let id: string | null = null;
  return {
    get: () => id,
    set: (value) => void (id = value),
  };
}

export interface DemoApiDeps {
  store: DemoStore;
  bus: DemoBus;
  session: SessionSlot;
  now?: () => Date;
  // The simulated network time (DEMO Decision 5). Tests pass one that resolves at once.
  delay?: () => Promise<void>;
  newId?: () => string;
}

export interface WaView {
  state: WaRow['state'];
  number: string | null;
  since: string;
}

function randomDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));
}

// Row → view mappers, the demo counterpart of packages/db/src/views.ts.
export function senderOf(data: DemoData, userId: string | null): MessageSender | null {
  const user = userId ? data.users.find((u) => u.id === userId) : undefined;
  return user ? { id: user.id, name: user.name } : null;
}

function byAt<T extends { at: string }>(a: T, b: T): number {
  return a.at.localeCompare(b.at);
}

function itemAt(item: InboxItem): string {
  return item.kind === 'message' ? item.message.at : item.note.at;
}

function itemConversation(item: InboxItem): string {
  return item.kind === 'message' ? item.message.conversationId : item.note.conversationId;
}

export function itemsOf(data: DemoData, conversationId: string): InboxItem[] {
  return data.items
    .filter((item) => itemConversation(item) === conversationId)
    .sort((a, b) => itemAt(a).localeCompare(itemAt(b)));
}

// The customer's open lead, or their newest one when all are closed.
export function leadForContact(data: DemoData, contactId: string): LeadRow | undefined {
  const leads = data.leads
    .filter((l) => l.contactId === contactId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return leads.find((l) => !CLOSED_LEAD_STAGES.includes(l.stage)) ?? leads[0];
}

export function toConversation(data: DemoData, row: ConversationRow): InboxConversation {
  const contact = data.contacts.find((c) => c.id === row.contactId);
  if (!contact) throw new Error(`conversation ${row.id} has no contact`);
  const messages = itemsOf(data, row.id).flatMap((i) => (i.kind === 'message' ? [i.message] : []));
  const last = messages.at(-1) ?? null;
  const lead = leadForContact(data, row.contactId);
  return {
    v: 1,
    id: row.id,
    contact,
    lastMessageAt: last?.at ?? null,
    lastMessage: last,
    status: row.status,
    assignee: senderOf(data, row.assigneeId),
    unreadCount: row.unreadCount,
    leadId: lead?.id ?? null,
    leadStage: lead?.stage ?? null,
  };
}

export function toLead(data: DemoData, row: LeadRow): LeadView {
  const contact = data.contacts.find((c) => c.id === row.contactId);
  if (!contact) throw new Error(`lead ${row.id} has no contact`);
  return {
    v: 1,
    id: row.id,
    contact,
    stage: row.stage,
    owner: senderOf(data, row.ownerId),
    needs: row.needs,
    source: row.source,
    conversationId: row.conversationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  };
}

export function toFollowUp(data: DemoData, row: FollowUpRow): FollowUpView {
  const lead = data.leads.find((l) => l.id === row.leadId);
  const contact = lead && data.contacts.find((c) => c.id === lead.contactId);
  const owner = senderOf(data, row.ownerId);
  if (!lead || !contact || !owner) throw new Error(`follow-up ${row.id} is incomplete`);
  return {
    v: 1,
    id: row.id,
    leadId: row.leadId,
    conversationId: lead.conversationId,
    contact,
    owner,
    dueAt: row.dueAt,
    note: row.note,
    autoReply: row.autoReply,
    sentAt: row.sentAt,
    doneAt: row.doneAt,
  };
}

export function createDemoApi(deps: DemoApiDeps) {
  const { store, session } = deps;
  const delay = deps.delay ?? randomDelay;

  function currentUser(): UserView | undefined {
    const id = session.get();
    const user = id ? store.data.users.find((u) => u.id === id) : undefined;
    return user?.active ? user : undefined;
  }

  // Every protected call starts here: the session, then the role (DEMO-09).
  async function guard(action: DemoAction): Promise<UserView> {
    await delay();
    const user = currentUser();
    if (!user) throw new DemoApiError('unauthenticated');
    if (!demoCan(user.role, action)) throw new DemoApiError('forbidden');
    return user;
  }

  // DEMO-10: an Employee sees only rows assigned to them; anything else is "not found".
  const ownsConversation = (user: UserView, row: ConversationRow): boolean =>
    !scopedToSelf(user.role) || row.assigneeId === user.id;
  const ownsLead = (user: UserView, row: LeadRow): boolean =>
    !scopedToSelf(user.role) || row.ownerId === user.id;
  const ownsFollowUp = (user: UserView, row: FollowUpRow): boolean =>
    !scopedToSelf(user.role) || row.ownerId === user.id;

  function conversationRow(user: UserView, id: string): ConversationRow {
    const row = store.data.conversations.find((c) => c.id === id);
    if (!row || !ownsConversation(user, row)) throw new DemoApiError('not_found');
    return row;
  }

  function leadRow(user: UserView, id: string): LeadRow {
    const row = store.data.leads.find((l) => l.id === id);
    if (!row || !ownsLead(user, row)) throw new DemoApiError('not_found');
    return row;
  }

  function audit(
    actor: MessageSender | null,
    action: AuditEntry['action'],
    target: string | null,
    detail: string | null = null,
  ): void {
    store.write((data) => {
      data.audit.push({
        id: deps.newId?.() ?? crypto.randomUUID(),
        actor,
        action,
        target,
        detail,
        at: (deps.now?.() ?? new Date()).toISOString(),
      });
    });
  }

  const toSession = (user: UserView): SessionUser => ({
    id: user.id,
    name: user.name,
    role: user.role,
  });

  return {
    // DEMO-06: one message for every failure, as the real api does (FND-08).
    async login(email: string, password: string): Promise<SessionUser> {
      await delay();
      const wanted = email.trim().toLowerCase();
      const user = store.data.users.find((u) => u.email === wanted);
      if (!user || !user.active || password !== DEMO_PASSWORD) {
        throw new DemoApiError('invalid_credentials');
      }
      session.set(user.id);
      audit({ id: user.id, name: user.name }, 'auth.login', user.name);
      return toSession(user);
    },

    async me(): Promise<SessionUser | null> {
      await delay();
      const user = currentUser();
      if (!user) session.set(null);
      return user ? toSession(user) : null;
    },

    async logout(): Promise<void> {
      await delay();
      const user = currentUser();
      if (user) {
        // The user's reply locks go with them (DEMO-20).
        store.write((data) => {
          data.locks = data.locks.filter((l) => l.holder.id !== user.id);
        });
        audit({ id: user.id, name: user.name }, 'auth.logout', user.name);
      }
      session.set(null);
    },

    async getWa(): Promise<WaView> {
      await guard('wa.read');
      const { state, number, since } = store.data.wa;
      return { state, number, since };
    },

    async listConversations(): Promise<InboxConversation[]> {
      const user = await guard('inbox.read');
      const data = store.data;
      return data.conversations
        .filter((row) => ownsConversation(user, row))
        .map((row) => toConversation(data, row))
        .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    },

    async getConversation(id: string): Promise<InboxConversation> {
      const user = await guard('inbox.read');
      return toConversation(store.data, conversationRow(user, id));
    },

    async listItems(conversationId: string): Promise<InboxItem[]> {
      const user = await guard('inbox.read');
      conversationRow(user, conversationId);
      return itemsOf(store.data, conversationId);
    },

    async listLeads(): Promise<LeadView[]> {
      const user = await guard('leads.read');
      const data = store.data;
      return data.leads
        .filter((row) => ownsLead(user, row))
        .map((row) => toLead(data, row))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getLead(id: string): Promise<LeadView> {
      const user = await guard('leads.read');
      return toLead(store.data, leadRow(user, id));
    },

    async listLeadHistory(leadId: string): Promise<LeadHistoryEntry[]> {
      const user = await guard('leads.read');
      leadRow(user, leadId);
      return store.data.leadHistory.filter((h) => h.leadId === leadId).sort(byAt);
    },

    async listFollowUps(): Promise<FollowUpView[]> {
      const user = await guard('followups.manage');
      const data = store.data;
      return data.followUps
        .filter((row) => ownsFollowUp(user, row))
        .map((row) => toFollowUp(data, row))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },

    async listProjects(): Promise<ProjectView[]> {
      await guard('properties.read');
      return store.data.projects;
    },

    async listUsers(): Promise<UserView[]> {
      await guard('users.manage');
      return store.data.users;
    },

    // Newest first; read-only (DEMO-31).
    async listAudit(): Promise<AuditEntry[]> {
      await guard('audit.read');
      return [...store.data.audit].sort((a, b) => b.at.localeCompare(a.at));
    },

    // The demo accounts for the login page. Public, like the page itself.
    demoAccounts(): Pick<UserView, 'name' | 'email' | 'role' | 'active'>[] {
      return store.data.users.map(({ name, email, role, active }) => ({
        name,
        email,
        role,
        active,
      }));
    },

    resetData(): void {
      store.reset();
    },
  };
}

export type DemoApi = ReturnType<typeof createDemoApi>;
