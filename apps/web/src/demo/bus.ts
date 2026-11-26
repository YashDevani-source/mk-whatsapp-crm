// The demo stand-in for Socket.io: the same event names as the real server pushes, plus the
// demo drafts. Events also reach the other tabs of the same browser through a BroadcastChannel,
// so two windows logged in as two users see each other live.
import type {
  InboxConversation,
  MessageSender,
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
  // Drives the "… assigned you a chat" toast for the new assignee.
  'conversation.assigned': {
    conversationId: string;
    contact: string;
    assigneeId: string | null;
    by: MessageSender;
  };
}

export type DemoEventName = keyof DemoEvents;

// One event and its payload, typed together.
export type BusEnvelope = {
  [E in DemoEventName]: { event: E; payload: DemoEvents[E] };
}[DemoEventName];

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
  private readonly remoteListeners = new Set<() => void>();

  constructor(channelName?: string) {
    if (channelName && typeof BroadcastChannel !== 'undefined') {
      const channel: Channel = new BroadcastChannel(channelName);
      channel.onmessage = (event) => {
        for (const listener of this.remoteListeners) listener();
        this.deliver(event.data.event, event.data.payload);
      };
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

  // Runs before an event from another tab is delivered. The other tab saves its change before
  // it sends the event, so a listener that syncs the store sees the change first.
  onRemote(listener: () => void): () => void {
    this.remoteListeners.add(listener);
    return () => void this.remoteListeners.delete(listener);
  }

  emitEnvelope(envelope: BusEnvelope): void {
    this.deliver(envelope.event, envelope.payload);
    this.channel?.postMessage(envelope);
  }

  close(): void {
    this.channel?.close();
    this.handlers.clear();
  }

  private deliver(event: DemoEventName, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}
