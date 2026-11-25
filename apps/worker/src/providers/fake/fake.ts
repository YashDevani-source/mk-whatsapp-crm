// The Fake provider: a simulated WhatsApp connection. Tests drive it directly (emitQr, scan, drop,
// logoutFromPhone, expireQr, updateCreds, updateKey, failConnects; MSG: receive, skip,
// receiveOnOldConnection, failSends, delaySends, echoNextSend, report). In `pnpm dev` it shows a
// simulated QR and pairs itself after `autoPairMs`; the UI labels it "Simulated" (WA-25). A dev
// send returns a simulated id and nothing more: the Fake reports no delivered or read (MSG-22).
import { randomUUID } from 'node:crypto';
import type {
  ProviderAuthStore,
  ProviderEvent,
  ProviderSendResult,
  ProviderSkipReason,
  ReportedStatus,
  WaProviderName,
  WhatsAppProvider,
} from '@crm/shared';

// Written into the fake credentials and keys, so tests can prove no plaintext is stored (WA-07).
export const FAKE_CREDS_MARKER = 'fake-creds-plaintext-marker';
// A reserved fictional number (555-01xx), never a real contact.
export const FAKE_NUMBER = '+12025550100';

export interface FakeOptions {
  // When set, an unpaired connection shows one simulated QR and pairs itself after this delay.
  autoPairMs?: number;
}

// One simulated inbound message (MSG). `from` is E.164; without `unsupportedKind` it is a text.
export interface FakeInbound {
  from: string;
  text?: string;
  unsupportedKind?: string;
  id?: string;
  at?: Date;
  fromMe?: boolean;
  profileName?: string;
}

function inboundEvent(input: FakeInbound): { id: string; event: ProviderEvent } {
  const id = input.id ?? `FAKE-${randomUUID()}`;
  return {
    id,
    event: {
      type: 'message',
      message: {
        providerMessageId: id,
        from: input.from,
        fromMe: input.fromMe ?? false,
        ...(input.profileName === undefined ? {} : { profileName: input.profileName }),
        content:
          input.unsupportedKind === undefined
            ? { kind: 'text', text: input.text ?? '' }
            : { kind: 'unsupported', unsupportedKind: input.unsupportedKind },
        at: input.at ?? new Date(),
      },
    },
  };
}

interface FakeConnection {
  store: ProviderAuthStore;
  onEvent: (event: ProviderEvent) => void;
}

function isPaired(creds: string): boolean {
  try {
    const parsed: unknown = JSON.parse(creds);
    return typeof parsed === 'object' && parsed !== null && 'registered' in parsed;
  } catch {
    return false;
  }
}

export class FakeProvider implements WhatsAppProvider {
  readonly name: WaProviderName = 'fake';
  connectCalls = 0;
  closeCalls = 0;
  logoutCalls = 0;
  private conn: FakeConnection | undefined;
  // The last closed connection, for MSG-07's stale-event tests.
  private previous: FakeConnection | undefined;
  // MSG: every successful `sendText`, in order.
  readonly sends: Array<{ to: string; text: string; providerMessageId: string }> = [];
  sendCalls = 0;
  // MSG-19: the most sends ever in progress at once.
  maxActiveSends = 0;
  private activeSends = 0;
  private sendFailuresLeft = 0;
  private sendDelayMs = 0;
  private echoNext = false;
  private failuresLeft = 0;
  private autoPairTimer: NodeJS.Timeout | undefined;
  private readonly options: FakeOptions;

  constructor(options: FakeOptions = {}) {
    this.options = options;
  }

  get connected(): boolean {
    return this.conn !== undefined;
  }

  async connect(store: ProviderAuthStore, onEvent: (event: ProviderEvent) => void): Promise<void> {
    this.connectCalls += 1;
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('fake connect failure');
    }
    const creds = await store.loadCreds();
    const conn: FakeConnection = { store, onEvent };
    this.conn = conn;
    // Events arrive after connect returns, as with a real socket.
    if (creds !== undefined && isPaired(creds)) {
      setImmediate(() => this.emit(conn, { type: 'open', number: FAKE_NUMBER }));
    } else if (this.options.autoPairMs !== undefined) {
      setImmediate(() => this.emit(conn, { type: 'qr', qr: `SIMULATED-QR-${randomUUID()}` }));
      this.autoPairTimer = setTimeout(() => {
        if (this.conn === conn) void this.scan();
      }, this.options.autoPairMs);
    }
  }

  async logout(): Promise<void> {
    this.logoutCalls += 1;
    this.detach();
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.detach();
  }

  // MSG-14. Rejects with no open connection, like a real socket.
  async sendText(to: string, text: string): Promise<ProviderSendResult> {
    this.sendCalls += 1;
    const conn = this.require();
    this.activeSends += 1;
    this.maxActiveSends = Math.max(this.maxActiveSends, this.activeSends);
    try {
      if (this.sendDelayMs > 0) await new Promise((r) => setTimeout(r, this.sendDelayMs));
    } finally {
      this.activeSends -= 1;
    }
    if (this.sendFailuresLeft > 0) {
      this.sendFailuresLeft -= 1;
      throw new Error('fake send failure');
    }
    const providerMessageId = `FAKE-OUT-${randomUUID()}`;
    const at = new Date();
    this.sends.push({ to, text, providerMessageId });
    if (this.echoNext) {
      // MSG-17: the worst case, an echo of the send reported well before the send call returns.
      this.echoNext = false;
      this.emit(
        conn,
        inboundEvent({ from: to, text, id: providerMessageId, at, fromMe: true }).event,
      );
      await new Promise((r) => setTimeout(r, 100));
    }
    return { providerMessageId, at };
  }

  // --- test and dev controls ---

  // The next `count` connect calls fail, as an unreachable WhatsApp would.
  failConnects(count: number): void {
    this.failuresLeft = count;
  }

  emitQr(qr = `FAKE-QR-${randomUUID()}`): string {
    this.emit(this.require(), { type: 'qr', qr });
    return qr;
  }

  // The phone scans the QR: credentials and a key are stored, then the connection opens.
  async scan(): Promise<void> {
    const conn = this.require();
    await conn.store.saveCreds(JSON.stringify({ registered: true, marker: FAKE_CREDS_MARKER }));
    await conn.store.setKeys([
      { type: 'pre-key', id: '1', value: JSON.stringify({ marker: FAKE_CREDS_MARKER }) },
    ]);
    this.emit(conn, { type: 'open', number: FAKE_NUMBER });
  }

  async updateCreds(fields: Record<string, string>): Promise<void> {
    const conn = this.require();
    await conn.store.saveCreds(JSON.stringify({ registered: true, ...fields }));
  }

  async updateKey(type: string, id: string, value: string | null): Promise<void> {
    await this.require().store.setKeys([{ type, id, value }]);
  }

  // MSG: a customer (or, with `fromMe`, the company phone) sends a message. Returns its id.
  receive(input: FakeInbound): string {
    const { id, event } = inboundEvent(input);
    this.emit(this.require(), event);
    return id;
  }

  // MSG-16: the next `count` sends fail.
  failSends(count: number): void {
    this.sendFailuresLeft = count;
  }

  // MSG-19: every send takes this long.
  delaySends(ms: number): void {
    this.sendDelayMs = ms;
  }

  // MSG-17: the next send is also reported back as a from-me message.
  echoNextSend(): void {
    this.echoNext = true;
  }

  // MSG-21: WhatsApp reports a status for a sent message.
  report(providerMessageId: string, status: ReportedStatus, at = new Date()): void {
    this.emit(this.require(), { type: 'status', providerMessageId, status, at });
  }

  // MSG-04: the adapter dropped a message and reports only why.
  skip(reason: ProviderSkipReason): void {
    this.emit(this.require(), { type: 'skipped', reason });
  }

  // MSG-07: a message delivered late by a connection that has already been closed.
  receiveOnOldConnection(input: FakeInbound): string {
    if (!this.previous) throw new Error('the fake provider has no closed connection');
    const { id, event } = inboundEvent(input);
    this.previous.onEvent(event);
    return id;
  }

  drop(): void {
    this.closeWith('network');
  }

  logoutFromPhone(): void {
    this.closeWith('logged_out');
  }

  expireQr(): void {
    this.closeWith('qr_timeout');
  }

  private closeWith(reason: 'network' | 'logged_out' | 'qr_timeout'): void {
    const conn = this.require();
    this.detach();
    conn.onEvent({ type: 'close', reason });
  }

  private emit(conn: FakeConnection, event: ProviderEvent): void {
    if (this.conn === conn) conn.onEvent(event);
  }

  private require(): FakeConnection {
    if (!this.conn) throw new Error('the fake provider is not connected');
    return this.conn;
  }

  private detach(): void {
    if (this.conn) this.previous = this.conn;
    this.conn = undefined;
    if (this.autoPairTimer) clearTimeout(this.autoPairTimer);
    this.autoPairTimer = undefined;
  }
}
