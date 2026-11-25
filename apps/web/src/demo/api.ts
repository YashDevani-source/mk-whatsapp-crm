// The demo api: one async function per future route, run in the browser against the demo store.
// It is the "server" of demo mode (DEMO Decision 6): every call reads the session like a cookie,
// checks the role, the Employee scope and the reply lock, and only then answers. Nothing here
// calls `fetch`.
import {
  FollowUpInput,
  LeadNeeds,
  SendMessageRequest,
  type AuditEntry,
  type ConversationStatus,
  type FollowUpView,
  type InboxConversation,
  type InboxItem,
  type LeadHistoryEntry,
  type LeadStage,
  type LeadView,
  type MediaFile,
  type MessageSender,
  type ProjectView,
  type ReplyLock,
  type Role,
  type SessionUser,
  type UserView,
  type WaQr,
} from '@crm/shared';
import { demoCan, scopedToSelf, type DemoAction } from './access.ts';
import type { DemoBus } from './bus.ts';
import * as engine from './engine.ts';
import {
  budgetValid,
  propertyCard,
  propertyMessage,
  uploadKind,
  uploadProblem,
  type UploadFile,
} from './rules.ts';
import { DEMO_PASSWORD } from './seed.ts';
import type { ConversationRow, DemoData, DemoStore, FollowUpRow, LeadRow, WaRow } from './store.ts';
import { byAt, itemsOf, toConversation, toFollowUp, toLead } from './views.ts';

export type DemoErrorCode =
  | 'invalid_credentials'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_body'
  | 'wrong_state'
  | 'wa_not_connected'
  | 'reply_locked'
  | 'already_sent';

const STATUS: Record<DemoErrorCode, number> = {
  invalid_credentials: 401,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_body: 400,
  wrong_state: 409,
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
  random?: () => number;
}

export interface WaView {
  state: WaRow['state'];
  number: string | null;
  since: string;
}

export interface WaAdminView extends WaView {
  qr: WaQr | null;
  qrAttempts: number;
}

export interface Assignee extends MessageSender {
  role: Role;
}

function randomDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 250));
}

export function createDemoApi(deps: DemoApiDeps) {
  const { store, session, bus } = deps;
  const delay = deps.delay ?? randomDelay;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const random = deps.random ?? Math.random;
  // Uploaded files live for this tab's session only (DEMO-24): object URLs cannot be saved.
  const sessionMedia = new Map<string, MediaFile[]>();

  function withSessionMedia(project: ProjectView): ProjectView {
    const extra = sessionMedia.get(project.id) ?? [];
    return {
      ...project,
      photos: [...project.photos, ...extra.filter((m) => m.kind === 'image')],
      brochures: [...project.brochures, ...extra.filter((m) => m.kind === 'pdf')],
    };
  }

  // Runs a change in one store write, then sends its live events (to this tab and the others).
  function mutate<T>(change: (data: DemoData, ctx: engine.EngineCtx) => T): T {
    const ctx: engine.EngineCtx = { now: now(), newId, random, events: [] };
    const result = store.write((data) => change(data, ctx));
    for (const envelope of ctx.events) bus.emitEnvelope(envelope);
    return result;
  }

  function currentUser(): UserView | undefined {
    const id = session.get();
    const user = id ? store.data.users.find((u) => u.id === id) : undefined;
    return user?.active ? user : undefined;
  }

  // Every protected call starts here: the session, then the role (DEMO-09).
  async function guard(action: DemoAction): Promise<UserView> {
    await delay();
    // Answer from the newest saved copy, which another tab may have written (DEMO Decision 21).
    store.sync();
    const user = currentUser();
    if (!user) throw new DemoApiError('unauthenticated');
    if (!demoCan(user.role, action)) throw new DemoApiError('forbidden');
    return user;
  }

  const sender = (user: UserView): MessageSender => ({ id: user.id, name: user.name });

  // DEMO-10: an Employee sees only rows assigned to them; anything else is "not found".
  const ownsConversation = (user: UserView, row: ConversationRow): boolean =>
    !scopedToSelf(user.role) || row.assigneeId === user.id;
  const ownsLead = (user: UserView, row: LeadRow): boolean =>
    !scopedToSelf(user.role) || row.ownerId === user.id;
  const ownsFollowUp = (user: UserView, row: FollowUpRow): boolean =>
    !scopedToSelf(user.role) || row.ownerId === user.id;

  function followUpRow(user: UserView, id: string, data: DemoData = store.data): FollowUpRow {
    const row = data.followUps.find((f) => f.id === id);
    if (!row || !ownsFollowUp(user, row)) throw new DemoApiError('not_found');
    return row;
  }

  function conversationRow(user: UserView, id: string, data: DemoData = store.data) {
    const row = data.conversations.find((c) => c.id === id);
    if (!row || !ownsConversation(user, row)) throw new DemoApiError('not_found');
    return row;
  }

  function leadRow(user: UserView, id: string, data: DemoData = store.data): LeadRow {
    const row = data.leads.find((l) => l.id === id);
    if (!row || !ownsLead(user, row)) throw new DemoApiError('not_found');
    return row;
  }

  // The checks every outgoing message passes (DEMO-13, DEMO-17, DEMO-20).
  function checkSend(data: DemoData, user: UserView, conversationId: string): void {
    if (!engine.waConnected(data)) throw new DemoApiError('wa_not_connected');
    const lock = engine.activeLock(data, conversationId, now());
    if (lock && lock.holder.id !== user.id) throw new DemoApiError('reply_locked');
  }

  function parseText(text: string): string {
    const parsed = SendMessageRequest.safeParse({ text });
    if (!parsed.success) throw new DemoApiError('invalid_body');
    return parsed.data.text;
  }

  const toSession = (user: UserView): SessionUser => ({
    id: user.id,
    name: user.name,
    role: user.role,
  });

  return {
    // ── Session (DEMO-06, DEMO-07) ──

    // One message for every failure, as the real api does (FND-08).
    async login(email: string, password: string): Promise<SessionUser> {
      await delay();
      const wanted = email.trim().toLowerCase();
      const user = store.data.users.find((u) => u.email === wanted);
      if (!user || !user.active || password !== DEMO_PASSWORD) {
        throw new DemoApiError('invalid_credentials');
      }
      session.set(user.id);
      mutate((data, ctx) => engine.audit(data, ctx, sender(user), 'auth.login', user.name));
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
        mutate((data, ctx) => {
          // The user's reply locks go with them (DEMO-20).
          for (const lock of data.locks.filter((l) => l.holder.id === user.id)) {
            engine.releaseLock(data, ctx, lock.conversationId, user.id);
          }
          engine.audit(data, ctx, sender(user), 'auth.logout', user.name);
        });
      }
      session.set(null);
    },

    // ── WhatsApp, simulated (DEMO-11 to DEMO-13) ──

    async getWa(): Promise<WaView> {
      await guard('wa.read');
      const { state, number, since } = store.data.wa;
      return { state, number, since };
    },

    async getWaAdmin(): Promise<WaAdminView> {
      await guard('wa.manage');
      const { state, number, since, qr, qrAttempts } = store.data.wa;
      return { state, number, since, qr, qrAttempts };
    },

    async requestQr(): Promise<void> {
      await guard('wa.manage');
      if (!mutate((data, ctx) => engine.waRequestQr(data, ctx))) {
        throw new DemoApiError('wrong_state');
      }
    },

    async scanQr(): Promise<void> {
      await guard('wa.manage');
      if (!mutate((data, ctx) => engine.waScan(data, ctx))) throw new DemoApiError('wrong_state');
    },

    async logoutWa(): Promise<void> {
      const user = await guard('wa.manage');
      if (!mutate((data, ctx) => engine.waLogout(data, ctx, sender(user)))) {
        throw new DemoApiError('wrong_state');
      }
    },

    // ── Inbox (DEMO-14 to DEMO-21) ──

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

    // DEMO-15: opening a chat marks it read for the team.
    async openConversation(id: string): Promise<void> {
      const user = await guard('inbox.read');
      if (conversationRow(user, id).unreadCount === 0) return;
      mutate((data, ctx) => {
        const row = conversationRow(user, id, data);
        row.unreadCount = 0;
        ctx.events.push({ event: 'conversation.updated', payload: toConversation(data, row) });
      });
    },

    async sendMessage(conversationId: string, text: string): Promise<void> {
      const user = await guard('messages.send');
      const body = parseText(text);
      mutate((data, ctx) => {
        const row = conversationRow(user, conversationId, data);
        checkSend(data, user, conversationId);
        engine.sendOutbound(data, ctx, row, sender(user), body);
      });
    },

    // A failed message is sent again as a new message; the failed one stays as it was.
    async retryMessage(messageId: string): Promise<void> {
      const user = await guard('messages.send');
      mutate((data, ctx) => {
        const item = data.items.find((i) => i.kind === 'message' && i.message.id === messageId);
        if (item?.kind !== 'message') throw new DemoApiError('not_found');
        const row = conversationRow(user, item.message.conversationId, data);
        if (item.message.status !== 'failed' || item.message.body === null) {
          throw new DemoApiError('wrong_state');
        }
        checkSend(data, user, row.id);
        engine.sendOutbound(data, ctx, row, sender(user), item.message.body, item.property);
      });
    },

    // DEMO-18: notes need no connection and no lock, and never reach the customer.
    async addNote(conversationId: string, text: string): Promise<void> {
      const user = await guard('inbox.read');
      const body = parseText(text);
      mutate((data, ctx) => {
        engine.addNote(data, ctx, conversationRow(user, conversationId, data), sender(user), body);
      });
    },

    async listAssignees(): Promise<Assignee[]> {
      await guard('inbox.assign');
      return store.data.users
        .filter((u) => u.active)
        .map((u) => ({ id: u.id, name: u.name, role: u.role }));
    },

    async assignConversation(conversationId: string, assigneeId: string | null): Promise<void> {
      const user = await guard('inbox.assign');
      mutate((data, ctx) => {
        const row = conversationRow(user, conversationId, data);
        if (assigneeId !== null && !data.users.some((u) => u.id === assigneeId && u.active)) {
          throw new DemoApiError('invalid_body');
        }
        engine.assign(data, ctx, row, sender(user), assigneeId);
      });
    },

    async setConversationStatus(conversationId: string, status: ConversationStatus): Promise<void> {
      const user = await guard('inbox.read');
      mutate((data, ctx) => {
        engine.setStatus(
          data,
          ctx,
          conversationRow(user, conversationId, data),
          sender(user),
          status,
        );
      });
    },

    // ── Reply lock (DEMO-20) ──

    async getLock(conversationId: string): Promise<ReplyLock | null> {
      const user = await guard('inbox.read');
      conversationRow(user, conversationId);
      return engine.activeLock(store.data, conversationId, now());
    },

    // Typing takes the lock, or renews it; someone else's lock refuses it.
    async typing(conversationId: string): Promise<ReplyLock> {
      const user = await guard('messages.send');
      return mutate((data, ctx) => {
        conversationRow(user, conversationId, data);
        const lock = engine.activeLock(data, conversationId, ctx.now);
        if (lock && lock.holder.id !== user.id) throw new DemoApiError('reply_locked');
        return engine.takeLock(data, ctx, conversationId, sender(user));
      });
    },

    async stopTyping(conversationId: string): Promise<void> {
      const user = await guard('messages.send');
      mutate((data, ctx) => engine.releaseLock(data, ctx, conversationId, user.id));
    },

    // Managers and the Super Admin can take a locked chat over (DEMO Decision 8).
    async takeOver(conversationId: string): Promise<ReplyLock> {
      const user = await guard('inbox.assign');
      return mutate((data, ctx) => {
        conversationRow(user, conversationId, data);
        return engine.takeLock(data, ctx, conversationId, sender(user));
      });
    },

    // ── Leads, follow-ups, properties, users, audit (read; edits arrive in phases 3 and 4) ──

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

    // DEMO-23: stage, needs and owner changes, each with a history row and an audit row.
    async updateLeadStage(id: string, stage: LeadStage): Promise<void> {
      const user = await guard('leads.edit');
      mutate((data, ctx) => {
        if (!engine.setLeadStage(data, ctx, leadRow(user, id, data), sender(user), stage)) {
          throw new DemoApiError('wrong_state');
        }
      });
    },

    async updateLeadNeeds(id: string, needs: LeadNeeds): Promise<void> {
      const user = await guard('leads.edit');
      const parsed = LeadNeeds.safeParse(needs);
      if (!parsed.success || !budgetValid(parsed.data)) throw new DemoApiError('invalid_body');
      mutate((data, ctx) => {
        engine.setLeadNeeds(data, ctx, leadRow(user, id, data), sender(user), parsed.data);
      });
    },

    async assignLead(id: string, ownerId: string | null): Promise<void> {
      const user = await guard('leads.assign');
      mutate((data, ctx) => {
        const lead = leadRow(user, id, data);
        if (ownerId !== null && !data.users.some((u) => u.id === ownerId && u.active)) {
          throw new DemoApiError('invalid_body');
        }
        engine.setLeadOwner(data, ctx, lead, sender(user), ownerId);
      });
    },

    // The customer's other leads (earlier, closed ones), newest first.
    async listOtherLeads(id: string): Promise<LeadView[]> {
      const user = await guard('leads.read');
      const lead = leadRow(user, id);
      const data = store.data;
      return data.leads
        .filter((l) => l.contactId === lead.contactId && l.id !== id && ownsLead(user, l))
        .map((l) => toLead(data, l))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async listFollowUps(): Promise<FollowUpView[]> {
      const user = await guard('followups.manage');
      const data = store.data;
      return data.followUps
        .filter((row) => ownsFollowUp(user, row))
        .map((row) => toFollowUp(data, row))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },

    // DEMO-25: follow-ups. An Employee creates them only on their own leads.
    async createFollowUp(input: FollowUpInput): Promise<void> {
      const user = await guard('followups.manage');
      const parsed = FollowUpInput.safeParse(input);
      if (!parsed.success) throw new DemoApiError('invalid_body');
      const { leadId, dueAt, note, autoReply } = parsed.data;
      mutate((data, ctx) => {
        const lead = leadRow(user, leadId, data);
        data.followUps.push({
          id: ctx.newId(),
          leadId,
          ownerId: lead.ownerId ?? user.id,
          dueAt,
          note,
          autoReply,
          sentAt: null,
          doneAt: null,
        });
      });
    },

    async updateFollowUp(id: string, input: Omit<FollowUpInput, 'leadId'>): Promise<void> {
      const user = await guard('followups.manage');
      const parsed = FollowUpInput.omit({ leadId: true }).safeParse(input);
      if (!parsed.success) throw new DemoApiError('invalid_body');
      mutate((data) => {
        const row = followUpRow(user, id, data);
        row.dueAt = parsed.data.dueAt;
        row.note = parsed.data.note;
        // A sent auto-reply stays as it was sent.
        if (row.sentAt === null) row.autoReply = parsed.data.autoReply;
      });
    },

    async completeFollowUp(id: string): Promise<void> {
      const user = await guard('followups.manage');
      mutate((data, ctx) => {
        const row = followUpRow(user, id, data);
        if (row.doneAt === null) row.doneAt = ctx.now.toISOString();
      });
    },

    // "Run now (test)": sends the test auto-reply into the lead's chat, once (DEMO-25).
    async runFollowUp(id: string): Promise<void> {
      const user = await guard('followups.manage');
      mutate((data, ctx) => {
        const row = followUpRow(user, id, data);
        if (row.sentAt !== null) throw new DemoApiError('already_sent');
        if (row.autoReply === null) throw new DemoApiError('invalid_body');
        const lead = data.leads.find((l) => l.id === row.leadId);
        const chat = data.conversations.find((c) => c.id === lead?.conversationId);
        if (!lead || !chat) throw new DemoApiError('wrong_state');
        checkSend(data, user, chat.id);
        const owner = engine.senderName(data, row.ownerId) ?? sender(user);
        engine.sendOutbound(
          data,
          ctx,
          chat,
          { id: owner.id, name: `${owner.name} · auto-reply (test)` },
          row.autoReply,
        );
        row.sentAt = ctx.now.toISOString();
        engine.audit(
          data,
          ctx,
          sender(user),
          'followup.sent',
          engine.contactLabel(data, lead.contactId),
          'Run now (test)',
        );
      });
    },

    async listProjects(): Promise<ProjectView[]> {
      await guard('properties.read');
      return store.data.projects.map(withSessionMedia);
    },

    async getProject(id: string): Promise<ProjectView> {
      await guard('properties.read');
      const project = store.data.projects.find((p) => p.id === id);
      if (!project) throw new DemoApiError('not_found');
      return withSessionMedia(project);
    },

    // DEMO-24: a property card into a chat, as a normal outbound message.
    async shareProperty(
      conversationId: string,
      projectId: string,
      unitId: string | null,
    ): Promise<void> {
      const user = await guard('messages.send');
      mutate((data, ctx) => {
        const row = conversationRow(user, conversationId, data);
        const project = data.projects.find((p) => p.id === projectId);
        if (!project || (unitId !== null && !project.units.some((u) => u.id === unitId))) {
          throw new DemoApiError('not_found');
        }
        checkSend(data, user, row.id);
        const card = propertyCard(project, unitId);
        engine.sendOutbound(data, ctx, row, sender(user), propertyMessage(project, card), card);
        engine.audit(
          data,
          ctx,
          sender(user),
          'property.shared',
          engine.contactLabel(data, row.contactId),
          card.title,
        );
      });
    },

    // DEMO-24: JPG/PNG up to 5 MB, PDF up to 10 MB, kept for this session only.
    async uploadMedia(projectId: string, file: UploadFile & { url: string }): Promise<MediaFile> {
      await guard('properties.manage');
      if (!store.data.projects.some((p) => p.id === projectId)) throw new DemoApiError('not_found');
      const kind = uploadKind(file);
      if (uploadProblem(file) !== null || kind === null) throw new DemoApiError('invalid_body');
      const media: MediaFile = {
        id: newId(),
        name: file.name,
        kind,
        sizeBytes: file.size,
        url: file.url,
        sessionOnly: true,
      };
      sessionMedia.set(projectId, [...(sessionMedia.get(projectId) ?? []), media]);
      // Nothing saved changes; this only tells this tab's pages to load again.
      store.write(() => undefined);
      return media;
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

    // ── Demo controls: the reviewer's tools, open to every logged-in user, labelled Demo ──

    async demoContacts(): Promise<{ phone: string; label: string }[]> {
      await guard('inbox.read');
      return store.data.contacts.map((c) => ({ phone: c.phone, label: c.name ?? c.phone }));
    },

    async demoAgents(): Promise<Assignee[]> {
      await guard('inbox.read');
      return store.data.users
        .filter((u) => u.active)
        .map((u) => ({ id: u.id, name: u.name, role: u.role }));
    },

    async simulateInbound(input: engine.InboundInput): Promise<string> {
      await guard('inbox.read');
      if (input.text.trim() === '') throw new DemoApiError('invalid_body');
      const id = mutate((data, ctx) => engine.receiveInbound(data, ctx, input));
      if (id === null) throw new DemoApiError('wrong_state');
      return id;
    },

    async simulateAgent(conversationId: string, agentId: string): Promise<void> {
      await guard('inbox.read');
      mutate((data, ctx) => {
        const row = data.conversations.find((c) => c.id === conversationId);
        const agent = data.users.find((u) => u.id === agentId && u.active);
        if (!row || !agent) throw new DemoApiError('not_found');
        if (!engine.waConnected(data)) throw new DemoApiError('wa_not_connected');
        engine.simulateAgent(data, ctx, row, sender(agent));
      });
    },

    async dropConnection(): Promise<void> {
      await guard('inbox.read');
      if (!mutate((data, ctx) => engine.waDrop(data, ctx))) throw new DemoApiError('wrong_state');
    },

    async setAutoActivity(on: boolean): Promise<void> {
      await guard('inbox.read');
      mutate((data) => {
        data.settings.autoActivity = on;
        data.sim.nextAutoAt = null;
      });
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
