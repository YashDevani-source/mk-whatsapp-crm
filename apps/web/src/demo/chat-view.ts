// Pure display rules for the demo inbox: list filters, day separators, the "New messages"
// divider and tick labels. The demo api decides what the user may see; these only arrange it.
import {
  LEAD_STAGE_LABELS,
  LeadStage,
  type ConversationStatus,
  type InboxConversation,
  type InboxItem,
  type MessageStatus,
  type MessageView,
} from '@crm/shared';
import type { Tone } from './ui.tsx';

export type Scope = 'unassigned' | 'mine' | 'all';

export interface ListFilter {
  status: ConversationStatus;
  scope: Scope;
  search: string;
  userId: string;
}

function inScope(c: InboxConversation, scope: Scope, userId: string): boolean {
  if (scope === 'unassigned') return c.assignee === null;
  if (scope === 'mine') return c.assignee?.id === userId;
  return true;
}

export function filterConversations(
  list: InboxConversation[],
  filter: ListFilter,
): InboxConversation[] {
  const q = filter.search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  return list.filter(
    (c) =>
      c.status === filter.status &&
      inScope(c, filter.scope, filter.userId) &&
      (q === '' ||
        (c.contact.name ?? '').toLowerCase().includes(q) ||
        (digits !== '' && c.contact.phone.replace(/\D/g, '').includes(digits)) ||
        (c.lastMessage?.body ?? '').toLowerCase().includes(q)),
  );
}

export function statusCounts(
  list: InboxConversation[],
  scope: Scope,
  userId: string,
): Record<ConversationStatus, number> {
  const counts: Record<ConversationStatus, number> = { open: 0, pending: 0, closed: 0 };
  for (const c of list) if (inScope(c, scope, userId)) counts[c.status] += 1;
  return counts;
}

export function previewText(message: MessageView | null): string {
  if (!message) return 'No messages yet';
  if (message.type === 'unsupported')
    return `Unsupported message (${message.unsupportedKind ?? 'media'})`;
  const who =
    message.direction === 'inbound'
      ? ''
      : message.sender
        ? `${message.sender.name.split(' ')[0]}: `
        : 'Phone: ';
  return `${who}${message.body ?? ''}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'divider'; key: string }
  | { kind: 'item'; key: string; item: InboxItem };

const itemAt = (item: InboxItem): string =>
  item.kind === 'message' ? item.message.at : item.note.at;
const itemId = (item: InboxItem): string =>
  item.kind === 'message' ? item.message.id : item.note.id;

// Items with a separator before each new day, and the "New messages" divider before the
// last `unread` customer messages (DEMO-21).
export function chatRows(items: InboxItem[], now: Date, unread: number): ChatRow[] {
  let dividerBefore: string | undefined;
  if (unread > 0) {
    const inbound = items.filter((i) => i.kind === 'message' && i.message.direction === 'inbound');
    const first = inbound[Math.max(0, inbound.length - unread)];
    dividerBefore = first ? itemId(first) : undefined;
  }
  const rows: ChatRow[] = [];
  let lastDay = '';
  for (const item of items) {
    const label = dayLabel(itemAt(item), now);
    if (label !== lastDay) {
      rows.push({ kind: 'day', key: `day-${label}-${itemId(item)}`, label });
      lastDay = label;
    }
    if (itemId(item) === dividerBefore) rows.push({ kind: 'divider', key: 'divider' });
    rows.push({ kind: 'item', key: itemId(item), item });
  }
  return rows;
}

// Every tick has an icon and a word, never colour alone (design prompt Part F).
export const TICKS: Readonly<
  Record<MessageStatus, { icon: string; label: string; className: string }>
> = {
  queued: { icon: '◷', label: 'Queued', className: 'tick-queued' },
  sent: { icon: '✓', label: 'Sent', className: 'tick-sent' },
  delivered: { icon: '✓✓', label: 'Delivered', className: 'tick-delivered' },
  read: { icon: '✓✓', label: 'Read', className: 'tick-read' },
  failed: { icon: '!', label: 'Failed', className: 'tick-failed' },
};

export function stageTone(stage: LeadStage): Tone {
  if (stage === 'converted') return 'ok';
  if (stage === 'lost') return 'error';
  if (stage === 'new') return 'info';
  if (stage === 'negotiation') return 'warn';
  return 'neutral';
}

export const stageLabel = (stage: LeadStage): string => LEAD_STAGE_LABELS[stage];

// A stage stored as text (lead history); anything else is shown as it is.
export function stageText(value: string | null): string {
  const parsed = LeadStage.safeParse(value);
  return parsed.success ? LEAD_STAGE_LABELS[parsed.data] : (value ?? '');
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
