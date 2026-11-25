// MSG contracts: message and conversation shapes, the send request, status values, the
// outbound job, and the forward-only status rule's signature (docs/specs/003-messaging.md).
import { z } from 'zod';

// Lower case here, upper case in the Prisma enums (as with `WaProviderName`); mapped in code.
export const MessageDirection = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof MessageDirection>;

// Text only in MSG (Decision 2). Inbound media is kept as `unsupported` with its kind (MSG-05).
export const MessageType = z.enum(['text', 'unsupported']);
export type MessageType = z.infer<typeof MessageType>;

// Outbound only; inbound messages have no status (null).
export const MessageStatus = z.enum(['queued', 'sent', 'delivered', 'read', 'failed']);
export type MessageStatus = z.infer<typeof MessageStatus>;

// What a provider may report. `queued` is the CRM's own state and is never reported.
export const ReportedStatus = z.enum(['sent', 'delivered', 'read', 'failed']);
export type ReportedStatus = z.infer<typeof ReportedStatus>;

export const MessageFailureReason = z.enum([
  'wa_not_connected',
  'provider_error',
  'reported_failed',
]);
export type MessageFailureReason = z.infer<typeof MessageFailureReason>;

// WhatsApp's limit for one text message.
export const MAX_TEXT_LENGTH = 4096;

// A `:id` route parameter. Anything that is not a UUID is answered like an unknown id (404).
export const RouteId = z.uuid();

// Body of `POST /conversations/:id/messages` (MSG-09, MSG-10, MSG-13).
export const SendMessageRequest = z.strictObject({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  clientId: z.uuid().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const MessageSender = z.object({
  id: z.uuid(),
  name: z.string(),
});
export type MessageSender = z.infer<typeof MessageSender>;

// One message as the api returns and pushes it. "Sent from phone" is an outbound message with
// `sender: null` (MSG-06). `at` is the WhatsApp timestamp, or the queue time for CRM sends.
export const MessageView = z.object({
  v: z.literal(1),
  id: z.uuid(),
  conversationId: z.uuid(),
  direction: MessageDirection,
  type: MessageType,
  body: z.string().nullable(),
  unsupportedKind: z.string().nullable(),
  status: MessageStatus.nullable(),
  failureReason: MessageFailureReason.nullable(),
  sender: MessageSender.nullable(),
  at: z.iso.datetime(),
});
export type MessageView = z.infer<typeof MessageView>;

export const ContactView = z.object({
  id: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
});
export type ContactView = z.infer<typeof ContactView>;

// One row of `GET /conversations`, and the `conversation.updated` payload.
export const ConversationSummary = z.object({
  v: z.literal(1),
  id: z.uuid(),
  contact: ContactView,
  lastMessageAt: z.iso.datetime().nullable(),
  lastMessage: MessageView.nullable(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

// The `message.status` payload (MSG-14, MSG-16, MSG-21).
export const MessageStatusUpdate = z.object({
  v: z.literal(1),
  messageId: z.uuid(),
  conversationId: z.uuid(),
  status: MessageStatus,
  failureReason: MessageFailureReason.nullable(),
  at: z.iso.datetime(),
});
export type MessageStatusUpdate = z.infer<typeof MessageStatusUpdate>;

// BullMQ queue names. The job id of an outbound job is its message id (MSG-09).
export const QUEUES = {
  outboundMessage: 'outbound-message',
} as const;

export const OutboundMessageJob = z.object({
  v: z.literal(1),
  messageId: z.uuid(),
});
export type OutboundMessageJob = z.infer<typeof OutboundMessageJob>;

// MSG-20: the forward-only rule. Returns the new status, or null for "no change". The table is in
// the spec under Contracts touched; the function is written in MSG phase 4, after its test.
export type NextStatus = (current: MessageStatus, reported: ReportedStatus) => MessageStatus | null;

// MSG Decision 11: 3 attempts, exponential backoff from 2 s. The api sets these on each job;
// worker tests add their own jobs with a shorter backoff.
export const OUTBOUND_ATTEMPTS = 3;
export const OUTBOUND_BACKOFF_MS = 2_000;

// `GET /conversations` (MSG-08): newest first.
export const ConversationList = z.object({ conversations: z.array(ConversationSummary) });
export type ConversationList = z.infer<typeof ConversationList>;

// `GET /conversations/:id/messages` (MSG-08): the last 100, oldest first.
export const MessageList = z.object({ messages: z.array(MessageView) });
export type MessageList = z.infer<typeof MessageList>;
