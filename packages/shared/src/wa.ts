// WA contracts: connection state, QR, the worker↔api event and command shapes, Redis names, and
// the provider interface (connection part only; MSG adds sending and receiving).
import { z } from 'zod';

export const WaConnectionState = z.enum([
  'connecting',
  'qr_required',
  'connected',
  'disconnected',
  'reconnect_required',
]);
export type WaConnectionState = z.infer<typeof WaConnectionState>;

export const WaProviderName = z.enum(['fake', 'baileys']);
export type WaProviderName = z.infer<typeof WaProviderName>;

export const WaReason = z.enum([
  'network',
  'logged_out_from_phone',
  'logged_out_by_admin',
  'qr_timeout',
  'session_unreadable',
  'worker_offline',
  'other',
]);
export type WaReason = z.infer<typeof WaReason>;

// Published as `wa.state` to `global` and kept in Redis under `wa:state`. `provider` is null only
// when no worker is running (`worker_offline`), since then nobody knows which provider is set.
export const WaState = z.object({
  v: z.literal(1),
  state: WaConnectionState,
  provider: WaProviderName.nullable(),
  reason: WaReason.optional(),
  at: z.iso.datetime(),
});
export type WaState = z.infer<typeof WaState>;

// Published as `wa.qr` to `admin` only (WA-15), and kept in Redis under `wa:qr`.
export const WaQr = z.object({
  v: z.literal(1),
  qr: z.string().min(1),
  at: z.iso.datetime(),
});
export type WaQr = z.infer<typeof WaQr>;

// The envelope on the `crm:events` channel (worker to api). The api picks the rooms from `event`;
// the publisher never chooses them. MSG adds its events to this union.
export const CrmEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('wa.state'), data: WaState }),
  z.object({ event: z.literal('wa.qr'), data: WaQr }),
]);
export type CrmEvent = z.infer<typeof CrmEvent>;

// On the `wa:commands` channel (api to worker). Only the lock holder acts on it (WA-18, WA-19).
export const WaCommand = z.object({
  v: z.literal(1),
  command: z.enum(['new_qr', 'logout']),
  actorId: z.uuid(),
});
export type WaCommand = z.infer<typeof WaCommand>;

// Redis keys and channels shared by the api and the worker.
export const WA_REDIS = {
  lock: 'wa:lock',
  state: 'wa:state',
  qr: 'wa:qr',
  commands: 'wa:commands',
} as const;
export const EVENTS_CHANNEL = 'crm:events';

// The state the api reports when the worker's state key has expired (WA-16).
export function workerOfflineState(at: Date = new Date()): WaState {
  return {
    v: 1,
    state: 'disconnected',
    provider: null,
    reason: 'worker_offline',
    at: at.toISOString(),
  };
}

// --- Provider interface (types only). Adapters live in apps/worker/src/providers/. ---

// What the provider reports about a closed connection. The worker decides what happens next.
// `restart` is a close the provider asks to be reconnected at once (Baileys does this right after
// a QR scan). `replaced` means another client took over the same credentials.
export type ProviderCloseReason = 'network' | 'restart' | 'logged_out' | 'qr_timeout' | 'replaced';

export type ProviderEvent =
  | { type: 'qr'; qr: string }
  | { type: 'open'; number?: string }
  | { type: 'close'; reason: ProviderCloseReason };

// One signal key write; `value: null` deletes the key.
export interface ProviderKeyEntry {
  type: string;
  id: string;
  value: string | null;
}

// Where an adapter keeps its credentials and keys, as opaque strings. The worker's store encrypts
// them (WA-06); adapters never see the encryption.
export interface ProviderAuthStore {
  loadCreds(): Promise<string | undefined>;
  saveCreds(value: string): Promise<void>;
  getKeys(type: string, ids: readonly string[]): Promise<Record<string, string>>;
  setKeys(entries: readonly ProviderKeyEntry[]): Promise<void>;
}

export interface WhatsAppProvider {
  readonly name: WaProviderName;
  // Opens a new connection. Events from it go to `onEvent` until `close` or `logout`.
  connect(store: ProviderAuthStore, onEvent: (event: ProviderEvent) => void): Promise<void>;
  // Unlinks this device at WhatsApp, then closes the connection.
  logout(): Promise<void>;
  // Closes the connection and keeps the session (shutdown, lost lock).
  close(): Promise<void>;
}
