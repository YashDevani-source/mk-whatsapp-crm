// The worker→browser relay (WA-15, WA-17): events from the `crm:events` Redis channel are
// validated, then pushed to the rooms the api chooses for each event type. The publisher never
// chooses the rooms.
import { CrmEvent, EVENTS_CHANNEL, ROOMS } from '@crm/shared';
import type { Redis } from 'ioredis';
import type { CrmServer } from './sockets.ts';

// A malformed or unknown event is dropped and logged by error name only, never by content.
function parse(message: string): CrmEvent | undefined {
  try {
    const result = CrmEvent.safeParse(JSON.parse(message));
    if (result.success) return result.data;
    console.error(`api: dropped event (${result.error.name})`);
  } catch (error) {
    console.error(`api: dropped event (${error instanceof Error ? error.name : typeof error})`);
  }
  return undefined;
}

// `subscriber` must be a dedicated connection: a subscribed client cannot run other commands.
export async function startEventRelay(subscriber: Redis, io: CrmServer): Promise<void> {
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== EVENTS_CHANNEL) return;
    const event = parse(message);
    if (event?.event === 'wa.state') io.to(ROOMS.global).emit('wa.state', event.data);
    // The QR pairs a phone with the company number: Super Admin only.
    if (event?.event === 'wa.qr') io.to(ROOMS.admin).emit('wa.qr', event.data);
  });
  await subscriber.subscribe(EVENTS_CHANNEL);
}
