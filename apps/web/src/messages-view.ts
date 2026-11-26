// Pure rules for the messages page (MSG-24, MSG-25), tested without a browser. Every tick comes
// from the message's stored status, which only the provider's reports move past `sent` (MSG-22).
import {
  nextStatus,
  type ConversationSummary,
  type MessageFailureReason,
  type MessageStatusUpdate,
  type MessageView,
} from '@crm/shared';

export interface Tick {
  symbol: string;
  label: string;
  tone: 'muted' | 'read' | 'failed';
}

const FAILURES: Record<MessageFailureReason, string> = {
  wa_not_connected: 'WhatsApp was not connected',
  provider_error: 'WhatsApp did not accept the message',
  reported_failed: 'WhatsApp reported that it could not be delivered',
};

export function failureText(reason: MessageFailureReason | null): string {
  return reason ? FAILURES[reason] : 'Not sent';
}

// Inbound messages have no tick.
export function tickFor(message: MessageView): Tick | undefined {
  switch (message.status) {
    case null:
      return undefined;
    case 'queued':
      return { symbol: '🕓', label: 'Queued', tone: 'muted' };
    case 'sent':
      return { symbol: '✓', label: 'Sent', tone: 'muted' };
    case 'delivered':
      return { symbol: '✓✓', label: 'Delivered', tone: 'muted' };
    case 'read':
      return { symbol: '✓✓', label: 'Read', tone: 'read' };
    case 'failed':
      return {
        symbol: '!',
        label: `Failed: ${failureText(message.failureReason)}`,
        tone: 'failed',
      };
  }
}

// Who wrote an outbound message. Typed on the company phone itself: "Sent from phone" (MSG-06).
export function senderLabel(message: MessageView): string | undefined {
  if (message.direction === 'inbound') return undefined;
  return message.sender?.name ?? 'Sent from phone';
}

export function bodyText(message: MessageView): string {
  if (message.type === 'unsupported') {
    return `Unsupported message (${message.unsupportedKind ?? 'unknown'})`;
  }
  return message.body ?? '';
}

// MSG-25: a failed text can be sent again, as a new message. The failed one stays as it was.
export function resendText(message: MessageView): string | undefined {
  return message.status === 'failed' && message.type === 'text' && message.body
    ? message.body
    : undefined;
}

export function sendErrorText(status: number, error?: string): string {
  if (status === 503 && error === 'wa_not_connected') {
    return 'WhatsApp is not connected. The message was not sent.';
  }
  if (status === 503) return 'The message could not be queued. Try again.';
  if (status === 400) return 'The message must be 1 to 4096 characters.';
  if (status === 403) return 'You are not allowed to send messages.';
  if (status === 404) return 'This conversation no longer exists.';
  return `The message was not sent (${status}).`;
}

export function contactLabel(contact: ConversationSummary['contact']): string {
  return contact.name ? `${contact.name} (${contact.phone})` : contact.phone;
}

const byAt = (a: MessageView, b: MessageView): number => a.at.localeCompare(b.at);

// Adds a message once (the send response and the socket push both deliver it), in `at` order.
export function addMessage(list: readonly MessageView[], message: MessageView): MessageView[] {
  if (list.some((m) => m.id === message.id)) return [...list];
  return [...list, message].sort(byAt);
}

// A status update moves a tick forward only, even if updates arrive out of order.
export function applyStatus(
  list: readonly MessageView[],
  update: MessageStatusUpdate,
): MessageView[] {
  return list.map((m) => {
    if (m.id !== update.messageId || m.status === null || update.status === 'queued') return m;
    if (nextStatus(m.status, update.status) === null) return m;
    return { ...m, status: update.status, failureReason: update.failureReason };
  });
}

// Newest conversation first; an update replaces the old summary.
export function upsertConversation(
  list: readonly ConversationSummary[],
  summary: ConversationSummary,
): ConversationSummary[] {
  const rest = list.filter((c) => c.id !== summary.id);
  return [summary, ...rest].sort((a, b) =>
    (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
  );
}
