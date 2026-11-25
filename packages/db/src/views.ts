// MSG: rows to the shared view shapes. The worker and the api both build their payloads here, so
// a message looks the same whether it was pushed by the worker or returned by a route.
import type {
  ConversationSummary,
  MessageFailureReason,
  MessageStatus,
  MessageView,
} from '@crm/shared';
import type { Prisma } from './generated/prisma/client.ts';
import type {
  MessageFailureReason as DbFailureReason,
  MessageStatus as DbStatus,
} from './generated/prisma/enums.ts';

// The upper-case Prisma enums and the lower-case shared ones (MSG Decision 20).
const STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
} as const satisfies Record<DbStatus, MessageStatus>;

const FAILURE = {
  WA_NOT_CONNECTED: 'wa_not_connected',
  PROVIDER_ERROR: 'provider_error',
  REPORTED_FAILED: 'reported_failed',
} as const satisfies Record<DbFailureReason, MessageFailureReason>;

export function dbStatus(status: MessageStatus): DbStatus {
  return status.toUpperCase() as Uppercase<MessageStatus>;
}

export function dbFailureReason(reason: MessageFailureReason): DbFailureReason {
  return reason.toUpperCase() as Uppercase<MessageFailureReason>;
}

export function statusOf(status: DbStatus): MessageStatus {
  return STATUS[status];
}

export const messageInclude = {
  sentBy: { select: { id: true, name: true } },
} satisfies Prisma.MessageInclude;

export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function messageView(row: MessageRow): MessageView {
  return {
    v: 1,
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction === 'INBOUND' ? 'inbound' : 'outbound',
    type: row.type === 'TEXT' ? 'text' : 'unsupported',
    body: row.body,
    unsupportedKind: row.unsupportedKind,
    status: row.status === null ? null : STATUS[row.status],
    failureReason: row.failureReason === null ? null : FAILURE[row.failureReason],
    sender: row.sentBy,
    at: row.at.toISOString(),
  };
}

// The newest message by `at` is the conversation's preview (MSG-08).
export const conversationInclude = {
  contact: { select: { id: true, phone: true, name: true } },
  messages: {
    orderBy: [{ at: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    include: messageInclude,
  },
} satisfies Prisma.ConversationInclude;

export type ConversationRow = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

export function conversationSummary(row: ConversationRow): ConversationSummary {
  const last = row.messages[0];
  return {
    v: 1,
    id: row.id,
    contact: row.contact,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessage: last ? messageView(last) : null,
  };
}
