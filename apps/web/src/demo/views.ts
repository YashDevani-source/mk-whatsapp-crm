// Row → view mappers, the demo counterpart of packages/db/src/views.ts. Used by the demo api
// and the engine.
import {
  CLOSED_LEAD_STAGES,
  type FollowUpView,
  type InboxConversation,
  type InboxItem,
  type LeadView,
  type MessageSender,
} from '@crm/shared';
import type { ConversationRow, DemoData, FollowUpRow, LeadRow } from './store.ts';

export function senderOf(data: DemoData, userId: string | null): MessageSender | null {
  const user = userId ? data.users.find((u) => u.id === userId) : undefined;
  return user ? { id: user.id, name: user.name } : null;
}

export function byAt<T extends { at: string }>(a: T, b: T): number {
  return a.at.localeCompare(b.at);
}

export function itemAt(item: InboxItem): string {
  return item.kind === 'message' ? item.message.at : item.note.at;
}

export function itemConversation(item: InboxItem): string {
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
