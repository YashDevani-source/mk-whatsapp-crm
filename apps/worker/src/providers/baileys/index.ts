// The Baileys adapter (WA-26): the only place that imports Baileys (BOOT-06). Connection only;
// MSG adds sending and receiving. It reports what WhatsApp did; the connection manager decides
// what happens next.
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  jidDecode,
  proto,
  type AuthenticationCreds,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
  type SocketConfig,
  type WASocket,
} from 'baileys';
import type {
  ProviderAuthStore,
  ProviderCloseReason,
  ProviderEvent,
  ProviderKeyEntry,
  ProviderSendResult,
  WaProviderName,
  WhatsAppProvider,
} from '@crm/shared';

type Logger = SocketConfig['logger'];

// Baileys logs message contents and keys at debug level. Nothing it logs is printed.
const silentLogger: Logger = {
  level: 'silent',
  child: () => silentLogger,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const toJson = (value: unknown): string => JSON.stringify(value, BufferJSON.replacer);
const fromJson = <T>(value: string): T => JSON.parse(value, BufferJSON.reviver) as T;

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('output' in error)) return undefined;
  const output: unknown = error.output;
  if (typeof output !== 'object' || output === null || !('statusCode' in output)) return undefined;
  return typeof output.statusCode === 'number' ? output.statusCode : undefined;
}

// Decision 14. Baileys uses 408 both for a lost connection and for QR codes running out.
function closeReason(code: number | undefined, showedQr: boolean): ProviderCloseReason {
  if (code === DisconnectReason.loggedOut) return 'logged_out';
  if (code === DisconnectReason.restartRequired) return 'restart';
  if (code === DisconnectReason.connectionReplaced) return 'replaced';
  if (code === DisconnectReason.timedOut && showedQr) return 'qr_timeout';
  return 'network';
}

// `919876543210:12@s.whatsapp.net` → `+919876543210`.
function e164(jid: string | undefined): string | undefined {
  const user = jidDecode(jid)?.user;
  return user && /^\d+$/.test(user) ? `+${user}` : undefined;
}

function keyStore(store: ProviderAuthStore): SignalKeyStore {
  return {
    get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
      const raw = await store.getKeys(type, ids);
      const out: { [id: string]: SignalDataTypeMap[T] } = {};
      for (const [id, value] of Object.entries(raw)) {
        const parsed = fromJson<unknown>(value);
        out[id] = (
          type === 'app-state-sync-key'
            ? proto.Message.AppStateSyncKeyData.fromObject(parsed as object)
            : parsed
        ) as SignalDataTypeMap[T];
      }
      return out;
    },
    set: async (data: SignalDataSet) => {
      const entries: ProviderKeyEntry[] = [];
      for (const [type, values] of Object.entries(data)) {
        for (const [id, value] of Object.entries(values ?? {})) {
          entries.push({ type, id, value: value ? toJson(value) : null });
        }
      }
      await store.setKeys(entries);
    },
  };
}

export class BaileysProvider implements WhatsAppProvider {
  readonly name: WaProviderName = 'baileys';
  private socket: WASocket | undefined;

  async connect(store: ProviderAuthStore, onEvent: (event: ProviderEvent) => void): Promise<void> {
    const stored = await store.loadCreds();
    const creds = stored ? fromJson<AuthenticationCreds>(stored) : initAuthCreds();
    // The session row must exist before Baileys writes its first key.
    if (!stored) await store.saveCreds(toJson(creds));

    const socket = makeWASocket({
      auth: { creds, keys: keyStore(store) },
      logger: silentLogger,
      browser: Browsers.ubuntu('MK CRM'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.socket = socket;
    const live = (): boolean => this.socket === socket;
    let showedQr = false;

    // Saved one after another, so an older write never lands after a newer one.
    let saving: Promise<void> = Promise.resolve();
    socket.ev.on('creds.update', (update) => {
      Object.assign(creds, update);
      const snapshot = toJson(creds);
      saving = saving.then(() => store.saveCreds(snapshot)).catch(() => undefined);
    });

    socket.ev.on('connection.update', (update) => {
      if (!live()) return;
      if (update.qr) {
        showedQr = true;
        onEvent({ type: 'qr', qr: update.qr });
      }
      if (update.connection === 'open') {
        const number = e164(socket.user?.id);
        onEvent(number ? { type: 'open', number } : { type: 'open' });
      }
      if (update.connection === 'close') {
        this.socket = undefined;
        const code = statusCode(update.lastDisconnect?.error);
        void saving.then(() => onEvent({ type: 'close', reason: closeReason(code, showedQr) }));
      }
    });
  }

  async logout(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    await socket?.logout();
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    socket?.end(undefined);
  }

  // MSG contract placeholder: sending through Baileys is built in MSG phase 5, after its tests.
  async sendText(): Promise<ProviderSendResult> {
    throw new Error('sendText is not built yet (MSG phase 5)');
  }
}
