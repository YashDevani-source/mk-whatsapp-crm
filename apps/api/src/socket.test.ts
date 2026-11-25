import { ROOMS, userRoom, type Role, type Room } from '@crm/shared';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from './config.ts';
import {
  createUser,
  deleteUsers,
  listen,
  sessionCookie,
  sessionIdOf,
  testApp,
  type TestContext,
  type TestUser,
} from './test-support.ts';

let ctx: TestContext;
let server: Awaited<ReturnType<typeof listen>>;
const users: TestUser[] = [];
const clients: Socket[] = [];

beforeAll(async () => {
  ctx = testApp();
  server = await listen(ctx);
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await server.close();
  await deleteUsers(ctx.db, users);
  await ctx.close();
});

async function user(role: Role): Promise<TestUser> {
  const u = await createUser(ctx.db, { role });
  users.push(u);
  return u;
}

async function login(u: TestUser): Promise<string> {
  const res = await request(ctx.app)
    .post('/auth/login')
    .send({ email: u.email, password: u.password });
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

async function deactivate(u: TestUser): Promise<void> {
  await ctx.db.user.update({ where: { id: u.id }, data: { active: false } });
}

// Resolves once connected; rejects with the server's `connect_error`.
function connect(cookie?: string): Promise<Socket> {
  const client = ioClient(server.url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: cookie === undefined ? {} : { cookie },
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

// Resolves with the disconnect reason.
function disconnected(client: Socket): Promise<string> {
  return new Promise((resolve) => client.once('disconnect', resolve));
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function within<T>(promise: Promise<T>, ms = 3_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`nothing within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// The rooms of the server-side socket behind a client, without its own socket-id room.
async function roomsOf(client: Socket): Promise<string[]> {
  const [socket] = await ctx.io.in(client.id ?? '').fetchSockets();
  if (!socket) throw new Error('no server socket for this client');
  return [...socket.rooms].filter((room) => room !== client.id).sort();
}

// Sends a `probe` to each room and returns the rooms whose probe reached the client. A final
// probe to `marker`, a room the client is in, arrives after all of them.
async function probes(client: Socket, rooms: readonly Room[], marker: Room): Promise<string[]> {
  const got: string[] = [];
  const done = new Promise<void>((resolve) => {
    client.on('probe', (room: string) => (room === 'marker' ? resolve() : got.push(room)));
  });
  for (const room of rooms) ctx.io.to(room).emit('probe', room);
  ctx.io.to(marker).emit('probe', 'marker');
  await within(done);
  client.off('probe');
  return got;
}

// For a disconnected client: sends a `probe` to each room and returns what arrived within 200 ms.
async function probesAfterDisconnect(client: Socket, rooms: readonly Room[]): Promise<string[]> {
  const got: string[] = [];
  client.on('probe', (room: string) => got.push(room));
  for (const room of rooms) ctx.io.to(room).emit('probe', room);
  await pause(200);
  return got;
}

describe('socket auth and rooms', () => {
  it('FND-15 a socket without a valid session is refused and with one it connects', async () => {
    const cookie = await login(await user('EMPLOYEE'));
    await expect(connect()).rejects.toThrow('unauthenticated');
    await expect(connect(`${SESSION_COOKIE}=forged.signature`)).rejects.toThrow('unauthenticated');
    const client = await connect(cookie);
    expect(client.connected).toBe(true);
  });

  it('FND-15 a cookie whose session has ended or whose user is inactive is refused', async () => {
    const ended = await login(await user('EMPLOYEE'));
    await ctx.redis.del(`sess:${sessionIdOf(ended)}`);
    await expect(connect(ended)).rejects.toThrow('unauthenticated');

    const inactive = await user('MANAGER');
    const cookie = await login(inactive);
    await deactivate(inactive);
    await expect(connect(cookie)).rejects.toThrow('unauthenticated');
  });

  it('FND-16 a client join request is ignored and nothing from that room arrives', async () => {
    const employee = await user('EMPLOYEE');
    const other = await user('EMPLOYEE');
    const client = await connect(await login(employee));
    const targets: Room[] = [ROOMS.inboxAll, ROOMS.admin, userRoom(other.id)];

    for (const event of ['join', 'joinRoom', 'subscribe']) client.emit(event, ...targets);
    for (const room of targets) client.emit('join', room);
    await pause(300);

    expect(await roomsOf(client)).toEqual([ROOMS.global, userRoom(employee.id)].sort());
    expect(await probes(client, targets, userRoom(employee.id))).toEqual([]);
  });

  it('FND-17 rooms are assigned by role and an Employee is never in inbox:all or admin', async () => {
    const cases: Array<[Role, Room[]]> = [
      ['SUPER_ADMIN', [ROOMS.inboxAll, ROOMS.admin, ROOMS.global]],
      ['MANAGER', [ROOMS.inboxAll, ROOMS.global]],
      ['EMPLOYEE', [ROOMS.global]],
    ];
    const all: Room[] = [ROOMS.inboxAll, ROOMS.admin, ROOMS.global];
    for (const [role, rooms] of cases) {
      const u = await user(role);
      const client = await connect(await login(u));
      expect(await roomsOf(client), role).toEqual([...rooms, userRoom(u.id)].sort());
      expect(await probes(client, all, userRoom(u.id)), role).toEqual(
        all.filter((room) => rooms.includes(room)),
      );
    }
  });

  it('FND-20 logout disconnects the sockets of that session and stops room events', async () => {
    const manager = await user('MANAGER');
    const cookie = await login(manager);
    const client = await connect(cookie);
    const closed = disconnected(client);

    const res = await request(ctx.app).post('/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(await within(closed)).toBe('io server disconnect');

    const rooms: Room[] = [ROOMS.inboxAll, ROOMS.global, userRoom(manager.id)];
    expect(await probesAfterDisconnect(client, rooms)).toEqual([]);
    expect(await ctx.io.in(userRoom(manager.id)).fetchSockets()).toEqual([]);
  });

  it('FND-20 logout leaves the sockets of the user other sessions connected', async () => {
    const employee = await user('EMPLOYEE');
    const first = await login(employee);
    const second = await login(employee);
    const leaving = await connect(first);
    const staying = await connect(second);
    const closed = disconnected(leaving);

    await request(ctx.app).post('/auth/logout').set('Cookie', first);
    await within(closed);

    expect(staying.connected).toBe(true);
    expect(await probes(staying, [ROOMS.global], userRoom(employee.id))).toEqual([ROOMS.global]);
  });

  it('FND-20 deactivation disconnects the user sockets on their next socket event', async () => {
    const manager = await user('MANAGER');
    const cookie = await login(manager);
    const client = await connect(cookie);
    const closed = disconnected(client);

    await deactivate(manager);
    client.emit('anything');
    expect(await within(closed)).toBe('io server disconnect');

    expect(await ctx.redis.exists(`sess:${sessionIdOf(cookie)}`)).toBe(0);
    const rooms: Room[] = [ROOMS.inboxAll, ROOMS.global, userRoom(manager.id)];
    expect(await probesAfterDisconnect(client, rooms)).toEqual([]);
  });

  it('FND-20 deactivation disconnects all the user sockets on their next request', async () => {
    const employee = await user('EMPLOYEE');
    const cookies = [await login(employee), await login(employee)];
    const sockets = await Promise.all(cookies.map((cookie) => connect(cookie)));
    const closed = Promise.all(sockets.map(disconnected));

    await deactivate(employee);
    const res = await request(ctx.app)
      .get('/auth/me')
      .set('Cookie', cookies[0] ?? '');
    expect(res.status).toBe(401);
    await within(closed);

    for (const cookie of cookies) {
      expect(await ctx.redis.exists(`sess:${sessionIdOf(cookie)}`)).toBe(0);
    }
    expect(await ctx.io.in(userRoom(employee.id)).fetchSockets()).toEqual([]);
  });
});
