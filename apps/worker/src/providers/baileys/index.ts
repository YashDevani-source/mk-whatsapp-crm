// The Baileys adapter (WA-26): the only place that imports Baileys (BOOT-06). It reports what
// WhatsApp did (connection, messages, receipts) and sends texts (MSG); the connection manager
// decides what happens next. The pure parts are in `helpers.ts` (MSG-27).
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
  type SocketConfig,
  type WAMessage,
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
import {
  e164,
  messageContent,
  phoneJid,
  reportedStatus,
  senderPhone,
  timestampOf,
} from './helpers.ts';

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
      // MSG Decision 10: no echo of the CRM's own sends (MSG-17).
      emitOwnEvents: false,
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

    // MSG: one message after another, so a LID lookup never reorders them. Messages the adapter
    // does not report (protocol, reactions, empty) produce no event (MSG-05).
    let inbound: Promise<void> = Promise.resolve();
    const receive = async (m: WAMessage): Promise<void> => {
      const id = m.key.id;
      const content = messageContent(m.message);
      if (!id || content === undefined) return;
      const sender = await senderPhone(m.key, (lid) =>
        socket.signalRepository.lidMapping.getPNForLID(lid),
      );
      if (!live()) return;
      if ('skip' in sender) return onEvent({ type: 'skipped', reason: sender.skip });
      const profileName = m.pushName?.trim();
      onEvent({
        type: 'message',
        message: {
          providerMessageId: id,
          from: sender.phone,
          fromMe: m.key.fromMe === true,
          ...(profileName ? { profileName } : {}),
          content,
          at: timestampOf(m.messageTimestamp),
        },
      });
    };
    socket.ev.on('messages.upsert', ({ messages }) => {
      if (!live()) return;
      for (const m of messages) inbound = inbound.then(() => receive(m)).catch(() => undefined);
    });

    // MSG-21: receipts for the company's own messages only.
    socket.ev.on('messages.update', (updates) => {
      if (!live()) return;
      for (const { key, update } of updates) {
        const status = reportedStatus(update.status);
        if (!key.id || !key.fromMe || status === undefined) continue;
        onEvent({ type: 'status', providerMessageId: key.id, status, at: new Date() });
      }
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

  // MSG-14: resolves once WhatsApp has the message, with its id (MSG Decision 12).
  async sendText(to: string, text: string): Promise<ProviderSendResult> {
    const socket = this.socket;
    if (!socket) throw new Error('WhatsApp is not connected');
    const sent = await socket.sendMessage(phoneJid(to), { text });
    if (!sent?.key.id) throw new Error('WhatsApp returned no message id');
    return { providerMessageId: sent.key.id, at: timestampOf(sent.messageTimestamp) };
  }
}
