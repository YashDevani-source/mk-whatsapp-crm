import { randomInt, randomUUID } from 'node:crypto';
import type { Db } from '@crm/db';
import {
  QUEUES,
  WA_REDIS,
  type ConversationSummary,
  type MessageStatusUpdate,
  type MessageView,
  type OutboundMessageJob,
} from '@crm/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageHandler } from './messages.ts';
import { createProvider } from './providers/index.ts';
import type { FakeProvider } from './providers/fake/fake.ts';
import { createRedis } from './redis.ts';
import { createSessionStore } from './session-store.ts';
import {
  TEST_CHANNELS,
  TEST_KEY,
  TEST_REDIS_URL,
  killAll,
  lastState,
  pause,
  recordEvents,
  resetMessages,
  resetWa,
  spawnWorker,
  startTestWorker,
  testDb,
  waitFor,
  workerEnv,
  type Spawned,
  type TestWorker,
} from './test-support.ts';

// Needs `docker compose up -d --wait`. crm_test and Redis db 2 only. Contacts use the fictional
// +1999 range, which `resetMessages` removes.
let db: Db;
let redis: Redis;
let rec: Awaited<ReturnType<typeof recordEvents>>;
let queue: Queue<OutboundMessageJob>;
const workers: TestWorker[] = [];
const spawned: Spawned[] = [];

beforeAll(() => {
  db = testDb();
  redis = createRedis(TEST_REDIS_URL);
  // The api's side of the queue, on the worker tests' Redis db 2. `resetWa` flushes db 2, jobs too.
  queue = new Queue<OutboundMessageJob>(QUEUES.outboundMessage, { connection: redis });
});

beforeEach(async () => {
  await resetWa(db, redis);
  await resetMessages(db);
  rec = await recordEvents();
});

afterEach(async () => {
  for (const w of workers.splice(0)) await w.stop();
  await killAll(spawned.splice(0));
  rec.close();
});

afterAll(async () => {
  await resetWa(db, redis);
  await resetMessages(db);
  await queue.close();
  await db.$disconnect();
  redis.disconnect();
});

const phone = (): string => `+1999${randomInt(10_000_000, 99_999_999)}`;

const created = (): MessageView[] =>
  rec.events.flatMap((r) => (r.event.event === 'message.created' ? [r.event.data] : []));
const updated = (): ConversationSummary[] =>
  rec.events.flatMap((r) => (r.event.event === 'conversation.updated' ? [r.event.data] : []));

async function connected(fake?: FakeProvider): Promise<TestWorker> {
  const w = startTestWorker(db, fake ? { fake } : {});
  workers.push(w);
  await waitFor(() => w.fake.connected);
  w.fake.emitQr();
  await w.fake.scan();
  await waitFor(() => lastState(rec)?.state === 'connected');
  return w;
}

const messageCount = (providerMessageId: string): Promise<number> =>
  db.message.count({ where: { providerMessageId } });

async function stored(providerMessageId: string): Promise<void> {
  await waitFor(async () => (await messageCount(providerMessageId)) === 1);
}

describe('inbound messages', () => {
  it('MSG-01 a text from a new number creates one contact, one conversation and one inbound message', async () => {
    const w = await connected();
    const from = phone();
    const at = new Date('2026-11-25T10:00:00.000Z');
    const id = w.fake.receive({ from, text: 'hello', profileName: 'Asha', at });
    await stored(id);

    const contacts = await db.contact.findMany({ where: { phone: from } });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.name).toBe('Asha');
    const conversations = await db.conversation.findMany({ where: { contact: { phone: from } } });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.lastMessageAt?.toISOString()).toBe(at.toISOString());
    const message = await db.message.findUniqueOrThrow({ where: { providerMessageId: id } });
    expect(message).toMatchObject({
      conversationId: conversations[0]?.id,
      direction: 'INBOUND',
      type: 'TEXT',
      body: 'hello',
      status: null,
      sentById: null,
    });
    expect(message.at.toISOString()).toBe(at.toISOString());

    await waitFor(() => created().length === 1 && updated().length === 1);
    expect(created()[0]).toMatchObject({
      id: message.id,
      direction: 'inbound',
      body: 'hello',
      sender: null,
      at: at.toISOString(),
    });
    expect(updated()[0]).toMatchObject({
      id: conversations[0]?.id,
      contact: { phone: from, name: 'Asha' },
      lastMessageAt: at.toISOString(),
      lastMessage: { id: message.id },
    });
  });

  it('MSG-02 a later message reuses the contact and conversation and never moves lastMessageAt back', async () => {
    const w = await connected();
    const from = phone();
    const t1 = new Date('2026-11-25T10:00:00.000Z');
    const t2 = new Date('2026-11-25T10:05:00.000Z');
    const t0 = new Date('2026-11-25T09:00:00.000Z');
    await stored(w.fake.receive({ from, text: 'one', at: t1 }));
    await stored(w.fake.receive({ from, text: 'two', at: t2, profileName: 'Ravi' }));
    // Late delivery of an older message after a reconnect.
    await stored(w.fake.receive({ from, text: 'zero', at: t0, profileName: 'Someone Else' }));

    expect(await db.contact.count({ where: { phone: from } })).toBe(1);
    const conversation = await db.conversation.findFirstOrThrow({
      where: { contact: { phone: from } },
      include: { contact: true, _count: { select: { messages: true } } },
    });
    expect(conversation._count.messages).toBe(3);
    expect(conversation.lastMessageAt?.toISOString()).toBe(t2.toISOString());
    // The first profile name filled the empty name; the later one did not replace it.
    expect(conversation.contact.name).toBe('Ravi');
  });

  it('MSG-02 a contact name set by staff is never overwritten by the profile name', async () => {
    const w = await connected();
    const from = phone();
    await db.contact.create({ data: { phone: from, name: 'Staff Name' } });
    await stored(w.fake.receive({ from, text: 'hi', profileName: 'Profile Name' }));
    expect((await db.contact.findUniqueOrThrow({ where: { phone: from } })).name).toBe(
      'Staff Name',
    );
  });

  it('MSG-03 the same provider message reported twice is stored once and published once', async () => {
    const w = await connected();
    const from = phone();
    const id = w.fake.receive({ from, text: 'once' });
    w.fake.receive({ from, text: 'once', id });
    await stored(id);
    // A third report, after the first is stored.
    w.fake.receive({ from, text: 'once', id });
    await pause(200);
    expect(await messageCount(id)).toBe(1);
    expect(created().filter((m) => m.body === 'once')).toHaveLength(1);
  });

  it('MSG-03 two reports of the same message at the same moment store one row', async () => {
    const handler = createMessageHandler({
      db,
      redis,
      channels: TEST_CHANNELS,
      log: () => undefined,
    });
    const from = phone();
    const message = {
      providerMessageId: `RACE-${randomInt(1e9)}`,
      from,
      fromMe: false,
      content: { kind: 'text' as const, text: 'race' },
      at: new Date(),
    };
    // Also races the contact and conversation upserts of a brand-new number.
    await Promise.all([handler.onMessage(message), handler.onMessage(message)]);
    expect(await messageCount(message.providerMessageId)).toBe(1);
    expect(await db.contact.count({ where: { phone: from } })).toBe(1);
    await waitFor(() => created().length >= 1);
    await pause(100);
    expect(created()).toHaveLength(1);
  });

  it('MSG-04 skipped messages store and publish nothing and the log names only the reason', async () => {
    const w = await connected();
    const before = await db.message.count();
    rec.clear();
    for (const reason of ['group', 'broadcast', 'status', 'channel', 'unknown_sender'] as const) {
      w.fake.skip(reason);
    }
    const skips = (): string[] => w.logs.filter((l) => l.includes('skipped a message'));
    await waitFor(() => skips().length === 5);
    expect(skips()).toEqual([
      '@crm/worker: skipped a message (group)',
      '@crm/worker: skipped a message (broadcast)',
      '@crm/worker: skipped a message (status)',
      '@crm/worker: skipped a message (channel)',
      '@crm/worker: skipped a message (unknown_sender)',
    ]);
    expect(await db.message.count()).toBe(before);
    expect(created()).toHaveLength(0);
  });

  it('MSG-05 inbound media is stored as unsupported with its kind and is published', async () => {
    const w = await connected();
    const id = w.fake.receive({ from: phone(), unsupportedKind: 'image' });
    await stored(id);
    expect(await db.message.findUniqueOrThrow({ where: { providerMessageId: id } })).toMatchObject({
      direction: 'INBOUND',
      type: 'UNSUPPORTED',
      unsupportedKind: 'image',
      body: null,
    });
    await waitFor(() => created().length === 1);
    expect(created()[0]).toMatchObject({ type: 'unsupported', unsupportedKind: 'image' });
  });

  it('MSG-06 a message typed on the company phone is stored outbound with no sender', async () => {
    const w = await connected();
    const from = phone();
    const id = w.fake.receive({ from, text: 'from the phone', fromMe: true, profileName: 'MK' });
    await stored(id);
    expect(await db.message.findUniqueOrThrow({ where: { providerMessageId: id } })).toMatchObject({
      direction: 'OUTBOUND',
      sentById: null,
      status: 'SENT',
      body: 'from the phone',
    });
    // The company's own profile name never becomes the contact's name.
    expect((await db.contact.findUniqueOrThrow({ where: { phone: from } })).name).toBeNull();
    await waitFor(() => created().length === 1);
    expect(created()[0]).toMatchObject({ direction: 'outbound', sender: null, status: 'sent' });
  });

  it('MSG-07 a worker that lost the lock stores nothing from its closed connection', async () => {
    const w = await connected();
    await redis.set(WA_REDIS.lock, 'another-worker');
    await waitFor(() => w.logs.some((l) => l.includes('lost the WhatsApp lock')));
    rec.clear();
    const id = w.fake.receiveOnOldConnection({ from: phone(), text: 'too late' });
    await pause(300);
    expect(await messageCount(id)).toBe(0);
    expect(created()).toHaveLength(0);
  });

  it('MSG-07 an event from an older connection is ignored and the current one is stored', async () => {
    const w = await connected();
    w.fake.drop();
    await waitFor(() => lastState(rec)?.state === 'disconnected');
    await waitFor(() => lastState(rec)?.state === 'connected');
    const stale = w.fake.receiveOnOldConnection({ from: phone(), text: 'stale' });
    const fresh = w.fake.receive({ from: phone(), text: 'fresh' });
    await stored(fresh);
    await pause(100);
    expect(await messageCount(stale)).toBe(0);
  });

  it('MSG-07 a standby worker never connects, so it stores nothing', async () => {
    await connected();
    const standby = startTestWorker(db);
    workers.push(standby);
    await waitFor(() => standby.logs.some((l) => l.includes('standby')));
    expect(standby.fake.connected).toBe(false);
    expect(() => standby.fake.receive({ from: phone(), text: 'x' })).toThrow(/not connected/);
  });
});

const statuses = (): MessageStatusUpdate[] =>
  rec.events.flatMap((r) => (r.event.event === 'message.status' ? [r.event.data] : []));

// An outbound message stored as the api stores it (MSG-09), and its job with a short backoff.
async function queueMessage(
  text: string,
  options: { to?: string; status?: 'QUEUED' | 'SENT'; addJob?: boolean } = {},
): Promise<{ id: string; to: string }> {
  const to = options.to ?? phone();
  const contact = await db.contact.upsert({
    where: { phone: to },
    create: { phone: to },
    update: {},
  });
  const conversation = await db.conversation.upsert({
    where: { contactId: contact.id },
    create: { contactId: contact.id },
    update: {},
  });
  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      type: 'TEXT',
      body: text,
      status: options.status ?? 'QUEUED',
    },
  });
  if (options.addJob !== false) await addJob(message.id);
  return { id: message.id, to };
}

async function addJob(messageId: string, jobId = messageId): Promise<void> {
  await queue.add(
    QUEUES.outboundMessage,
    { v: 1, messageId },
    { jobId, attempts: 3, backoff: { type: 'exponential', delay: 50 } },
  );
}

async function statusOf(id: string): Promise<string | null> {
  return (await db.message.findUniqueOrThrow({ where: { id } })).status;
}

async function statusIs(id: string, status: string, ms = 5_000): Promise<void> {
  await waitFor(async () => (await statusOf(id)) === status, ms);
}

async function jobDone(jobId: string): Promise<void> {
  await waitFor(async () => ['completed', 'failed'].includes(await queue.getJobState(jobId)));
}

describe('sending', () => {
  it('MSG-14 the send job sends through the provider, saves the provider id and sets sent', async () => {
    const w = await connected();
    const { id, to } = await queueMessage('Hello from the CRM');
    await statusIs(id, 'SENT');
    expect(w.fake.sends).toHaveLength(1);
    const [sent] = w.fake.sends;
    expect(sent).toMatchObject({ to, text: 'Hello from the CRM' });
    const row = await db.message.findUniqueOrThrow({ where: { id } });
    expect(row.providerMessageId).toBe(sent?.providerMessageId);
    expect(row.statusAt).not.toBeNull();
    await waitFor(() => statuses().length === 1);
    expect(statuses()[0]).toMatchObject({ messageId: id, status: 'sent', failureReason: null });
  });

  it('MSG-15 a job whose message is not queued sends nothing; the same job twice sends once', async () => {
    const w = await connected();
    const already = await queueMessage('already sent', { status: 'SENT' });
    await jobDone(already.id);
    const missing = randomUUID();
    await addJob(missing);
    await jobDone(missing);
    expect(w.fake.sendCalls).toBe(0);

    const once = await queueMessage('once');
    await statusIs(once.id, 'SENT');
    await jobDone(once.id);
    // The same job id again is not a new job; another job for the same message finds it sent.
    await addJob(once.id);
    await addJob(once.id, `${once.id}-again`);
    await jobDone(`${once.id}-again`);
    expect(w.fake.sendCalls).toBe(1);
    expect(statuses()).toHaveLength(1);
  });

  it('MSG-16 a failing send is retried 3 times, then marked failed with provider_error', async () => {
    const w = await connected();
    w.fake.failSends(10);
    const { id } = await queueMessage('will fail');
    await statusIs(id, 'FAILED');
    expect(w.fake.sendCalls).toBe(3);
    expect((await db.message.findUniqueOrThrow({ where: { id } })).failureReason).toBe(
      'PROVIDER_ERROR',
    );
    await waitFor(() => statuses().length === 1);
    expect(statuses()).toEqual([
      expect.objectContaining({ messageId: id, status: 'failed', failureReason: 'provider_error' }),
    ]);
  });

  it('MSG-16 a send that fails once and then succeeds publishes only sent', async () => {
    const w = await connected();
    w.fake.failSends(1);
    const { id } = await queueMessage('second time lucky');
    await statusIs(id, 'SENT');
    expect(w.fake.sendCalls).toBe(2);
    await pause(100);
    expect(statuses().map((s) => s.status)).toEqual(['sent']);
  });

  it('MSG-16 a send while WhatsApp is not connected ends failed with wa_not_connected', async () => {
    const w = await connected();
    w.fake.failConnects(1_000);
    w.fake.drop();
    await waitFor(() => lastState(rec)?.state === 'disconnected');
    const { id } = await queueMessage('nobody home');
    await statusIs(id, 'FAILED');
    expect(w.fake.sendCalls).toBe(0);
    expect((await db.message.findUniqueOrThrow({ where: { id } })).failureReason).toBe(
      'WA_NOT_CONNECTED',
    );
    await waitFor(() => statuses().length === 1);
    expect(statuses()[0]).toMatchObject({ status: 'failed', failureReason: 'wa_not_connected' });
  });

  it('MSG-17 a CRM-sent message is stored once even when the provider reports it back as from-me', async () => {
    const w = await connected();
    w.fake.echoNextSend();
    const { id, to } = await queueMessage('echo me');
    await statusIs(id, 'SENT');
    const providerMessageId = w.fake.sends[0]?.providerMessageId;
    expect(providerMessageId).toBeDefined();
    await pause(200);
    expect(await db.message.count({ where: { providerMessageId } })).toBe(1);
    expect(await db.message.count({ where: { conversation: { contact: { phone: to } } } })).toBe(1);
    expect(created()).toHaveLength(0);
  });

  it('MSG-18 a standby worker takes no send jobs', async () => {
    const holder = await connected();
    const standby = startTestWorker(db);
    workers.push(standby);
    await waitFor(() => standby.logs.some((l) => l.includes('standby')));
    const ids = await Promise.all(['a', 'b', 'c'].map((t) => queueMessage(t)));
    for (const { id } of ids) await statusIs(id, 'SENT');
    expect(holder.fake.sends).toHaveLength(3);
    expect(standby.fake.sendCalls).toBe(0);
  });

  it('MSG-18 after the holder is killed, the next holder sends a queued job once', async () => {
    // A paired Fake session, so the spawned worker connects at once.
    await createSessionStore(db, TEST_KEY, 'fake').saveCreds(JSON.stringify({ registered: true }));
    const a = spawnWorker(workerEnv({ WA_LOCK_TTL_MS: '1500' }));
    spawned.push(a);
    await a.waitForOutput('WhatsApp lock acquired');
    await waitFor(() => lastState(rec)?.state === 'connected', 10_000);
    const b = startTestWorker(db, { config: { lockTtlMs: 1_500 } });
    workers.push(b);
    await waitFor(() => b.logs.some((l) => l.includes('standby')));

    a.child.kill('SIGKILL');
    await a.exited;
    const { id } = await queueMessage('after the takeover');
    await statusIs(id, 'SENT', 15_000);
    expect(b.fake.sends.map((s) => s.text)).toEqual(['after the takeover']);
    await pause(300);
    expect(b.fake.sendCalls).toBe(1);
  });

  it('MSG-19 send jobs run one at a time, in queue order', async () => {
    const w = await connected();
    w.fake.delaySends(150);
    const to = phone();
    const first = await queueMessage('first', { to });
    const second = await queueMessage('second', { to });
    const third = await queueMessage('third', { to });
    for (const { id } of [first, second, third]) await statusIs(id, 'SENT');
    expect(w.fake.sends.map((s) => s.text)).toEqual(['first', 'second', 'third']);
    expect(w.fake.maxActiveSends).toBe(1);
  });
});

describe('status', () => {
  it('MSG-21 a status report applies nextStatus and publishes only on a change', async () => {
    const w = await connected();
    const { id } = await queueMessage('track me');
    await statusIs(id, 'SENT');
    const providerMessageId = w.fake.sends[0]?.providerMessageId ?? '';
    rec.clear();

    w.fake.report(providerMessageId, 'delivered');
    await statusIs(id, 'DELIVERED');
    w.fake.report(providerMessageId, 'delivered');
    w.fake.report(providerMessageId, 'sent');
    w.fake.report(providerMessageId, 'read');
    await statusIs(id, 'READ');
    // Out of order, after read.
    w.fake.report(providerMessageId, 'delivered');
    w.fake.report(providerMessageId, 'failed');
    await pause(200);
    expect(await statusOf(id)).toBe('READ');
    expect(statuses().map((s) => s.status)).toEqual(['delivered', 'read']);
  });

  it('MSG-21 a failed report on a sent message marks it failed as reported', async () => {
    const w = await connected();
    const { id } = await queueMessage('rejected');
    await statusIs(id, 'SENT');
    w.fake.report(w.fake.sends[0]?.providerMessageId ?? '', 'failed');
    await statusIs(id, 'FAILED');
    expect((await db.message.findUniqueOrThrow({ where: { id } })).failureReason).toBe(
      'REPORTED_FAILED',
    );
    await waitFor(() => statuses().some((s) => s.status === 'failed'));
    expect(statuses().at(-1)?.failureReason).toBe('reported_failed');
  });

  it('MSG-21 a report for an unknown id or an inbound message changes nothing', async () => {
    const w = await connected();
    const inboundId = w.fake.receive({ from: phone(), text: 'inbound' });
    await stored(inboundId);
    rec.clear();
    w.fake.report(inboundId, 'read');
    w.fake.report(`UNKNOWN-${randomUUID()}`, 'delivered');
    await waitFor(() => w.logs.some((l) => l.includes('status for an unknown message ignored')));
    await pause(100);
    expect(
      (await db.message.findUniqueOrThrow({ where: { providerMessageId: inboundId } })).status,
    ).toBeNull();
    expect(statuses()).toHaveLength(0);
  });

  it('MSG-22 the CRM never sets delivered or read itself; a dev Fake send stays at sent', async () => {
    // The provider `pnpm dev` uses: the Fake with auto-pairing on.
    const devFake = (await createProvider('fake')) as FakeProvider;
    const w = await connected(devFake);
    const { id } = await queueMessage('dev send');
    await statusIs(id, 'SENT');
    await pause(500);
    expect(await statusOf(id)).toBe('SENT');
    expect(statuses().map((s) => s.status)).toEqual(['sent']);
    expect(w.fake.sends).toHaveLength(1);
  });
});

describe('logs', () => {
  it('MSG-26 no worker log line contains a message body or a full phone number', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      }),
    );
    try {
      const w = await connected();
      const secret = `secret-${randomUUID()}`;
      const from = phone();
      await stored(w.fake.receive({ from, text: secret, profileName: 'Secret Name' }));
      w.fake.skip('unknown_sender');
      const sent = await queueMessage(secret, { to: from });
      await statusIs(sent.id, 'SENT');
      w.fake.failSends(10);
      const failed = await queueMessage(secret, { to: from });
      await statusIs(failed.id, 'FAILED');
      w.fake.report(`UNKNOWN-${from}`, 'read');
      await waitFor(() => w.logs.some((l) => l.includes('unknown message')));
      const all = [...lines, ...w.logs].join('\n');
      expect(all).toContain('sending a message failed (Error)');
      expect(all).not.toContain(secret);
      expect(all).not.toContain(from.slice(1));
      expect(all).not.toContain('Secret Name');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
