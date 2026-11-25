import { randomInt } from 'node:crypto';
import type { Db } from '@crm/db';
import { WA_REDIS, type ConversationSummary, type MessageView } from '@crm/shared';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMessageHandler } from './messages.ts';
import { createRedis } from './redis.ts';
import {
  TEST_CHANNELS,
  TEST_REDIS_URL,
  lastState,
  pause,
  recordEvents,
  resetMessages,
  resetWa,
  startTestWorker,
  testDb,
  waitFor,
  type TestWorker,
} from './test-support.ts';

// Needs `docker compose up -d --wait`. crm_test and Redis db 2 only. Contacts use the fictional
// +1999 range, which `resetMessages` removes.
let db: Db;
let redis: Redis;
let rec: Awaited<ReturnType<typeof recordEvents>>;
const workers: TestWorker[] = [];

beforeAll(() => {
  db = testDb();
  redis = createRedis(TEST_REDIS_URL);
});

beforeEach(async () => {
  await resetWa(db, redis);
  await resetMessages(db);
  rec = await recordEvents();
});

afterEach(async () => {
  for (const w of workers.splice(0)) await w.stop();
  rec.close();
});

afterAll(async () => {
  await resetWa(db, redis);
  await resetMessages(db);
  await db.$disconnect();
  redis.disconnect();
});

const phone = (): string => `+1999${randomInt(10_000_000, 99_999_999)}`;

const created = (): MessageView[] =>
  rec.events.flatMap((r) => (r.event.event === 'message.created' ? [r.event.data] : []));
const updated = (): ConversationSummary[] =>
  rec.events.flatMap((r) => (r.event.event === 'conversation.updated' ? [r.event.data] : []));

async function connected(): Promise<TestWorker> {
  const w = startTestWorker(db);
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

describe('sending', () => {
  it.todo('MSG-14 the send job sends through the provider, saves the provider id and sets sent');
  it.todo('MSG-15 a job whose message is not queued sends nothing; the same job twice sends once');
  it.todo('MSG-16 a failing send is retried 3 times, then marked failed with a reason');
  it.todo(
    'MSG-17 a CRM-sent message is stored once even when the provider reports it back as from-me',
  );
  it.todo('MSG-18 only the lock holder takes send jobs; the next holder sends a stalled job once');
  it.todo('MSG-19 send jobs run one at a time, in queue order');
});

describe('status', () => {
  it.todo(
    'MSG-21 a status report applies nextStatus and publishes only on a change; unknown ids change nothing',
  );
  it.todo('MSG-22 the CRM never sets delivered or read itself; a dev Fake send stays at sent');
});

describe('logs', () => {
  it.todo('MSG-26 no worker log line contains a message body or a full phone number');
});
