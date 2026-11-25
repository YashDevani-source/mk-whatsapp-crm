// The demo's state changes, shared by the demo api (after its role, scope and lock checks) and
// the simulator. Each function changes the data inside one `store.write` and queues the live
// events, which the caller sends once the write is saved.
import {
  CLOSED_LEAD_STAGES,
  LEAD_STAGE_LABELS,
  nextStatus,
  type AuditAction,
  type ConversationStatus,
  type LeadNeeds,
  type LeadStage,
  type MessageFailureReason,
  type MessageSender,
  type MessageView,
  type PropertyCard,
  type ReplyLock,
  type ReportedStatus,
  type UserView,
  type WaConnectionState,
  type WaReason,
} from '@crm/shared';
import { leadForContact, toConversation } from './views.ts';
import type { BusEnvelope, DemoEventName, DemoEvents } from './bus.ts';
import { DEMO_COMPANY_NUMBER } from './seed.ts';
import { CAMPAIGN_STEP_MS, campaignCounts } from './campaigns.ts';
import { needsSummary } from './rules.ts';
import type { ConversationRow, DemoData, LeadRow, SimTask } from './store.ts';

// DEMO-11 to DEMO-13, DEMO-16, DEMO-20, DEMO-22 timings.
export const TIMING = {
  qrRefreshMs: 20_000,
  qrMaxAttempts: 3,
  connectMs: 1_500,
  reconnectMs: 8_000,
  sentMs: 1_000,
  deliveredMs: 2_500,
  readMinMs: 4_000,
  readSpreadMs: 5_000,
  failMs: 1_500,
  lockMs: 60_000,
  agentReplyMs: 8_000,
  autoMs: 45_000,
} as const;

export interface EngineCtx {
  now: Date;
  newId: () => string;
  random: () => number;
  events: BusEnvelope[];
}

function emit<E extends DemoEventName>(ctx: EngineCtx, event: E, payload: DemoEvents[E]): void {
  ctx.events.push({ event, payload } as BusEnvelope);
}

const iso = (ctx: EngineCtx, plusMs = 0): string =>
  new Date(ctx.now.getTime() + plusMs).toISOString();

type NewTask = SimTask extends infer T ? (T extends SimTask ? Omit<T, 'id' | 'at'> : never) : never;

function schedule(data: DemoData, ctx: EngineCtx, inMs: number, task: NewTask): void {
  data.sim.tasks.push({ ...task, id: ctx.newId(), at: iso(ctx, inMs) } as SimTask);
}

export function audit(
  data: DemoData,
  ctx: EngineCtx,
  actor: MessageSender | null,
  action: AuditAction,
  target: string | null,
  detail: string | null = null,
): void {
  data.audit.push({ id: ctx.newId(), actor, action, target, detail, at: iso(ctx) });
}

export function senderName(data: DemoData, userId: string): MessageSender | null {
  const user = data.users.find((u) => u.id === userId);
  return user ? { id: user.id, name: user.name } : null;
}

export function contactLabel(data: DemoData, contactId: string): string {
  const contact = data.contacts.find((c) => c.id === contactId);
  return contact?.name ?? contact?.phone ?? 'Unknown contact';
}

function pushConversation(data: DemoData, ctx: EngineCtx, row: ConversationRow): void {
  emit(ctx, 'conversation.updated', toConversation(data, row));
}

// ── WhatsApp (simulated) ────────────────────────────────────────────────────────────────

function setWa(data: DemoData, ctx: EngineCtx, state: WaConnectionState, reason?: WaReason): void {
  data.wa.state = {
    v: 1,
    state,
    provider: 'fake',
    ...(reason ? { reason } : {}),
    at: iso(ctx),
  };
  data.wa.since = iso(ctx);
  if (state !== 'qr_required') data.wa.qr = null;
  emit(ctx, 'wa.state', data.wa.state);
}

function showQr(data: DemoData, ctx: EngineCtx): void {
  const text = `DEMO-${ctx.newId()}`;
  data.wa.qr = { v: 1, qr: text, at: iso(ctx) };
  data.wa.qrAttempts += 1;
  schedule(data, ctx, TIMING.qrRefreshMs, { kind: 'qr_refresh', qr: text });
  emit(ctx, 'wa.qr', data.wa.qr);
}

// "Get new QR": from any state but connected or connecting.
export function waRequestQr(data: DemoData, ctx: EngineCtx): boolean {
  const state = data.wa.state.state;
  if (state === 'connected' || state === 'connecting') return false;
  setWa(data, ctx, 'qr_required');
  data.wa.qrAttempts = 0;
  showQr(data, ctx);
  return true;
}

export function waScan(data: DemoData, ctx: EngineCtx): boolean {
  if (data.wa.state.state !== 'qr_required') return false;
  setWa(data, ctx, 'connecting');
  schedule(data, ctx, TIMING.connectMs, { kind: 'wa_connect' });
  return true;
}

export function waLogout(data: DemoData, ctx: EngineCtx, actor: MessageSender): boolean {
  if (data.wa.state.state !== 'connected') return false;
  audit(data, ctx, actor, 'wa.logout', data.wa.number, 'Simulated device unlinked');
  data.wa.number = null;
  setWa(data, ctx, 'qr_required', 'logged_out_by_admin');
  data.wa.qrAttempts = 0;
  showQr(data, ctx);
  return true;
}

// Demo controls: the network drops; it comes back by itself after a few seconds (DEMO-13).
export function waDrop(data: DemoData, ctx: EngineCtx): boolean {
  if (data.wa.state.state !== 'connected') return false;
  audit(data, ctx, null, 'wa.disconnected', data.wa.number, 'Simulated network drop');
  setWa(data, ctx, 'disconnected', 'network');
  schedule(data, ctx, TIMING.reconnectMs, { kind: 'wa_reconnect' });
  return true;
}

export const waConnected = (data: DemoData): boolean => data.wa.state.state === 'connected';

// ── Messages ────────────────────────────────────────────────────────────────────────────

function findMessage(data: DemoData, messageId: string): MessageView | undefined {
  for (const item of data.items) {
    if (item.kind === 'message' && item.message.id === messageId) return item.message;
  }
  return undefined;
}

// Only forward, through the same rule as the real worker (MSG-20, DEMO-16).
function applyStatus(
  data: DemoData,
  ctx: EngineCtx,
  messageId: string,
  reported: ReportedStatus,
  reason: MessageFailureReason | null,
): void {
  const message = findMessage(data, messageId);
  if (!message || message.status === null) return;
  const next = nextStatus(message.status, reported);
  if (next === null) return;
  message.status = next;
  if (next === 'failed') message.failureReason = reason ?? 'provider_error';
  emit(ctx, 'message.status', {
    v: 1,
    messageId,
    conversationId: message.conversationId,
    status: next,
    failureReason: message.failureReason,
    at: iso(ctx),
  });
}

// A CRM reply: queued now, then the simulated WhatsApp reports (DEMO-16). The caller has checked
// the role, scope, text, connection and reply lock.
export function sendOutbound(
  data: DemoData,
  ctx: EngineCtx,
  row: ConversationRow,
  sender: MessageSender,
  body: string,
  property: PropertyCard | null = null,
): MessageView {
  const message: MessageView = {
    v: 1,
    id: ctx.newId(),
    conversationId: row.id,
    direction: 'outbound',
    type: 'text',
    body,
    unsupportedKind: null,
    status: 'queued',
    failureReason: null,
    sender,
    at: iso(ctx),
  };
  data.items.push({ kind: 'message', message, property });
  if (row.failsOnSend) {
    schedule(data, ctx, TIMING.failMs, {
      kind: 'status',
      messageId: message.id,
      status: 'failed',
      reason: 'provider_error',
    });
  } else {
    const status = (inMs: number, s: ReportedStatus): void =>
      schedule(data, ctx, inMs, { kind: 'status', messageId: message.id, status: s, reason: null });
    status(TIMING.sentMs, 'sent');
    status(TIMING.deliveredMs, 'delivered');
    status(TIMING.readMinMs + Math.round(ctx.random() * TIMING.readSpreadMs), 'read');
  }
  // Sending ends the sender's turn: their reply lock is released (DEMO Decision 20).
  releaseLock(data, ctx, row.id, sender.id);
  emit(ctx, 'message.created', message);
  pushConversation(data, ctx, row);
  return message;
}

export function addNote(
  data: DemoData,
  ctx: EngineCtx,
  row: ConversationRow,
  author: MessageSender,
  body: string,
): void {
  data.items.push({
    kind: 'note',
    note: { v: 1, id: ctx.newId(), conversationId: row.id, body, author, at: iso(ctx) },
  });
  pushConversation(data, ctx, row);
}

// ── Inbound (simulated customers) ───────────────────────────────────────────────────────

const NEW_CONTACT_NAMES: readonly (string | null)[] = [
  'Amit Bhatt',
  'Sunita Rao',
  'Kiran Shetty',
  null,
  'Neeraj Jain',
  'Zoya Mirza',
  'Prakash Iyer',
  null,
  'Anjali Verma',
  'Rohit Kapoor',
];

// The first free number in the test range for a new simulated customer (DEMO Decision 10).
export function nextFreePhone(data: DemoData): string | null {
  const used = new Set([...data.contacts.map((c) => c.phone), ...data.optOuts.map((o) => o.phone)]);
  for (let n = 125; n <= 198; n += 1) {
    const phone = `+1202555${String(n).padStart(4, '0')}`;
    if (!used.has(phone)) return phone;
  }
  return null;
}

export interface InboundInput {
  // Omitted: a new test contact.
  phone?: string;
  text: string;
}

// DEMO-22: a customer message. Creates the contact, conversation and a New lead when needed,
// reopens a closed chat, raises the unread count, and records a STOP as an opt-out (DEMO-28).
export function receiveInbound(data: DemoData, ctx: EngineCtx, input: InboundInput): string | null {
  const phone = input.phone ?? nextFreePhone(data);
  if (!phone) return null;
  let contact = data.contacts.find((c) => c.phone === phone);
  if (!contact) {
    const used = data.contacts.length;
    contact = {
      id: ctx.newId(),
      phone,
      name: NEW_CONTACT_NAMES[used % NEW_CONTACT_NAMES.length] ?? null,
    };
    data.contacts.push(contact);
  }
  const contactId = contact.id;
  let row = data.conversations.find((c) => c.contactId === contactId);
  if (!row) {
    row = {
      id: ctx.newId(),
      contactId,
      status: 'open',
      assigneeId: null,
      unreadCount: 0,
      createdAt: iso(ctx),
      failsOnSend: false,
    };
    data.conversations.push(row);
  }
  if (row.status === 'closed') row.status = 'open';
  row.unreadCount += 1;

  const message: MessageView = {
    v: 1,
    id: ctx.newId(),
    conversationId: row.id,
    direction: 'inbound',
    type: 'text',
    body: input.text,
    unsupportedKind: null,
    status: null,
    failureReason: null,
    sender: null,
    at: iso(ctx),
  };
  data.items.push({ kind: 'message', message, property: null });

  // At most one open lead per customer.
  const lead = leadForContact(data, contactId);
  if (!lead || CLOSED_LEAD_STAGES.includes(lead.stage)) {
    const leadId = ctx.newId();
    data.leads.push({
      id: leadId,
      contactId,
      stage: 'new',
      ownerId: row.assigneeId,
      needs: { budgetMin: null, budgetMax: null, location: null, propertyType: null, bhk: null },
      source: 'whatsapp',
      conversationId: row.id,
      createdAt: iso(ctx),
      updatedAt: iso(ctx),
      closedAt: null,
    });
    data.leadHistory.push({
      id: ctx.newId(),
      leadId,
      actor: null,
      field: 'created',
      from: null,
      to: 'new',
      at: iso(ctx),
    });
    audit(data, ctx, null, 'lead.created', contactLabel(data, contactId), 'New WhatsApp enquiry');
  }

  if (input.text.trim().toUpperCase() === 'STOP' && !data.optOuts.some((o) => o.phone === phone)) {
    data.optOuts.push({ phone, reason: 'customer_stop', addedBy: null, at: iso(ctx) });
    audit(data, ctx, null, 'optout.added', phone, 'Customer replied STOP');
  }

  emit(ctx, 'message.created', message);
  pushConversation(data, ctx, row);
  return row.id;
}

// ── Assignment and status ───────────────────────────────────────────────────────────────

export function assign(
  data: DemoData,
  ctx: EngineCtx,
  row: ConversationRow,
  actor: MessageSender,
  assigneeId: string | null,
): void {
  const before = row.assigneeId;
  if (before === assigneeId) return;
  const name = (id: string | null): string =>
    data.users.find((u) => u.id === id)?.name ?? 'Unassigned';
  row.assigneeId = assigneeId;
  // The open lead follows its chat.
  const lead = leadForContact(data, row.contactId);
  if (lead && !CLOSED_LEAD_STAGES.includes(lead.stage) && lead.ownerId !== assigneeId) {
    data.leadHistory.push({
      id: ctx.newId(),
      leadId: lead.id,
      actor,
      field: 'owner',
      from: lead.ownerId ? name(lead.ownerId) : null,
      to: assigneeId ? name(assigneeId) : null,
      at: iso(ctx),
    });
    lead.ownerId = assigneeId;
    lead.updatedAt = iso(ctx);
  }
  // Someone who lost the chat cannot keep replying in it.
  data.locks = data.locks.filter((l) => l.conversationId !== row.id || l.holder.id === assigneeId);
  audit(
    data,
    ctx,
    actor,
    'conversation.assigned',
    contactLabel(data, row.contactId),
    `${name(before)} → ${name(assigneeId)}`,
  );
  pushConversation(data, ctx, row);
}

const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  closed: 'Closed',
};

export function setStatus(
  data: DemoData,
  ctx: EngineCtx,
  row: ConversationRow,
  actor: MessageSender,
  status: ConversationStatus,
): void {
  if (row.status === status) return;
  const before = row.status;
  row.status = status;
  audit(
    data,
    ctx,
    actor,
    'conversation.status',
    contactLabel(data, row.contactId),
    `${STATUS_LABEL[before]} → ${STATUS_LABEL[status]}`,
  );
  pushConversation(data, ctx, row);
}

// ── Leads (DEMO-23) ─────────────────────────────────────────────────────────────────────

function leadHistory(
  data: DemoData,
  ctx: EngineCtx,
  lead: LeadRow,
  actor: MessageSender,
  field: 'stage' | 'owner' | 'needs',
  from: string | null,
  to: string | null,
): void {
  data.leadHistory.push({ id: ctx.newId(), leadId: lead.id, actor, field, from, to, at: iso(ctx) });
  lead.updatedAt = iso(ctx);
}

const isClosed = (stage: LeadStage): boolean => CLOSED_LEAD_STAGES.includes(stage);

// Converted and Lost close the lead; moving it back reopens it, unless the customer already has
// another open lead (at most one open lead per customer).
export function setLeadStage(
  data: DemoData,
  ctx: EngineCtx,
  lead: LeadRow,
  actor: MessageSender,
  stage: LeadStage,
): boolean {
  if (lead.stage === stage) return true;
  const reopening = isClosed(lead.stage) && !isClosed(stage);
  const otherOpen = data.leads.some(
    (l) => l.id !== lead.id && l.contactId === lead.contactId && !isClosed(l.stage),
  );
  if (reopening && otherOpen) return false;
  leadHistory(data, ctx, lead, actor, 'stage', lead.stage, stage);
  audit(
    data,
    ctx,
    actor,
    'lead.stage',
    contactLabel(data, lead.contactId),
    `${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[stage]}`,
  );
  lead.stage = stage;
  lead.closedAt = isClosed(stage) ? iso(ctx) : null;
  return true;
}

export function setLeadNeeds(
  data: DemoData,
  ctx: EngineCtx,
  lead: LeadRow,
  actor: MessageSender,
  needs: LeadNeeds,
): void {
  const before = needsSummary(lead.needs);
  const after = needsSummary(needs);
  if (JSON.stringify(lead.needs) === JSON.stringify(needs)) return;
  leadHistory(data, ctx, lead, actor, 'needs', before, after);
  audit(data, ctx, actor, 'lead.needs', contactLabel(data, lead.contactId), after);
  lead.needs = needs;
}

// The chat follows its open lead, so whoever owns the lead can also work the chat.
export function setLeadOwner(
  data: DemoData,
  ctx: EngineCtx,
  lead: LeadRow,
  actor: MessageSender,
  ownerId: string | null,
): void {
  if (lead.ownerId === ownerId) return;
  const name = (id: string | null): string =>
    data.users.find((u) => u.id === id)?.name ?? 'Unassigned';
  leadHistory(
    data,
    ctx,
    lead,
    actor,
    'owner',
    lead.ownerId ? name(lead.ownerId) : null,
    ownerId ? name(ownerId) : null,
  );
  audit(
    data,
    ctx,
    actor,
    'lead.owner',
    contactLabel(data, lead.contactId),
    `${name(lead.ownerId)} → ${name(ownerId)}`,
  );
  lead.ownerId = ownerId;
  const row = data.conversations.find((c) => c.id === lead.conversationId);
  if (row && !isClosed(lead.stage) && row.assigneeId !== ownerId) {
    row.assigneeId = ownerId;
    data.locks = data.locks.filter((l) => l.conversationId !== row.id || l.holder.id === ownerId);
    pushConversation(data, ctx, row);
  }
}

// ── Campaigns (DEMO-27) ─────────────────────────────────────────────────────────────────

export function scheduleCampaignStep(data: DemoData, ctx: EngineCtx, campaignId: string): void {
  // One sending chain per campaign, however often it is paused and resumed.
  data.sim.tasks = data.sim.tasks.filter(
    (t) => !(t.kind === 'campaign_step' && t.campaignId === campaignId),
  );
  schedule(data, ctx, CAMPAIGN_STEP_MS, { kind: 'campaign_step', campaignId });
}

// One simulated send. The opt-out list is checked again right before each message; while
// WhatsApp is down the campaign waits instead of failing its recipients.
function campaignStep(data: DemoData, ctx: EngineCtx, campaignId: string): void {
  const campaign = data.campaigns.find((c) => c.id === campaignId);
  if (!campaign || campaign.status !== 'running') return;
  if (!waConnected(data)) {
    scheduleCampaignStep(data, ctx, campaignId);
    return;
  }
  const next = campaign.recipients.find((r) => r.status === 'pending');
  if (next) {
    if (data.optOuts.some((o) => o.phone === next.phone)) {
      next.status = 'skipped';
      next.reason = 'opted_out';
    } else {
      next.status = 'sent';
      next.at = iso(ctx);
    }
  }
  if (campaign.recipients.some((r) => r.status === 'pending')) {
    scheduleCampaignStep(data, ctx, campaignId);
    return;
  }
  const counts = campaignCounts(campaign.recipients);
  campaign.status = 'completed';
  campaign.completedAt = iso(ctx);
  audit(
    data,
    ctx,
    null,
    'campaign.completed',
    campaign.name,
    `${counts.sent} sent, ${counts.skipped} skipped, ${counts.failed} failed`,
  );
}

// ── Users (DEMO-29) ─────────────────────────────────────────────────────────────────────

// History is kept: past messages carry the name they were sent with. Open chats and open leads
// become unassigned, and the user's reply locks and session end.
export function deactivateUser(
  data: DemoData,
  ctx: EngineCtx,
  actor: MessageSender,
  user: UserView,
): void {
  user.active = false;
  for (const row of data.conversations) {
    if (row.assigneeId === user.id && row.status !== 'closed') {
      row.assigneeId = null;
      pushConversation(data, ctx, row);
    }
  }
  for (const lead of data.leads) {
    if (lead.ownerId === user.id && !isClosed(lead.stage)) {
      leadHistory(data, ctx, lead, actor, 'owner', user.name, null);
      lead.ownerId = null;
    }
  }
  data.locks = data.locks.filter((l) => l.holder.id !== user.id);
  audit(
    data,
    ctx,
    actor,
    'user.deactivated',
    user.name,
    'History kept; open chats and leads unassigned',
  );
}

// ── Reply lock (DEMO-20) ────────────────────────────────────────────────────────────────

export function activeLock(data: DemoData, conversationId: string, now: Date): ReplyLock | null {
  const lock = data.locks.find((l) => l.conversationId === conversationId);
  return lock && new Date(lock.expiresAt) > now ? lock : null;
}

export function takeLock(
  data: DemoData,
  ctx: EngineCtx,
  conversationId: string,
  holder: MessageSender,
  ms: number = TIMING.lockMs,
): ReplyLock {
  const lock: ReplyLock = { conversationId, holder, expiresAt: iso(ctx, ms) };
  const had = activeLock(data, conversationId, ctx.now)?.holder.id;
  data.locks = data.locks.filter((l) => l.conversationId !== conversationId);
  data.locks.push(lock);
  if (had !== holder.id) emit(ctx, 'lock.changed', { conversationId, lock });
  return lock;
}

export function releaseLock(
  data: DemoData,
  ctx: EngineCtx,
  conversationId: string,
  holderId: string,
): void {
  const before = data.locks.length;
  data.locks = data.locks.filter(
    (l) => !(l.conversationId === conversationId && l.holder.id === holderId),
  );
  if (data.locks.length !== before) emit(ctx, 'lock.changed', { conversationId, lock: null });
}

// Demo controls: an Employee "starts typing" in a chat and replies a few seconds later.
export function simulateAgent(
  data: DemoData,
  ctx: EngineCtx,
  row: ConversationRow,
  agent: MessageSender,
): void {
  takeLock(data, ctx, row.id, agent);
  schedule(data, ctx, TIMING.agentReplyMs, {
    kind: 'agent_reply',
    conversationId: row.id,
    userId: agent.id,
    text: 'Thank you for your message. Let me check the details and get back to you shortly.',
  });
}

// ── Scheduled tasks ─────────────────────────────────────────────────────────────────────

export function runTask(data: DemoData, ctx: EngineCtx, task: SimTask): void {
  switch (task.kind) {
    case 'qr_refresh': {
      // A QR that was scanned or replaced in the meantime is done.
      if (data.wa.state.state !== 'qr_required' || data.wa.qr?.qr !== task.qr) return;
      if (data.wa.qrAttempts >= TIMING.qrMaxAttempts)
        setWa(data, ctx, 'reconnect_required', 'qr_timeout');
      else showQr(data, ctx);
      return;
    }
    case 'wa_connect': {
      if (data.wa.state.state !== 'connecting') return;
      data.wa.number = DEMO_COMPANY_NUMBER;
      setWa(data, ctx, 'connected');
      audit(data, ctx, null, 'wa.connected', DEMO_COMPANY_NUMBER, 'Simulated connection');
      return;
    }
    case 'wa_reconnect': {
      if (data.wa.state.state !== 'disconnected') return;
      setWa(data, ctx, 'connecting');
      schedule(data, ctx, TIMING.connectMs, { kind: 'wa_connect' });
      return;
    }
    case 'status': {
      // WhatsApp cannot accept a message while the connection is down (DEMO edge case).
      if (task.status === 'sent' && !waConnected(data)) {
        applyStatus(data, ctx, task.messageId, 'failed', 'wa_not_connected');
      } else {
        applyStatus(data, ctx, task.messageId, task.status, task.reason);
      }
      return;
    }
    case 'campaign_step': {
      campaignStep(data, ctx, task.campaignId);
      return;
    }
    case 'agent_reply': {
      const row = data.conversations.find((c) => c.id === task.conversationId);
      const lock = activeLock(data, task.conversationId, ctx.now);
      // Taken over or expired: the simulated agent gives up.
      if (!row || lock?.holder.id !== task.userId || !waConnected(data)) {
        releaseLock(data, ctx, task.conversationId, task.userId);
        return;
      }
      sendOutbound(data, ctx, row, lock.holder, task.text);
      return;
    }
  }
}
