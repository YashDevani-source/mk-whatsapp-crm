// MSG inbound (MSG-01 to MSG-06): store each message the provider reports, once, then publish it
// to the api. Status reports (MSG-21) move outbound messages forward only. The connection manager
// calls this only for the lock holder's current connection (MSG-07).
import {
  conversationInclude,
  conversationSummary,
  dbStatus,
  messageInclude,
  messageView,
  statusOf,
  type Db,
} from '@crm/db';
import {
  nextStatus,
  type CrmEvent,
  type ProviderInboundMessage,
  type ProviderSkipReason,
  type ReportedStatus,
  type WaChannels,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { packageName } from './index.ts';

export interface MessageHandlerDeps {
  db: Db;
  redis: Redis;
  channels: WaChannels;
  log: (line: string) => void;
}

export interface MessageHandler {
  onMessage(message: ProviderInboundMessage): Promise<void>;
  onSkipped(reason: ProviderSkipReason): void;
  onStatus(report: { providerMessageId: string; status: ReportedStatus; at: Date }): Promise<void>;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function publishEvents(
  redis: Redis,
  channels: WaChannels,
  events: readonly CrmEvent[],
): Promise<void> {
  const tx = redis.multi();
  for (const event of events) tx.publish(channels.events, JSON.stringify(event));
  await tx.exec();
}

export function createMessageHandler({
  db,
  redis,
  channels,
  log,
}: MessageHandlerDeps): MessageHandler {
  const alreadyStored = async (providerMessageId: string): Promise<boolean> =>
    (await db.message.count({ where: { providerMessageId } })) > 0;

  // One transaction: a failure leaves no half-made contact, conversation or message.
  async function store(m: ProviderInboundMessage): Promise<{ id: string; conversationId: string }> {
    // The profile name on a from-me message is the company's own name, never the contact's.
    const profileName = m.fromMe ? undefined : m.profileName?.trim() || undefined;
    return db.$transaction(async (tx) => {
      const contact = await tx.contact.upsert({
        where: { phone: m.from },
        create: { phone: m.from, name: profileName ?? null },
        update: {},
      });
      // MSG Decision 16: the profile name fills an empty name and never replaces one.
      if (contact.name === null && profileName !== undefined) {
        await tx.contact.update({ where: { id: contact.id }, data: { name: profileName } });
      }
      const conversation = await tx.conversation.upsert({
        where: { contactId: contact.id },
        create: { contactId: contact.id },
        update: {},
        select: { id: true },
      });
      const text = m.content.kind === 'text' ? m.content.text : null;
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          providerMessageId: m.providerMessageId,
          direction: m.fromMe ? 'OUTBOUND' : 'INBOUND',
          type: m.content.kind === 'text' ? 'TEXT' : 'UNSUPPORTED',
          body: text,
          unsupportedKind: m.content.kind === 'unsupported' ? m.content.unsupportedKind : null,
          // MSG-06: WhatsApp already holds a message typed on the company phone (MSG Decision 25).
          status: m.fromMe ? 'SENT' : null,
          statusAt: m.fromMe ? m.at : null,
          at: m.at,
        },
        select: { id: true },
      });
      // MSG-02: a late, older message never moves the conversation back.
      await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: m.at } }],
        },
        data: { lastMessageAt: m.at },
      });
      return { id: message.id, conversationId: conversation.id };
    });
  }

  return {
    async onMessage(m) {
      // MSG-03, MSG-17: a repeat, or the echo of a CRM send, is already processed.
      if (await alreadyStored(m.providerMessageId)) return;
      let stored: { id: string; conversationId: string } | undefined;
      for (let attempt = 0; stored === undefined; attempt += 1) {
        try {
          stored = await store(m);
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          if (await alreadyStored(m.providerMessageId)) return;
          // A contact or conversation created by another write at the same moment: retry once.
          if (attempt >= 1) throw error;
        }
      }
      const [message, conversation] = await Promise.all([
        db.message.findUniqueOrThrow({ where: { id: stored.id }, include: messageInclude }),
        db.conversation.findUniqueOrThrow({
          where: { id: stored.conversationId },
          include: conversationInclude,
        }),
      ]);
      await publishEvents(redis, channels, [
        { event: 'message.created', data: messageView(message) },
        { event: 'conversation.updated', data: conversationSummary(conversation) },
      ]);
    },

    // MSG-04: the reason only, never a number or text.
    onSkipped(reason) {
      log(`${packageName}: skipped a message (${reason})`);
    },

    // MSG-21: only what the provider reported, and only forward (MSG-20). Receipts for inbound
    // messages and for unknown ids change nothing.
    async onStatus({ providerMessageId, status, at }) {
      const row = await db.message.findUnique({
        where: { providerMessageId },
        select: { id: true, conversationId: true, direction: true, status: true },
      });
      if (row?.direction !== 'OUTBOUND' || row.status === null) {
        if (!row) log(`${packageName}: status for an unknown message ignored`);
        return;
      }
      const next = nextStatus(statusOf(row.status), status);
      if (next === null) return;
      const changed = await db.message.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: dbStatus(next),
          statusAt: at,
          ...(next === 'failed' ? { failureReason: 'REPORTED_FAILED' as const } : {}),
        },
      });
      if (changed.count === 0) return;
      await publishEvents(redis, channels, [
        {
          event: 'message.status',
          data: {
            v: 1,
            messageId: row.id,
            conversationId: row.conversationId,
            status: next,
            failureReason: next === 'failed' ? 'reported_failed' : null,
            at: at.toISOString(),
          },
        },
      ]);
    },
  };
}
