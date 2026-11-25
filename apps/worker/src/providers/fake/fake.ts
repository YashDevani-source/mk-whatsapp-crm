// The Fake provider: a simulated WhatsApp connection. Tests drive it directly (emitQr, scan, drop,
// logoutFromPhone, expireQr, updateCreds, updateKey, failConnects). In `pnpm dev` it shows a
// simulated QR and pairs itself after `autoPairMs`; the UI labels it "Simulated" (WA-25).
import { randomUUID } from 'node:crypto';
import type {
  ProviderAuthStore,
  ProviderEvent,
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
    this.conn = undefined;
    if (this.autoPairTimer) clearTimeout(this.autoPairTimer);
    this.autoPairTimer = undefined;
  }
}
