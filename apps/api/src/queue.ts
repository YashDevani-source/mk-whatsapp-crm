// MSG-09: the api's side of the `outbound-message` queue. It only adds jobs; the worker runs them.
import {
  OUTBOUND_ATTEMPTS,
  OUTBOUND_BACKOFF_MS,
  QUEUES,
  type OutboundMessageJob,
} from '@crm/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export interface OutboundQueue {
  // The job id is the message id, so adding the same message twice queues one job.
  add(messageId: string): Promise<void>;
  close(): Promise<void>;
}

// Reuses the api's Redis client, so the queue lives in the same database as everything else
// (dev db 0, api tests db 1).
export function createOutboundQueue(redis: Redis): OutboundQueue {
  const queue = new Queue<OutboundMessageJob>(QUEUES.outboundMessage, { connection: redis });
  return {
    add: async (messageId) => {
      await queue.add(
        QUEUES.outboundMessage,
        { v: 1, messageId },
        {
          jobId: messageId,
          attempts: OUTBOUND_ATTEMPTS,
          backoff: { type: 'exponential', delay: OUTBOUND_BACKOFF_MS },
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      );
    },
    close: () => queue.close(),
  };
}
