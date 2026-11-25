// The demo stand-in for Socket.io: the same event names as the real server pushes, plus the
// demo drafts. Events also reach the other tabs of the same browser through a BroadcastChannel,
// so two windows logged in as two users see each other live.
import type {
  InboxConversation,
  MessageStatusUpdate,
  MessageView,
  ReplyLock,
  WaQr,
  WaState,
} from '@crm/shared';

export interface DemoEvents {
  'wa.state': WaState;
  'wa.qr': WaQr;
  'message.created': MessageView;
  'message.status': MessageStatusUpdate;
  'conversation.updated': InboxConversation;
  'lock.changed': { conversationId: string; lock: ReplyLock | null };
}

export type DemoEventName = keyof DemoEvents;

type Handler<E extends DemoEventName> = (payload: DemoEvents[E]) => void;

interface Envelope {
  event: DemoEventName;
  payload: unknown;
}

interface Channel {
  postMessage(message: Envelope): void;
  onmessage: ((event: MessageEvent<Envelope>) => void) | null;
  close(): void;
}

export class DemoBus {
  private readonly handlers = new Map<DemoEventName, Set<(payload: unknown) => void>>();
  private readonly channel: Channel | undefined;

  constructor(channelName?: string) {
    if (channelName && typeof BroadcastChannel !== 'undefined') {
      const channel: Channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => this.deliver(event.data.event, event.data.payload);
      this.channel = channel;
    }
  }

  on<E extends DemoEventName>(event: E, handler: Handler<E>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    // Payloads are typed by the event name at `emit`, so the cast is safe.
    const wrapped = handler as (payload: unknown) => void;
    set.add(wrapped);
    this.handlers.set(event, set);
    return () => void set.delete(wrapped);
  }

  emit<E extends DemoEventName>(event: E, payload: DemoEvents[E]): void {
    this.deliver(event, payload);
    this.channel?.postMessage({ event, payload });
  }

  close(): void {
    this.channel?.close();
    this.handlers.clear();
  }

  private deliver(event: DemoEventName, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}
