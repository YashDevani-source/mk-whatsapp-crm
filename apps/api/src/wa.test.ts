import {
  EVENTS_CHANNEL,
  WA_REDIS,
  WaCommand,
  type CrmEvent,
  type Role,
  type WaQr,
  type WaState,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedis } from './redis.ts';
import {
  TEST_ORIGIN,
  TEST_REDIS_URL,
  createUser,
  deleteUsers,
  listen,
  sessionCookie,
  testApp,
  type TestContext,
  type TestUser,
} from './test-support.ts';

// Needs `docker compose up -d --wait`. crm_test and Redis db 1 only. The worker is simulated by
// writing its Redis keys and publishing on its channels directly.
let ctx: TestContext;
let server: Awaited<ReturnType<typeof listen>>;
let commands: Redis;
const received: WaCommand[] = [];
const users: TestUser[] = [];
const clients: Socket[] = [];
const cookies = new Map<Role, { user: TestUser; cookie: string }>();

beforeAll(async () => {
  ctx = testApp();
  await ctx.relayReady;
  server = await listen(ctx);
  commands = createRedis(TEST_REDIS_URL);
  commands.on('message', (_channel: string, message: string) => {
    received.push(WaCommand.parse(JSON.parse(message)));
  });
  await commands.subscribe(WA_REDIS.commands);
  for (const role of ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'] as const) {
    const user = await createUser(ctx.db, { role });
    users.push(user);
    const res = await request(ctx.app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });
    cookies.set(role, { user, cookie: sessionCookie(res) });
  }
});

beforeEach(async () => {
  await ctx.redis.del(WA_REDIS.state, WA_REDIS.qr);
  received.splice(0);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await ctx.redis.del(WA_REDIS.state, WA_REDIS.qr);
  await ctx.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  commands.disconnect();
  await server.close();
  await deleteUsers(ctx.db, users);
  await ctx.close();
});

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await pause(20);
  }
  throw new Error(`condition not met within ${ms} ms`);
}

function cookieOf(role: Role): string {
  const entry = cookies.get(role);
  if (!entry) throw new Error(`no ${role} session`);
  return entry.cookie;
}

function state(s: WaState['state'], extra: Partial<WaState> = {}): WaState {
  return { v: 1, state: s, provider: 'fake', at: new Date().toISOString(), ...extra };
}

function qr(text: string): WaQr {
  return { v: 1, qr: text, at: new Date().toISOString() };
}

async function setWorkerState(s: WaState, currentQr?: WaQr): Promise<void> {
  await ctx.redis.set(WA_REDIS.state, JSON.stringify(s));
  if (currentQr) await ctx.redis.set(WA_REDIS.qr, JSON.stringify(currentQr));
}

async function publish(event: CrmEvent | string): Promise<void> {
  await ctx.redis.publish(
    EVENTS_CHANNEL,
    typeof event === 'string' ? event : JSON.stringify(event),
  );
}

interface Listener {
  client: Socket;
  states: WaState[];
  qrs: WaQr[];
}

// Connects and records every `wa.state` and `wa.qr` from the first moment, including the ones
// sent on connect.
function connect(role: Role | undefined, headers: Record<string, string> = {}): Promise<Listener> {
  const client = ioClient(server.url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { ...(role ? { cookie: cookieOf(role) } : {}), ...headers },
  });
  clients.push(client);
  const listener: Listener = { client, states: [], qrs: [] };
  client.on('wa.state', (s: WaState) => listener.states.push(s));
  client.on('wa.qr', (q: WaQr) => listener.qrs.push(q));
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(listener));
    client.once('connect_error', reject);
  });
}

describe('live WhatsApp events', () => {
  it('WA-15 wa.state reaches every role and wa.qr only the Super Admin', async () => {
    const admin = await connect('SUPER_ADMIN');
    const manager = await connect('MANAGER');
    const employee = await connect('EMPLOYEE');
    const all = [admin, manager, employee];
    // Each socket first gets the state on connect (WA-16).
    await waitFor(() => all.every((l) => l.states.length === 1));

    await publish({ event: 'wa.qr', data: qr('QR-ONE') });
    await publish({ event: 'wa.state', data: state('qr_required') });
    // The state is published after the QR, so once it has arrived the QR would have too.
    await waitFor(() => all.every((l) => l.states.length === 2));

    expect(admin.qrs.map((q) => q.qr)).toEqual(['QR-ONE']);
    expect(manager.qrs).toEqual([]);
    expect(employee.qrs).toEqual([]);
    for (const l of all) expect(l.states[1]?.state).toBe('qr_required');
  });

  it('WA-16 a new socket receives the current state, and the Super Admin the current QR', async () => {
    await setWorkerState(state('qr_required'), qr('QR-CURRENT'));
    const admin = await connect('SUPER_ADMIN');
    const manager = await connect('MANAGER');
    await waitFor(() => admin.qrs.length === 1 && manager.states.length === 1);
    await pause(100);
    expect(admin.states.map((s) => s.state)).toEqual(['qr_required']);
    expect(admin.qrs.map((q) => q.qr)).toEqual(['QR-CURRENT']);
    expect(manager.states.map((s) => s.state)).toEqual(['qr_required']);
    expect(manager.qrs).toEqual([]);
  });

  it('WA-16 a new socket gets connected without a QR when the worker reports connected', async () => {
    await setWorkerState(state('connected'), qr('QR-STALE'));
    const admin = await connect('SUPER_ADMIN');
    await waitFor(() => admin.states.length === 1);
    await pause(100);
    expect(admin.states[0]?.state).toBe('connected');
    expect(admin.qrs).toEqual([]);
  });

  it('WA-16 with no worker state the socket gets disconnected with reason worker_offline', async () => {
    const employee = await connect('EMPLOYEE');
    await waitFor(() => employee.states.length === 1);
    expect(employee.states[0]).toMatchObject({
      state: 'disconnected',
      reason: 'worker_offline',
      provider: null,
    });
  });

  it('WA-17 an invalid event is dropped and nothing is pushed', async () => {
    const admin = await connect('SUPER_ADMIN');
    await waitFor(() => admin.states.length === 1);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await publish('not json');
      await publish(JSON.stringify({ event: 'wa.state', data: { ...state('connected'), v: 2 } }));
      await publish(JSON.stringify({ event: 'wa.qr', data: { v: 1, qr: '' } }));
      await publish(JSON.stringify({ event: 'unknown.event', data: {} }));
      await publish({ event: 'wa.state', data: state('connecting') });
      await waitFor(() => admin.states.length === 2);
      expect(admin.states[1]?.state).toBe('connecting');
      expect(admin.qrs).toEqual([]);
      const logged = errors.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged.match(/dropped event/g)).toHaveLength(4);
      expect(logged).not.toContain('not json');
    } finally {
      errors.mockRestore();
    }
  });
});

describe('WhatsApp admin routes', () => {
  it('WA-18 POST /wa/qr asks the worker for a new QR in reconnect_required', async () => {
    await setWorkerState(state('reconnect_required', { reason: 'qr_timeout' }));
    const res = await request(ctx.app).post('/wa/qr').set('Cookie', cookieOf('SUPER_ADMIN'));
    expect(res.status).toBe(202);
    await waitFor(() => received.length === 1);
    expect(received[0]).toEqual({
      v: 1,
      command: 'new_qr',
      actorId: cookies.get('SUPER_ADMIN')?.user.id,
    });
  });

  it('WA-18 POST /wa/qr in any other state is 409 and sends nothing', async () => {
    for (const s of ['connected', 'qr_required', 'connecting', 'disconnected'] as const) {
      await setWorkerState(state(s));
      const res = await request(ctx.app).post('/wa/qr').set('Cookie', cookieOf('SUPER_ADMIN'));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'invalid_state' });
    }
    await ctx.redis.del(WA_REDIS.state);
    const offline = await request(ctx.app).post('/wa/qr').set('Cookie', cookieOf('SUPER_ADMIN'));
    expect(offline.status).toBe(409);
    await pause(100);
    expect(received).toEqual([]);
  });

  it('WA-18 POST /wa/qr is 403 for a Manager and an Employee', async () => {
    await setWorkerState(state('reconnect_required'));
    for (const role of ['MANAGER', 'EMPLOYEE'] as const) {
      const res = await request(ctx.app).post('/wa/qr').set('Cookie', cookieOf(role));
      expect(res.status).toBe(403);
    }
    await pause(100);
    expect(received).toEqual([]);
  });

  it('WA-19 POST /wa/logout asks the worker to log out when connected', async () => {
    await setWorkerState(state('connected'));
    const res = await request(ctx.app).post('/wa/logout').set('Cookie', cookieOf('SUPER_ADMIN'));
    expect(res.status).toBe(202);
    await waitFor(() => received.length === 1);
    expect(received[0]?.command).toBe('logout');
  });

  it('WA-19 POST /wa/logout when not connected is 409, and 403 for other roles', async () => {
    await setWorkerState(state('reconnect_required'));
    const notConnected = await request(ctx.app)
      .post('/wa/logout')
      .set('Cookie', cookieOf('SUPER_ADMIN'));
    expect(notConnected.status).toBe(409);
    expect(notConnected.body).toEqual({ error: 'invalid_state' });
    await setWorkerState(state('connected'));
    for (const role of ['MANAGER', 'EMPLOYEE'] as const) {
      const res = await request(ctx.app).post('/wa/logout').set('Cookie', cookieOf(role));
      expect(res.status).toBe(403);
    }
    await pause(100);
    expect(received).toEqual([]);
  });

  it('WA-20 accepted admin requests write audit rows with actor and IP, and no QR', async () => {
    const admin = cookies.get('SUPER_ADMIN');
    await ctx.db.auditLog.deleteMany({ where: { actorId: admin?.user.id } });
    await setWorkerState(state('reconnect_required'), qr('QR-SECRET'));
    await request(ctx.app).post('/wa/qr').set('Cookie', cookieOf('SUPER_ADMIN')).expect(202);
    await setWorkerState(state('connected'));
    await request(ctx.app).post('/wa/logout').set('Cookie', cookieOf('SUPER_ADMIN')).expect(202);
    await request(ctx.app).post('/wa/logout').set('Cookie', cookieOf('MANAGER')).expect(403);

    const rows = await ctx.db.auditLog.findMany({
      where: { action: { startsWith: 'wa.' }, actorId: { in: users.map((u) => u.id) } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => [r.action, r.actorId])).toEqual([
      ['wa.qr_requested', admin?.user.id],
      ['wa.logout_requested', admin?.user.id],
    ]);
    for (const row of rows) expect(row.ip).toBeTruthy();
    expect(JSON.stringify(rows)).not.toContain('QR-SECRET');
  });
});

describe('origin checks', () => {
  it('WA-21 a socket handshake from a foreign origin is refused, even with a valid session', async () => {
    await expect(connect('SUPER_ADMIN', { origin: 'http://evil.test' })).rejects.toBeTruthy();
    await expect(connect(undefined, { origin: 'http://evil.test' })).rejects.toBeTruthy();
  });

  it('WA-21 an allowed origin or no origin goes on to the session check', async () => {
    await expect(connect('EMPLOYEE', { origin: TEST_ORIGIN })).resolves.toBeTruthy();
    await expect(connect('EMPLOYEE')).resolves.toBeTruthy();
    await expect(connect(undefined, { origin: TEST_ORIGIN })).rejects.toMatchObject({
      message: 'unauthenticated',
    });
  });

  it('WA-22 a non-GET request from a foreign origin gets 403 forbidden_origin', async () => {
    const login = await request(ctx.app)
      .post('/auth/login')
      .set('Origin', 'http://evil.test')
      .send({ email: 'nobody@crm.test', password: 'x' });
    expect(login.status).toBe(403);
    expect(login.body).toEqual({ error: 'forbidden_origin' });

    await setWorkerState(state('connected'));
    const logout = await request(ctx.app)
      .post('/wa/logout')
      .set('Origin', 'http://evil.test')
      .set('Cookie', cookieOf('SUPER_ADMIN'));
    expect(logout.status).toBe(403);
    expect(received).toEqual([]);

    const allowed = await request(ctx.app)
      .post('/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'nobody@crm.test', password: 'x' });
    expect(allowed.status).toBe(401);
    const get = await request(ctx.app).get('/health').set('Origin', 'http://evil.test');
    expect(get.status).not.toBe(403);
  });

  it('WA-22 no CORS headers are sent for any origin', async () => {
    for (const origin of [TEST_ORIGIN, 'http://evil.test']) {
      const responses = await Promise.all([
        request(ctx.app).get('/auth/me').set('Origin', origin),
        request(ctx.app).options('/auth/login').set('Origin', origin),
        request(ctx.app).post('/auth/login').set('Origin', origin).send({}),
      ]);
      for (const res of responses) {
        const corsHeaders = Object.keys(res.headers).filter((h) => h.startsWith('access-control-'));
        expect(corsHeaders).toEqual([]);
      }
    }
  });
});
