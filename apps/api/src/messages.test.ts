import { randomInt, randomUUID } from 'node:crypto';
import {
  ConversationList,
  MessageList,
  MessageView,
  QUEUES,
  WA_REDIS,
  waChannels,
  type ConversationSummary,
  type CrmEvent,
  type MessageStatusUpdate,
  type Role,
  type WaState,
} from '@crm/shared';
import { Queue } from 'bullmq';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  captureOutput,
  createUser,
  deleteUsers,
  listen,
  sessionCookie,
  testApp,
  type TestContext,
  type TestUser,
} from './test-support.ts';

// Needs `docker compose up -d --wait`. crm_test and Redis db 1 only; the queue's keys are in db 1
// too, and are removed after each test. Contacts use the fictional +1999 range.
const CHANNELS = waChannels(1);

let ctx: TestContext;
let server: Awaited<ReturnType<typeof listen>>;
let queue: Queue;
const users: TestUser[] = [];
const clients: Socket[] = [];
const cookies = new Map<Role, { user: TestUser; cookie: string }>();

beforeAll(async () => {
  ctx = testApp();
  await ctx.relayReady;
  server = await listen(ctx);
  queue = new Queue(QUEUES.outboundMessage, { connection: ctx.redis });
  for (const role of ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'] as const) {
    const user = await createUser(ctx.db, { role });
    users.push(user);
    const res = await request(ctx.app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password });
    cookies.set(role, { user, cookie: sessionCookie(res) });
  }
});

async function resetData(): Promise<void> {
  const testContacts = { contact: { phone: { startsWith: '+1999' } } };
  await ctx.db.message.deleteMany({
    where: { OR: [{ conversation: testContacts }, { sentById: { in: users.map((u) => u.id) } }] },
  });
  await ctx.db.conversation.deleteMany({ where: testContacts });
  await ctx.db.contact.deleteMany({ where: { phone: { startsWith: '+1999' } } });
  await queue.obliterate({ force: true });
}

beforeEach(async () => {
  await ctx.redis.del(WA_REDIS.state);
  await resetData();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await ctx.redis.del(WA_REDIS.state);
  await resetData();
  await queue.close();
  await server.close();
  // Users go last: a message's sender cannot be deleted while the message exists (MSG Decision 19).
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

function session(role: Role): { user: TestUser; cookie: string } {
  const entry = cookies.get(role);
  if (!entry) throw new Error(`no ${role} session`);
  return entry;
}

async function setWaState(state: WaState['state']): Promise<void> {
  const s: WaState = { v: 1, state, provider: 'fake', at: new Date().toISOString() };
  await ctx.redis.set(WA_REDIS.state, JSON.stringify(s));
}

const phone = (): string => `+1999${randomInt(10_000_000, 99_999_999)}`;

// A conversation with inbound messages at the given times (oldest first), as the worker stores them.
async function conversationWith(
  times: readonly Date[],
  name: string | null = 'Asha',
): Promise<{ id: string; phone: string }> {
  const number = phone();
  const contact = await ctx.db.contact.create({ data: { phone: number, name } });
  const conversation = await ctx.db.conversation.create({
    data: { contactId: contact.id, lastMessageAt: times.at(-1) ?? null },
  });
  for (const [i, at] of times.entries()) {
    await ctx.db.message.create({
      data: {
        conversationId: conversation.id,
        providerMessageId: `API-${randomUUID()}`,
        direction: 'INBOUND',
        type: 'TEXT',
        body: `message ${i}`,
        at,
      },
    });
  }
  return { id: conversation.id, phone: number };
}

function send(role: Role, conversationId: string, body: unknown): request.Test {
  return request(ctx.app)
    .post(`/conversations/${conversationId}/messages`)
    .set('Cookie', session(role).cookie)
    .send(body as object);
}

const countFor = (conversationId: string): Promise<number> =>
  ctx.db.message.count({ where: { conversationId } });

async function jobCount(): Promise<number> {
  const counts = await queue.getJobCounts();
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

interface Listener {
  client: Socket;
  created: MessageView[];
  statuses: MessageStatusUpdate[];
  conversations: ConversationSummary[];
}

function connect(role: Role): Promise<Listener> {
  const client = ioClient(server.url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { cookie: session(role).cookie },
  });
  clients.push(client);
  const l: Listener = { client, created: [], statuses: [], conversations: [] };
  client.on('message.created', (m: MessageView) => l.created.push(m));
  client.on('message.status', (s: MessageStatusUpdate) => l.statuses.push(s));
  client.on('conversation.updated', (c: ConversationSummary) => l.conversations.push(c));
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(l));
    client.once('connect_error', reject);
  });
}

describe('message routes', () => {
  it('MSG-08 conversations are listed newest first with the contact and a last-message preview', async () => {
    const older = await conversationWith([new Date('2026-11-25T08:00:00Z')], 'Older');
    const newer = await conversationWith(
      [new Date('2026-11-25T09:00:00Z'), new Date('2026-11-25T09:30:00Z')],
      null,
    );
    const res = await request(ctx.app)
      .get('/conversations')
      .set('Cookie', session('MANAGER').cookie);
    expect(res.status).toBe(200);
    const list = ConversationList.parse(res.body).conversations.filter((c) =>
      [older.id, newer.id].includes(c.id),
    );
    expect(list.map((c) => c.id)).toEqual([newer.id, older.id]);
    expect(list[0]).toMatchObject({
      contact: { phone: newer.phone, name: null },
      lastMessageAt: '2026-11-25T09:30:00.000Z',
      lastMessage: { body: 'message 1', direction: 'inbound' },
    });
    expect(list[1]?.contact.name).toBe('Older');
  });

  it('MSG-08 messages are returned oldest first, at most the last 100', async () => {
    const base = Date.parse('2026-11-25T00:00:00Z');
    const times = Array.from({ length: 105 }, (_, i) => new Date(base + i * 1_000));
    // Stored out of order: the order comes from `at`, not from insertion.
    const { id } = await conversationWith([...times].reverse());
    const res = await request(ctx.app)
      .get(`/conversations/${id}/messages`)
      .set('Cookie', session('SUPER_ADMIN').cookie);
    expect(res.status).toBe(200);
    const { messages } = MessageList.parse(res.body);
    expect(messages).toHaveLength(100);
    expect(messages.map((m) => m.at)).toEqual(times.slice(5).map((t) => t.toISOString()));
  });

  it('MSG-08 an unknown or malformed conversation id gives 404 not_found', async () => {
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const res = await request(ctx.app)
        .get(`/conversations/${id}/messages`)
        .set('Cookie', session('MANAGER').cookie);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
  });

  it('MSG-09 a send stores a queued message, adds its job with the message id, pushes it and returns 202', async () => {
    await setWaState('connected');
    const { id } = await conversationWith([new Date('2026-11-25T08:00:00Z')]);
    const manager = await connect('MANAGER');
    const before = Date.now();
    const res = await send('MANAGER', id, { text: '  Hello from the CRM  ' });
    expect(res.status).toBe(202);
    const view = MessageView.parse(res.body);
    expect(view).toMatchObject({
      conversationId: id,
      direction: 'outbound',
      type: 'text',
      body: 'Hello from the CRM',
      status: 'queued',
      failureReason: null,
      sender: { id: session('MANAGER').user.id, name: session('MANAGER').user.name },
    });

    const row = await ctx.db.message.findUniqueOrThrow({ where: { id: view.id } });
    expect(row).toMatchObject({ status: 'QUEUED', sentById: session('MANAGER').user.id });
    expect(row.providerMessageId).toBeNull();
    const job = await queue.getJob(view.id);
    expect(job?.id).toBe(view.id);
    expect(job?.data).toEqual({ v: 1, messageId: view.id });
    expect(job?.opts.attempts).toBe(3);
    // The conversation moves to the top.
    const conversation = await ctx.db.conversation.findUniqueOrThrow({ where: { id } });
    expect(conversation.lastMessageAt?.getTime()).toBeGreaterThanOrEqual(before - 5);

    await waitFor(() => manager.created.length === 1 && manager.conversations.length === 1);
    expect(manager.created[0]).toEqual(view);
    expect(manager.conversations[0]?.lastMessage?.id).toBe(view.id);
  });

  it('MSG-09 when adding the job fails the message is marked failed and the send gets 503', async () => {
    const broken = testApp(
      {},
      {
        outbound: {
          add: () => Promise.reject(new Error('redis down')),
          close: () => Promise.resolve(),
        },
      },
    );
    try {
      await setWaState('connected');
      const { id } = await conversationWith([new Date()]);
      const out = captureOutput();
      const res = await request(broken.app)
        .post(`/conversations/${id}/messages`)
        .set('Cookie', session('MANAGER').cookie)
        .send({ text: 'will not queue' });
      out.restore();
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'queue_unavailable' });
      const row = await ctx.db.message.findFirstOrThrow({
        where: { conversationId: id, direction: 'OUTBOUND' },
      });
      expect(row).toMatchObject({ status: 'FAILED', failureReason: 'PROVIDER_ERROR' });
      expect(out.text()).toContain('api: queueing a message failed (Error)');
    } finally {
      await broken.close();
    }
  });

  it('MSG-10 an empty, too long or unknown-field send gets 400; nothing is stored or queued', async () => {
    await setWaState('connected');
    const { id } = await conversationWith([new Date()]);
    const before = await countFor(id);
    for (const body of [
      {},
      { text: '' },
      { text: '   \n ' },
      { text: 'x'.repeat(4097) },
      { text: 'ok', extra: true },
      { text: 'ok', clientId: 'not-a-uuid' },
      { text: 42 },
    ]) {
      const res = await send('MANAGER', id, body);
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
    }
    expect((await send('MANAGER', id, { text: 'x'.repeat(4096) })).status).toBe(202);
    expect(await countFor(id)).toBe(before + 1);
    expect(await jobCount()).toBe(1);
  });

  it('MSG-10 a send to an unknown conversation gets 404; nothing is stored or queued', async () => {
    await setWaState('connected');
    const total = await ctx.db.message.count();
    for (const id of [randomUUID(), 'nope']) {
      const res = await send('MANAGER', id, { text: 'hello' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
    expect(await ctx.db.message.count()).toBe(total);
    expect(await jobCount()).toBe(0);
  });

  it('MSG-11 a send while WhatsApp is not connected gets 503 wa_not_connected; nothing stored', async () => {
    const { id } = await conversationWith([new Date()]);
    const before = await countFor(id);
    // No state key at all is `worker_offline`.
    for (const state of [
      undefined,
      'connecting',
      'qr_required',
      'disconnected',
      'reconnect_required',
    ] as const) {
      if (state === undefined) await ctx.redis.del(WA_REDIS.state);
      else await setWaState(state);
      const res = await send('SUPER_ADMIN', id, { text: 'hello' });
      expect(res.status, String(state)).toBe(503);
      expect(res.body).toEqual({ error: 'wa_not_connected' });
    }
    expect(await countFor(id)).toBe(before);
    expect(await jobCount()).toBe(0);
  });

  it('MSG-12 an Employee gets 403 on every message route; nothing stored; Super Admin and Manager are allowed', async () => {
    await setWaState('connected');
    const { id } = await conversationWith([new Date()]);
    const before = await countFor(id);
    const employee = session('EMPLOYEE').cookie;
    const responses = [
      await request(ctx.app).get('/conversations').set('Cookie', employee),
      await request(ctx.app).get(`/conversations/${id}/messages`).set('Cookie', employee),
      await send('EMPLOYEE', id, { text: 'hello' }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden' });
    }
    expect(await countFor(id)).toBe(before);
    expect(await jobCount()).toBe(0);
    for (const role of ['SUPER_ADMIN', 'MANAGER'] as const) {
      expect(
        (await request(ctx.app).get('/conversations').set('Cookie', session(role).cookie)).status,
      ).toBe(200);
      expect((await send(role, id, { text: `from ${role}` })).status).toBe(202);
    }
  });

  it('MSG-13 a repeated clientId returns the existing message and queues nothing new', async () => {
    await setWaState('connected');
    const { id } = await conversationWith([new Date()]);
    const clientId = randomUUID();
    const first = await send('MANAGER', id, { text: 'once', clientId });
    expect(first.status).toBe(202);
    const again = await send('MANAGER', id, { text: 'once', clientId });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    // Two at the same moment.
    const other = randomUUID();
    const pair = await Promise.all([
      send('MANAGER', id, { text: 'pair', clientId: other }),
      send('MANAGER', id, { text: 'pair', clientId: other }),
    ]);
    expect(pair.map((r) => r.status).sort()).toEqual([200, 202]);
    expect(pair[0]?.body).toEqual(pair[1]?.body);
    expect(
      await ctx.db.message.count({ where: { conversationId: id, direction: 'OUTBOUND' } }),
    ).toBe(2);
    expect(await jobCount()).toBe(2);
    // The same clientId in another conversation is a different message.
    const second = await conversationWith([new Date()]);
    expect((await send('MANAGER', second.id, { text: 'once', clientId })).status).toBe(202);
  });
});

describe('message events', () => {
  it('MSG-23 message events reach inbox:all only; the Employee receives none', async () => {
    await setWaState('connected');
    const { id } = await conversationWith([new Date()]);
    const listeners = {
      SUPER_ADMIN: await connect('SUPER_ADMIN'),
      MANAGER: await connect('MANAGER'),
      EMPLOYEE: await connect('EMPLOYEE'),
    };
    // From the api itself (a send) ...
    const sent = MessageView.parse((await send('MANAGER', id, { text: 'to everyone?' })).body);
    // ... and from the worker through the relay.
    const status: CrmEvent = {
      event: 'message.status',
      data: {
        v: 1,
        messageId: sent.id,
        conversationId: id,
        status: 'sent',
        failureReason: null,
        at: new Date().toISOString(),
      },
    };
    const inbound: CrmEvent = {
      event: 'message.created',
      data: { ...sent, id: randomUUID(), direction: 'inbound', status: null, sender: null },
    };
    await ctx.redis.publish(CHANNELS.events, JSON.stringify(status));
    await ctx.redis.publish(CHANNELS.events, JSON.stringify(inbound));

    for (const role of ['SUPER_ADMIN', 'MANAGER'] as const) {
      const l = listeners[role];
      await waitFor(() => l.created.length === 2 && l.statuses.length === 1);
      expect(l.created.map((m) => m.id)).toEqual([sent.id, inbound.data.id]);
      expect(l.statuses).toEqual([status.data]);
      expect(l.conversations).toHaveLength(1);
    }
    await pause(200);
    const employee = listeners.EMPLOYEE;
    expect(employee.created).toHaveLength(0);
    expect(employee.statuses).toHaveLength(0);
    expect(employee.conversations).toHaveLength(0);
    // Nothing arrived twice.
    expect(listeners.MANAGER.created).toHaveLength(2);
  });
});

describe('logs', () => {
  it('MSG-26 no api log line contains a message body or a full phone number', async () => {
    await setWaState('connected');
    const { id, phone: number } = await conversationWith([new Date()]);
    const secret = `secret-body-${randomUUID()}`;
    const out = captureOutput();
    try {
      await send('MANAGER', id, { text: secret });
      await send('MANAGER', id, { text: '' });
      await send('MANAGER', randomUUID(), { text: secret });
      await request(ctx.app).get('/conversations').set('Cookie', session('MANAGER').cookie);
      await request(ctx.app)
        .get(`/conversations/${id}/messages`)
        .set('Cookie', session('MANAGER').cookie);
      await setWaState('disconnected');
      await send('MANAGER', id, { text: secret });
    } finally {
      out.restore();
    }
    expect(out.text()).not.toContain(secret);
    expect(out.text()).not.toContain(number);
    expect(out.text()).not.toContain(number.slice(1));
  });
});
