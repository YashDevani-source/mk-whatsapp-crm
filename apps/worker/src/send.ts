// MSG sending (MSG-14 to MSG-19): the `outbound-message` queue's processor. It runs only while
// this worker holds the WhatsApp lock (MSG Decision 14), one job at a time (MSG-19), and each send
// runs inside the connection manager's in-order queue, so an echo or a receipt WhatsApp reports
// during the send is handled after the provider id is saved (MSG-17, MSG Decision 37).
import type { Db } from '@crm/db';
import {
  OutboundMessageJob,
  QUEUES,
  type MessageFailureReason,
  type MessageStatusUpdate,
  type WaChannels,
  type WhatsAppProvider,
} from '@crm/shared';
import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { packageName } from './index.ts';
import { publishEvents } from './messages.ts';

// Thrown when the send cannot start: WhatsApp is not connected, or the lock was lost.
export class WaNotConnected extends Error {
  override name = 'WaNotConnected';
}

export interface SenderDeps {
  db: Db;
  redis: Redis;
  channels: WaChannels;
  provider: WhatsAppProvider;
  // Runs `task` in the connection manager's in-order queue. `task` gets false when this worker
  // is not the connected lock holder at that moment.
  exclusive: <T>(task: (ready: boolean) => Promise<T>) => Promise<T>;
}

export interface Sender {
  // Starts taking jobs (on lock acquired).
  start(): void;
  // Stops taking jobs and waits for the active one (on lock lost and on shutdown).
  stop(): Promise<void>;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export function createSender({ db, redis, channels, provider, exclusive }: SenderDeps): Sender {
  let worker: Worker<OutboundMessageJob> | undefined;
  let connection: Redis | undefined;

  async function publishStatus(update: Omit<MessageStatusUpdate, 'v'>): Promise<void> {
    await publishEvents(redis, channels, [{ event: 'message.status', data: { v: 1, ...update } }]);
  }

  // MSG-16: after the last attempt the message is failed; an earlier failure is only retried.
  async function markFailed(messageId: string, reason: MessageFailureReason): Promise<void> {
    const at = new Date();
    const row = await db.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    const changed = await db.message.updateMany({
      where: { id: messageId, status: 'QUEUED' },
      data: {
        status: 'FAILED',
        failureReason: reason === 'wa_not_connected' ? 'WA_NOT_CONNECTED' : 'PROVIDER_ERROR',
        statusAt: at,
      },
    });
    if (changed.count === 0 || !row) return;
    await publishStatus({
      messageId,
      conversationId: row.conversationId,
      status: 'failed',
      failureReason: reason,
      at: at.toISOString(),
    });
  }

  async function send(messageId: string): Promise<void> {
    const message = await db.message.findUnique({
      where: { id: messageId },
      select: {
        status: true,
        direction: true,
        body: true,
        conversationId: true,
        conversation: { select: { contact: { select: { phone: true } } } },
      },
    });
    // MSG-15: only a message that is still queued is ever sent.
    if (message?.status !== 'QUEUED' || message.direction !== 'OUTBOUND' || message.body === null) {
      return;
    }
    const { body, conversationId } = message;
    const to = message.conversation.contact.phone;
    await exclusive(async (ready) => {
      if (!ready) throw new WaNotConnected('WhatsApp is not connected');
      const result = await provider.sendText(to, body);
      const saved = await db.message.updateMany({
        where: { id: messageId, status: 'QUEUED' },
        data: {
          providerMessageId: result.providerMessageId,
          status: 'SENT',
          statusAt: result.at,
        },
      });
      if (saved.count === 0) return;
      await publishStatus({
        messageId,
        conversationId,
        status: 'sent',
        failureReason: null,
        at: result.at.toISOString(),
      });
    });
  }

  async function process(job: Job<OutboundMessageJob>): Promise<void> {
    const { messageId } = OutboundMessageJob.parse(job.data);
    try {
      await send(messageId);
    } catch (error) {
      console.error(`${packageName}: sending a message failed (${errorName(error)})`);
      // `attemptsMade` counts the attempts that failed before this one.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await markFailed(
          messageId,
          error instanceof WaNotConnected ? 'wa_not_connected' : 'provider_error',
        );
      }
      throw error;
    }
  }

  return {
    start() {
      if (worker) return;
      // A blocking connection of its own: BullMQ's workers need `maxRetriesPerRequest: null`.
      connection = redis.duplicate({ maxRetriesPerRequest: null });
      worker = new Worker<OutboundMessageJob>(QUEUES.outboundMessage, process, {
        connection,
        concurrency: 1,
      });
      worker.on('error', (error) => {
        console.error(`${packageName}: send queue error (${errorName(error)})`);
      });
    },
    async stop() {
      const current = worker;
      const conn = connection;
      worker = undefined;
      connection = undefined;
      if (current) await current.close().catch(() => undefined);
      conn?.disconnect();
    },
  };
}
