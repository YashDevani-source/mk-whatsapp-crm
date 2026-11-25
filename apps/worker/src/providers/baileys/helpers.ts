// MSG-27: the Baileys adapter's pure helpers. They turn WhatsApp's ids, message content and status
// codes into the provider-neutral shapes, and decide what is skipped. Unit tested without a socket.
import {
  WAMessageStatus,
  getContentType,
  isHostedLidUser,
  isHostedPnUser,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidDecode,
  normalizeMessageContent,
  toNumber,
  type WAMessageContent,
  type WAMessageKey,
} from 'baileys';
import type { ProviderInboundMessage, ProviderSkipReason, ReportedStatus } from '@crm/shared';

// `919876543210:12@s.whatsapp.net` → `+919876543210`.
export function e164(jid: string | null | undefined): string | undefined {
  const user = jidDecode(jid ?? undefined)?.user;
  return user && /^\d{6,15}$/.test(user) ? `+${user}` : undefined;
}

// `+919876543210` → `919876543210@s.whatsapp.net`.
export function phoneJid(phone: string): string {
  return `${phone.replace(/^\+/, '')}@s.whatsapp.net`;
}

const isPhoneJid = (jid: string): boolean => Boolean(isPnUser(jid) || isHostedPnUser(jid));
const isLidJid = (jid: string): boolean => Boolean(isLidUser(jid) || isHostedLidUser(jid));

// MSG-04: the chat a message came from, as a phone number or a reason to skip it. A LID (WhatsApp's
// hidden-number id) is resolved by WhatsApp's own phone alternative, then Baileys' mapping; a
// phone number is never guessed.
export async function senderPhone(
  key: Pick<WAMessageKey, 'remoteJid' | 'remoteJidAlt'>,
  pnForLid: (lid: string) => Promise<string | null>,
): Promise<{ phone: string } | { skip: ProviderSkipReason }> {
  const jid = key.remoteJid;
  if (!jid) return { skip: 'unknown_sender' };
  if (isJidStatusBroadcast(jid)) return { skip: 'status' };
  if (isJidBroadcast(jid)) return { skip: 'broadcast' };
  if (isJidGroup(jid)) return { skip: 'group' };
  if (isJidNewsletter(jid)) return { skip: 'channel' };
  if (isPhoneJid(jid)) {
    const phone = e164(jid);
    return phone ? { phone } : { skip: 'unknown_sender' };
  }
  if (isLidJid(jid)) {
    const alt = key.remoteJidAlt;
    const fromAlt = alt && isPhoneJid(alt) ? e164(alt) : undefined;
    if (fromAlt) return { phone: fromAlt };
    const mapped = await pnForLid(jid).catch(() => null);
    const phone = mapped ? e164(mapped) : undefined;
    return phone ? { phone } : { skip: 'unknown_sender' };
  }
  return { skip: 'unknown_sender' };
}

// MSG-05: what is stored as "unsupported", by Baileys content type.
const UNSUPPORTED_KINDS: Partial<Record<keyof WAMessageContent, string>> = {
  imageMessage: 'image',
  videoMessage: 'video',
  ptvMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  liveLocationMessage: 'location',
  contactMessage: 'contact',
  contactsArrayMessage: 'contact',
};

// Text, an unsupported kind, or undefined for anything that is not a message a person sent:
// protocol messages (edits, deletions), reactions, polls and empty content (MSG-05).
export function messageContent(
  message: WAMessageContent | null | undefined,
): ProviderInboundMessage['content'] | undefined {
  if (message?.editedMessage || message?.protocolMessage) return undefined;
  const content = normalizeMessageContent(message);
  if (!content || content.protocolMessage || content.reactionMessage) return undefined;
  const text = content.conversation ?? content.extendedTextMessage?.text;
  if (typeof text === 'string' && text.length > 0) return { kind: 'text', text };
  const type = getContentType(content);
  const kind = type === undefined ? undefined : UNSUPPORTED_KINDS[type];
  return kind ? { kind: 'unsupported', unsupportedKind: kind } : undefined;
}

// MSG-21: Baileys' message status codes. PENDING is the CRM's own `queued` and is not a report.
export function reportedStatus(code: number | null | undefined): ReportedStatus | undefined {
  switch (code) {
    case WAMessageStatus.SERVER_ACK:
      return 'sent';
    case WAMessageStatus.DELIVERY_ACK:
      return 'delivered';
    case WAMessageStatus.READ:
    case WAMessageStatus.PLAYED:
      return 'read';
    case WAMessageStatus.ERROR:
      return 'failed';
    default:
      return undefined;
  }
}

// WhatsApp timestamps are seconds; a missing one becomes "now".
export function timestampOf(value: Parameters<typeof toNumber>[0]): Date {
  const seconds = toNumber(value);
  return seconds > 0 ? new Date(seconds * 1000) : new Date();
}
