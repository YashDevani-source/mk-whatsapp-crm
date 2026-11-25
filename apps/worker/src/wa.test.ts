import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Db } from '@crm/db';
import { WA_REDIS, WorkerEnv, parseEnv, waChannels } from '@crm/shared';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconnectDelay } from './backoff.ts';
import { encrypt, keyFromHex } from './crypto.ts';
import { createProvider } from './providers/index.ts';
import { FAKE_CREDS_MARKER } from './providers/fake/fake.ts';
import { createRedis } from './redis.ts';
import {
  TEST_CONFIG,
  TEST_REDIS_URL,
  killAll,
  lastState,
  pause,
  recordEvents,
  resetWa,
  sendCommand,
  spawnWorker,
  startTestWorker,
  testDb,
  waitFor,
  workerEnv,
  type Spawned,
  type TestWorker,
} from './test-support.ts';

// Needs `docker compose up -d --wait`. crm_test and Redis db 2 only.
let db: Db;
let redis: Redis;
let rec: Awaited<ReturnType<typeof recordEvents>>;
const workers: TestWorker[] = [];
const spawned: Spawned[] = [];

beforeAll(() => {
  db = testDb();
  redis = createRedis(TEST_REDIS_URL);
});

beforeEach(async () => {
  await resetWa(db, redis);
  rec = await recordEvents();
});

afterEach(async () => {
  for (const w of workers.splice(0)) await w.stop();
  await killAll(spawned.splice(0));
  rec.close();
});

afterAll(async () => {
  await resetWa(db, redis);
  await db.$disconnect();
  redis.disconnect();
});

function start(options: Parameters<typeof startTestWorker>[1] = {}): TestWorker {
  const w = startTestWorker(db, options);
  workers.push(w);
  return w;
}

function spawnTracked(env: Record<string, string>): Spawned {
  const w = spawnWorker(env);
  spawned.push(w);
  return w;
}

const stateIs = (state: string, reason?: string) => (): boolean => {
  const last = lastState(rec);
  return last?.state === state && (reason === undefined || last.reason === reason);
};

// A worker whose Fake has been paired and is connected.
async function connected(options: Parameters<typeof startTestWorker>[1] = {}): Promise<TestWorker> {
  const w = start(options);
  await waitFor(() => w.fake.connected);
  if (!(await w.store.hasSession())) {
    w.fake.emitQr();
    await w.fake.scan();
  }
  await waitFor(stateIs('connected'));
  return w;
}

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));
const ACQUIRED = 'WhatsApp lock acquired';
const STANDBY = 'standby, another worker holds the WhatsApp lock';

describe('provider selection', () => {
  it('WA-01 the worker uses the Fake provider by default and Baileys when set', async () => {
    const env = parseEnv(WorkerEnv, workerEnv());
    expect(env.ok && env.env.WHATSAPP_PROVIDER).toBe('fake');
    expect((await createProvider('fake')).name).toBe('fake');
    expect((await createProvider('baileys')).name).toBe('baileys');
  });

  it('WA-01 any other WHATSAPP_PROVIDER value exits non-zero and names the variable', () => {
    const r = spawnSync(process.execPath, [MAIN], {
      env: workerEnv({ WHATSAPP_PROVIDER: 'cloud-api-SENTINEL' }),
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(r.status, `${r.stdout}${r.stderr}`).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stderr).toContain('WHATSAPP_PROVIDER');
    expect(`${r.stdout}${r.stderr}`).not.toContain('SENTINEL');
  });
});

describe('single-session lock', () => {
  it('WA-02 a second worker stays on standby while the lock is held', async () => {
    const a = start();
    await waitFor(() => a.fake.connected);
    await waitFor(stateIs('connecting'));
    rec.clear();

    const b = start();
    // Several standby retries (TTL / 6 each).
    await pause(TEST_CONFIG.lockTtlMs * 2);
    expect(b.logs.join('\n')).toContain(STANDBY);
    expect(b.fake.connectCalls).toBe(0);
    expect(rec.events).toEqual([]);
    expect(await redis.get(WA_REDIS.lock)).not.toBeNull();
  });

  it('WA-03 a standby takes over after the lock holder is killed', async () => {
    const env = workerEnv({ WA_LOCK_TTL_MS: '1500' });
    const a = spawnTracked(env);
    await a.waitForOutput(ACQUIRED);
    const b = spawnTracked(env);
    await b.waitForOutput(STANDBY);

    a.child.kill('SIGKILL');
    await a.exited;
    const killedAt = Date.now();
    await b.waitForOutput(ACQUIRED, 10_000);
    // TTL plus one standby retry (TTL / 6), with slack for a loaded machine.
    expect(Date.now() - killedAt).toBeLessThan(1500 + 250 + 1500);
  });

  it('WA-04 a worker that loses its lock closes the provider and publishes nothing more', async () => {
    const a = start();
    await waitFor(() => a.fake.connected);
    await waitFor(stateIs('connecting'));

    await redis.set(WA_REDIS.lock, 'another-worker');
    // The next heartbeat (TTL / 3) finds the lock owned by someone else.
    await waitFor(() => a.fake.closeCalls === 1, TEST_CONFIG.lockTtlMs);
    expect(a.fake.connected).toBe(false);
    rec.clear();

    await pause(TEST_CONFIG.lockTtlMs);
    expect(rec.events).toEqual([]);
    expect(a.fake.connectCalls).toBe(1);
    expect(await redis.get(WA_REDIS.lock)).toBe('another-worker');
  });

  it('WA-05 SIGTERM closes the provider, releases the lock and exits 0', async () => {
    // A long TTL, so a takeover can only come from the release, not from expiry.
    const env = workerEnv({ WA_LOCK_TTL_MS: '20000' });
    const a = spawnTracked(env);
    await a.waitForOutput(ACQUIRED);
    const b = spawnTracked(env);
    await b.waitForOutput(STANDBY);

    a.child.kill('SIGTERM');
    const [code] = await a.exited;
    expect(code, a.output()).toBe(0);
    const releasedAt = Date.now();
    await b.waitForOutput(ACQUIRED, 10_000);
    // One standby retry is TTL / 6 (about 3.3 s); far less than the 20 s TTL.
    expect(Date.now() - releasedAt).toBeLessThan(6_000);
  });
});

describe('session and connection states', () => {
  it('WA-07 a paired session is stored without plaintext', async () => {
    const w = await connected();
    await w.fake.updateKey('pre-key', '2', `{"marker":"${FAKE_CREDS_MARKER}"}`);
    const sessions = await db.$queryRaw<Array<{ encrypted_creds: string }>>`
      SELECT encrypted_creds FROM whatsapp_sessions`;
    const keys = await db.$queryRaw<Array<{ encrypted_value: string }>>`
      SELECT encrypted_value FROM whatsapp_session_keys`;
    expect(sessions).toHaveLength(1);
    expect(keys.length).toBeGreaterThan(0);
    const raw = JSON.stringify([sessions, keys]);
    expect(raw).not.toContain(FAKE_CREDS_MARKER);
    expect(raw).not.toContain('registered');
  });

  it('WA-08 with no stored session the worker publishes connecting, qr_required and each QR, then connected', async () => {
    const w = start();
    await waitFor(() => w.fake.connected);
    const first = w.fake.emitQr();
    const second = w.fake.emitQr();
    await waitFor(() => rec.qrs().length === 2);
    expect(await redis.get(WA_REDIS.qr)).toContain(second);

    await w.fake.scan();
    await waitFor(stateIs('connected'));
    expect(rec.states().map((s) => s.state)).toEqual(['connecting', 'qr_required', 'connected']);
    expect(rec.states().every((s) => s.provider === 'fake')).toBe(true);
    expect(rec.qrs()).toEqual([first, second]);
    expect(await w.store.hasSession()).toBe(true);
    expect(await redis.get(WA_REDIS.qr)).toBeNull();
    expect(JSON.parse((await redis.get(WA_REDIS.state)) ?? '{}')).toMatchObject({
      state: 'connected',
    });
  });

  it('WA-09 with a stored session a restart connects without a QR', async () => {
    const first = await connected();
    workers.splice(workers.indexOf(first), 1);
    await first.stop();
    rec.clear();

    const second = start();
    await waitFor(stateIs('connected'));
    expect(rec.states().map((s) => s.state)).toEqual(['connecting', 'connected']);
    expect(rec.qrs()).toEqual([]);
    expect(second.fake.connectCalls).toBe(1);
  });

  it('WA-10 a credentials or keys update is stored and loaded on restart', async () => {
    const first = await connected();
    await first.fake.updateCreds({ rotated: 'creds-v2' });
    await first.fake.updateKey('session', 'peer-1', 'key-v2');
    workers.splice(workers.indexOf(first), 1);
    await first.stop();

    const second = start();
    await waitFor(stateIs('connected'));
    expect(await second.store.loadCreds()).toContain('creds-v2');
    expect(await second.store.getKeys('session', ['peer-1', 'missing'])).toEqual({
      'peer-1': 'key-v2',
    });
  });

  it('WA-11 the reconnect delay doubles from the base up to the max, with ±20 % jitter', () => {
    const mid = (): number => 0.5;
    expect([0, 1, 2, 3, 6, 20].map((n) => reconnectDelay(n, 1_000, 60_000, mid))).toEqual([
      1_000, 2_000, 4_000, 8_000, 60_000, 60_000,
    ]);
    expect(reconnectDelay(1, 1_000, 60_000, () => 0)).toBe(1_600);
    expect(reconnectDelay(1, 1_000, 60_000, () => 1)).toBe(2_400);
  });

  it('WA-11 a network drop reconnects with exponential backoff that resets after connecting', async () => {
    const w = await connected({ random: () => 0.5 });
    rec.clear();
    w.fake.failConnects(3);
    w.fake.drop();
    await waitFor(stateIs('connected'), 5_000);

    const connecting = rec.events.filter(
      (r) => r.event.event === 'wa.state' && r.event.data.state === 'connecting',
    );
    expect(connecting).toHaveLength(4);
    const gaps = connecting.slice(1).map((r, i) => r.at - (connecting[i]?.at ?? 0));
    // Attempt 0 waits 50 ms, then 100, 200 and the 200 ms cap.
    [100, 200, 200].forEach((expected, i) => {
      expect(gaps[i]).toBeGreaterThanOrEqual(expected - 15);
      expect(gaps[i]).toBeLessThan(expected + 150);
    });
    expect(rec.states()[0]).toMatchObject({ state: 'disconnected', reason: 'network' });

    // After connecting, the next drop starts again from the base delay.
    rec.clear();
    const dropAt = Date.now();
    w.fake.drop();
    await waitFor(stateIs('connected'));
    const again = rec.events.find(
      (r) => r.event.event === 'wa.state' && r.event.data.state === 'connecting',
    );
    expect((again?.at ?? Infinity) - dropAt).toBeLessThan(50 + 150);
  });

  it('WA-12 a logout from the phone deletes the session and does not reconnect', async () => {
    const w = await connected();
    w.fake.logoutFromPhone();
    await waitFor(stateIs('reconnect_required', 'logged_out_from_phone'));
    expect(await w.store.hasSession()).toBe(false);
    await pause(TEST_CONFIG.reconnectMaxMs * 2);
    expect(w.fake.connectCalls).toBe(1);
    expect(lastState(rec)?.state).toBe('reconnect_required');
  });

  it('WA-13 an expired QR stops in reconnect_required until an admin asks again', async () => {
    const w = start();
    await waitFor(() => w.fake.connected);
    w.fake.emitQr();
    w.fake.expireQr();
    await waitFor(stateIs('reconnect_required', 'qr_timeout'));
    await pause(TEST_CONFIG.reconnectMaxMs * 2);
    expect(w.fake.connectCalls).toBe(1);
    expect(rec.qrs()).toHaveLength(1);
    expect(await redis.get(WA_REDIS.qr)).toBeNull();
  });

  it('WA-14 an unreadable session gives reconnect_required and keeps the row', async () => {
    const wrongKey = keyFromHex('cd'.repeat(32));
    const garbage = encrypt(wrongKey, `{"registered":true,"m":"${FAKE_CREDS_MARKER}"}`, 'x');
    await db.whatsAppSession.create({ data: { provider: 'FAKE', encryptedCreds: garbage } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const w = start();
      await waitFor(stateIs('reconnect_required', 'session_unreadable'));
      await pause(TEST_CONFIG.reconnectMaxMs * 2);
      expect(w.fake.connectCalls).toBe(1);
      expect(await db.whatsAppSession.count()).toBe(1);
      const logged = errors.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('SessionUnreadable');
      expect(logged).not.toContain(garbage);
      expect(logged).not.toContain(FAKE_CREDS_MARKER);
    } finally {
      errors.mockRestore();
    }
  });
});

describe('admin commands', () => {
  it('WA-18 a new_qr command in reconnect_required starts a fresh pairing', async () => {
    const w = start();
    await waitFor(() => w.fake.connected);
    w.fake.emitQr();
    w.fake.expireQr();
    await waitFor(stateIs('reconnect_required', 'qr_timeout'));
    rec.clear();

    await sendCommand(redis, 'new_qr');
    await waitFor(() => w.fake.connected);
    expect(w.fake.connectCalls).toBe(2);
    const qr = w.fake.emitQr();
    await waitFor(() => rec.qrs().includes(qr));
    expect(rec.states().map((s) => s.state)).toEqual(['connecting', 'qr_required']);
  });

  it('WA-18 a new_qr command in any other state is ignored', async () => {
    const w = await connected();
    rec.clear();
    await sendCommand(redis, 'new_qr');
    await pause(200);
    expect(rec.events).toEqual([]);
    expect(w.fake.connectCalls).toBe(1);
  });

  it('WA-19 a logout command when connected logs out and deletes the session', async () => {
    const w = await connected();
    await sendCommand(redis, 'logout');
    await waitFor(stateIs('reconnect_required', 'logged_out_by_admin'));
    expect(w.fake.logoutCalls).toBe(1);
    expect(await w.store.hasSession()).toBe(false);
    await pause(TEST_CONFIG.reconnectMaxMs * 2);
    expect(w.fake.connectCalls).toBe(1);
  });

  it('WA-19 a logout command when not connected is ignored', async () => {
    const w = start();
    await waitFor(() => w.fake.connected);
    w.fake.emitQr();
    await waitFor(stateIs('qr_required'));
    await sendCommand(redis, 'logout');
    await pause(200);
    expect(w.fake.logoutCalls).toBe(0);
    expect(lastState(rec)?.state).toBe('qr_required');
  });
});

describe('channel isolation', () => {
  it('WA-28 a worker acts only on commands from its own Redis database', async () => {
    expect(redis.options.db).toBe(2);
    const w = await connected();
    // The dev api on db 0, and the old channel name every database shared before the fix.
    await sendCommand(redis, 'logout', waChannels(0).commands);
    await sendCommand(redis, 'logout', 'wa:commands');
    await pause(300);
    expect(w.fake.logoutCalls).toBe(0);
    expect(lastState(rec)?.state).toBe('connected');

    await sendCommand(redis, 'logout');
    await waitFor(stateIs('reconnect_required', 'logged_out_by_admin'));
  });

  it('WA-28 a worker publishes its events only for its own Redis database', async () => {
    const other = createRedis(TEST_REDIS_URL);
    const heard: string[] = [];
    other.on('message', (channel: string) => heard.push(channel));
    await other.subscribe(waChannels(0).events, waChannels(1).events, 'crm:events');
    try {
      const w = start();
      await waitFor(() => w.fake.connected);
      w.fake.emitQr();
      await waitFor(stateIs('qr_required'));
      await pause(100);
      expect(heard).toEqual([]);
    } finally {
      other.disconnect();
    }
  });
});

describe('audit', () => {
  it('WA-20 the worker writes connect, disconnect and logout audit rows without secrets', async () => {
    const w = await connected();
    rec.clear();
    w.fake.drop();
    await waitFor(stateIs('connected'));
    w.fake.logoutFromPhone();
    await waitFor(stateIs('reconnect_required'));
    await sendCommand(redis, 'new_qr');
    await waitFor(() => w.fake.connected);
    const qr = w.fake.emitQr();
    await w.fake.scan();
    await waitFor(stateIs('connected'));
    await sendCommand(redis, 'logout');
    await waitFor(stateIs('reconnect_required', 'logged_out_by_admin'));

    const rows = await db.auditLog.findMany({
      where: { action: { startsWith: 'wa.' }, actorId: null },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => [r.action, r.meta])).toEqual([
      ['wa.connected', { provider: 'fake' }],
      ['wa.disconnected', { provider: 'fake', reason: 'network' }],
      ['wa.connected', { provider: 'fake' }],
      ['wa.logged_out', { provider: 'fake', reason: 'logged_out_from_phone' }],
      ['wa.connected', { provider: 'fake' }],
      ['wa.logged_out', { provider: 'fake', reason: 'logged_out_by_admin' }],
    ]);
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain(qr);
    expect(raw).not.toContain(FAKE_CREDS_MARKER);
  });
});
