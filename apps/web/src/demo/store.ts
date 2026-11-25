// DEMO-05: the demo "database". Rows reference each other by id like the real tables; the demo
// api maps them to the `@crm/shared` views. Saved in localStorage, parsed on every load.
import {
  AuditEntry,
  CampaignView,
  ContactView,
  ConversationStatus,
  InboxItem,
  LeadHistoryEntry,
  LeadNeeds,
  LeadSource,
  LeadStage,
  OptOut,
  ProjectView,
  ReplyLock,
  UserView,
  WaQr,
  WaState,
} from '@crm/shared';
import { z } from 'zod';

export const STORAGE_KEY = 'crm-demo-v1';

const At = z.iso.datetime();

export const ConversationRow = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  status: ConversationStatus,
  assigneeId: z.uuid().nullable(),
  unreadCount: z.number().int().nonnegative(),
  createdAt: At,
  // The simulator fails every send to this conversation (DEMO-16).
  failsOnSend: z.boolean(),
});
export type ConversationRow = z.infer<typeof ConversationRow>;

export const LeadRow = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  stage: LeadStage,
  ownerId: z.uuid().nullable(),
  needs: LeadNeeds,
  source: LeadSource,
  conversationId: z.uuid().nullable(),
  createdAt: At,
  updatedAt: At,
  closedAt: At.nullable(),
});
export type LeadRow = z.infer<typeof LeadRow>;

export const FollowUpRow = z.object({
  id: z.uuid(),
  leadId: z.uuid(),
  ownerId: z.uuid(),
  dueAt: At,
  note: z.string(),
  autoReply: z.string().nullable(),
  sentAt: At.nullable(),
  doneAt: At.nullable(),
});
export type FollowUpRow = z.infer<typeof FollowUpRow>;

export const WaRow = z.object({
  state: WaState,
  number: z.string().nullable(),
  since: At,
  qr: WaQr.nullable(),
  qrAttempts: z.number().int().nonnegative(),
});
export type WaRow = z.infer<typeof WaRow>;

export const DemoData = z.object({
  v: z.literal(1),
  users: z.array(UserView),
  contacts: z.array(ContactView),
  conversations: z.array(ConversationRow),
  items: z.array(InboxItem),
  leads: z.array(LeadRow),
  leadHistory: z.array(LeadHistoryEntry),
  projects: z.array(ProjectView),
  followUps: z.array(FollowUpRow),
  campaigns: z.array(CampaignView),
  optOuts: z.array(OptOut),
  audit: z.array(AuditEntry),
  wa: WaRow,
  locks: z.array(ReplyLock),
  settings: z.object({ autoActivity: z.boolean() }),
});
export type DemoData = z.infer<typeof DemoData>;

// The part of the Web Storage API the store needs, so tests can pass a Map-backed one.
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

type Listener = () => void;

export class DemoStore {
  private current: DemoData;
  private readonly listeners = new Set<Listener>();
  private readonly storage: KeyValueStorage;
  private readonly makeSeed: () => DemoData;

  constructor(storage: KeyValueStorage, makeSeed: () => DemoData) {
    this.storage = storage;
    this.makeSeed = makeSeed;
    this.current = this.load();
  }

  get data(): DemoData {
    return this.current;
  }

  // Applies a change, saves it and tells every subscriber.
  write<T>(change: (data: DemoData) => T): T {
    const result = change(this.current);
    this.save();
    this.notify();
    return result;
  }

  reset(): void {
    this.current = this.makeSeed();
    this.save();
    this.notify();
  }

  // Another tab saved a change (the `storage` event): take its copy.
  reload(): void {
    this.current = this.load();
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // A missing, corrupt or outdated copy is replaced by the seed (DEMO-05).
  private load(): DemoData {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      try {
        const parsed = DemoData.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
      } catch {
        // Not JSON: fall through to the seed.
      }
    }
    const seed = this.makeSeed();
    this.storage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  private save(): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.current));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
