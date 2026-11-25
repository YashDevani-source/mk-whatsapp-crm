// DEMO criteria (docs/specs/004-demo.md). The demo api, store and rules run here without a
// browser; screens are checked by hand (DEMO-33).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AuditEntry,
  CampaignView,
  ContactView,
  InboxItem,
  LeadHistoryEntry,
  ProjectView,
  UserView,
} from '@crm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDemoMode } from '../mode.ts';
import { canOpen, landingPath, navFor, PAGES, pageForPath } from './access.ts';
import { createDemoApi, DemoApiError, memorySession, type DemoApi } from './api.ts';
import { DemoBus, type BusEnvelope } from './bus.ts';
import { TIMING, type EngineCtx } from './engine.ts';
import { followUpTab, needsSummary, propertyCard, uploadProblem } from './rules.ts';
import { buildSeed, DEMO_PASSWORD, isTestNumber } from './seed.ts';
import { runDue } from './sim.ts';
import { DemoData, DemoStore, memoryStorage, STORAGE_KEY, type KeyValueStorage } from './store.ts';

const NOW = new Date('2026-11-26T10:00:00.000Z');

interface Harness {
  api: DemoApi;
  store: DemoStore;
  storage: KeyValueStorage;
  // Every live event sent, in order.
  events: BusEnvelope[];
  // Moves the test clock forward and runs the simulator, like the leader tab does.
  advance: (ms: number) => void;
}

function harness(storage: KeyValueStorage = memoryStorage()): Harness {
  let clock = NOW;
  const store = new DemoStore(storage, () => buildSeed(NOW));
  const bus = new DemoBus();
  const events: BusEnvelope[] = [];
  const record = <E extends BusEnvelope['event']>(event: E) =>
    bus.on(event, (payload) => events.push({ event, payload } as BusEnvelope));
  for (const e of [
    'wa.state',
    'wa.qr',
    'message.created',
    'message.status',
    'conversation.updated',
    'lock.changed',
  ] as const) {
    record(e);
  }
  const api = createDemoApi({
    store,
    bus,
    session: memorySession(),
    now: () => clock,
    delay: () => Promise.resolve(),
    random: () => 0.5,
  });
  const advance = (ms: number): void => {
    // In small steps, so tasks scheduled by other tasks run too.
    for (let left = ms; left > 0; left -= 250) {
      clock = new Date(clock.getTime() + Math.min(250, left));
      const ctx: EngineCtx = {
        now: clock,
        newId: () => crypto.randomUUID(),
        random: () => 0.5,
        events: [],
      };
      store.write((data) => runDue(data, ctx));
      for (const envelope of ctx.events) bus.emitEnvelope(envelope);
    }
  };
  return { api, store, storage, events, advance };
}

// Ids of seeded rows by customer name.
function conversationOf(store: DemoStore, name: string): string {
  const contact = store.data.contacts.find((c) => c.name === name);
  const row = store.data.conversations.find((c) => c.contactId === contact?.id);
  if (!row) throw new Error(`no conversation for ${name}`);
  return row.id;
}

function lastMessage(store: DemoStore, conversationId: string) {
  const messages = store.data.items.flatMap((i) =>
    i.kind === 'message' && i.message.conversationId === conversationId ? [i.message] : [],
  );
  return messages.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DemoApiError) return error.code;
    throw error;
  }
  return 'resolved';
}

const login = (api: DemoApi, who: string) => api.login(`${who}@skyline.test`, DEMO_PASSWORD);

describe('demo mode, data and login', () => {
  it('DEMO-01 the mode switch picks demo only for --mode demo or VITE_DEMO=1', () => {
    expect(isDemoMode({ MODE: 'demo' })).toBe(true);
    expect(isDemoMode({ MODE: 'development', VITE_DEMO: '1' })).toBe(true);
    expect(isDemoMode({ MODE: 'development' })).toBe(false);
    expect(isDemoMode({ MODE: 'production', VITE_DEMO: '0' })).toBe(false);
  });

  describe('DEMO-01 the demo makes no network call', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in demo mode')));
    beforeEach(() => vi.stubGlobal('fetch', fetchSpy));
    afterEach(() => vi.unstubAllGlobals());

    it('DEMO-01 a full demo session never calls fetch', async () => {
      const { api } = harness();
      await login(api, 'aarav');
      await api.me();
      await api.getWa();
      await api.listConversations();
      await api.listLeads();
      await api.listFollowUps();
      await api.listProjects();
      await api.listUsers();
      await api.listAudit();
      await api.logout();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('DEMO-01 no demo file imports the live api, the socket client or fetch', () => {
      const dir = import.meta.dirname;
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.test.ts') || !/\.tsx?$/.test(name)) continue;
        const source = readFileSync(join(dir, name), 'utf8');
        expect(source, name).not.toMatch(/from '\.\.\/api\.ts'|socket\.io-client|\bfetch\(/);
      }
    });
  });

  it.todo('DEMO-02 every demo screen shows the Demo tag and a Simulated banner (manual)');

  it('DEMO-03 the seed is the Skyline Realty dataset and parses with the shared schemas', () => {
    const seed = buildSeed(NOW);
    expect(DemoData.safeParse(seed).success).toBe(true);
    expect(seed.users.map((u) => u.name)).toEqual([
      'Aarav Shah',
      'Neha Kapoor',
      'Rohan Mehta',
      'Priya Nair',
      'Karan Verma',
      'Sneha Iyer',
      'Vikram Rao',
      'Ananya Das',
    ]);
    expect(seed.users.filter((u) => u.role === 'SUPER_ADMIN')).toHaveLength(1);
    expect(seed.users.filter((u) => u.role === 'MANAGER')).toHaveLength(2);
    expect(seed.users.filter((u) => u.role === 'EMPLOYEE' && u.active)).toHaveLength(4);
    expect(seed.users.filter((u) => !u.active).map((u) => u.name)).toEqual(['Ananya Das']);
    expect(seed.contacts).toHaveLength(24);
    expect(seed.contacts.every((c) => isTestNumber(c.phone))).toBe(true);
    expect(seed.conversations).toHaveLength(24);
    expect(new Set(seed.conversations.map((c) => c.status))).toEqual(
      new Set(['open', 'pending', 'closed']),
    );
    expect(seed.leads).toHaveLength(24);
    expect(seed.projects.map((p) => p.name)).toEqual([
      'Green Valley Residency',
      'Lakeview Towers',
      'Palm Grove Villas',
      'Sunrise Plots',
    ]);
    expect(seed.campaigns).toHaveLength(2);
    expect(seed.audit.length).toBeGreaterThan(10);
    // Each part also parses on its own schema.
    for (const u of seed.users) UserView.parse(u);
    for (const c of seed.contacts) ContactView.parse(c);
    for (const i of seed.items) InboxItem.parse(i);
    for (const h of seed.leadHistory) LeadHistoryEntry.parse(h);
    for (const p of seed.projects) ProjectView.parse(p);
    for (const c of seed.campaigns) CampaignView.parse(c);
    for (const a of seed.audit) AuditEntry.parse(a);
    // Every id is unique.
    const ids = [
      ...seed.users,
      ...seed.contacts,
      ...seed.conversations,
      ...seed.leads,
      ...seed.followUps,
      ...seed.audit,
      ...seed.leadHistory,
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // At most one open lead per customer.
    const open = seed.leads.filter((l) => l.closedAt === null).map((l) => l.contactId);
    expect(new Set(open).size).toBe(open.length);
  });

  it('DEMO-04 seeded times are relative to now', () => {
    const later = new Date(NOW.getTime() + 30 * 24 * 3_600_000);
    const a = buildSeed(NOW);
    const b = buildSeed(later);
    const newest = (d: DemoData) =>
      d.items
        .map((i) => (i.kind === 'message' ? i.message.at : i.note.at))
        .sort()
        .at(-1) ?? '';
    expect(new Date(newest(a)).getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime() - new Date(newest(a)).getTime()).toBeLessThan(10 * 60_000);
    expect(new Date(newest(b)).getTime() - new Date(newest(a)).getTime()).toBe(
      later.getTime() - NOW.getTime(),
    );
    // Follow-ups straddle now: some overdue, some upcoming.
    expect(a.followUps.some((f) => f.doneAt === null && f.dueAt < NOW.toISOString())).toBe(true);
    expect(a.followUps.some((f) => f.dueAt > NOW.toISOString())).toBe(true);
  });

  it('DEMO-05 the store survives a reload, resets to the seed, and replaces a corrupt copy', () => {
    const storage = memoryStorage();
    const first = harness(storage);
    first.store.write((d) => {
      d.settings.autoActivity = false;
    });
    expect(harness(storage).store.data.settings.autoActivity).toBe(false);

    first.store.reset();
    expect(harness(storage).store.data.settings.autoActivity).toBe(true);

    storage.setItem(STORAGE_KEY, '{not json');
    expect(harness(storage).store.data.users).toHaveLength(8);
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, users: 'wrong' }));
    expect(harness(storage).store.data.users).toHaveLength(8);
  });

  it('DEMO-06 demo logins work with demo1234 and fail with one message otherwise', async () => {
    const { api } = harness();
    const user = await login(api, 'priya');
    expect(user).toMatchObject({ name: 'Priya Nair', role: 'EMPLOYEE' });
    expect(await api.me()).toEqual(user);
    expect(await api.login('  PRIYA@Skyline.test ', DEMO_PASSWORD)).toEqual(user);

    expect(await rejection(api.login('priya@skyline.test', 'wrong'))).toBe('invalid_credentials');
    expect(await rejection(api.login('nobody@skyline.test', DEMO_PASSWORD))).toBe(
      'invalid_credentials',
    );
    // Deactivated: the same answer.
    expect(await rejection(login(api, 'ananya'))).toBe('invalid_credentials');
    expect(api.demoAccounts()).toHaveLength(8);
  });

  it('DEMO-07 the session lasts until logout, and login and logout are audited', async () => {
    const { api, store } = harness();
    await login(api, 'neha');
    expect((await api.me())?.name).toBe('Neha Kapoor');
    await api.logout();
    expect(await api.me()).toBeNull();
    expect(await rejection(api.listConversations())).toBe('unauthenticated');
    const actions = store.data.audit.slice(-2).map((a) => [a.action, a.actor?.name]);
    expect(actions).toEqual([
      ['auth.login', 'Neha Kapoor'],
      ['auth.logout', 'Neha Kapoor'],
    ]);
  });
});

describe('demo roles', () => {
  it('DEMO-08 the sidebar per role, and each role lands on its first item', () => {
    const labels = (role: Parameters<typeof navFor>[0]) => navFor(role).map((p) => PAGES[p].label);
    expect(labels('SUPER_ADMIN')).toEqual([
      'Dashboard',
      'Inbox',
      'Leads',
      'Properties',
      'Follow-ups',
      'Campaigns',
      'Users',
      'Reports',
      'Audit log',
      'WhatsApp',
    ]);
    expect(labels('MANAGER')).toEqual(labels('SUPER_ADMIN').filter((l) => l !== 'WhatsApp'));
    expect(labels('EMPLOYEE')).toEqual(['Home', 'Inbox', 'Leads', 'Properties', 'Follow-ups']);
    expect(landingPath('SUPER_ADMIN')).toBe('/dashboard');
    expect(landingPath('MANAGER')).toBe('/dashboard');
    expect(landingPath('EMPLOYEE')).toBe('/home');
  });

  it('DEMO-09 a page the role may not open is refused by the guard and by the demo api', async () => {
    expect(pageForPath('/users')).toBe('users');
    expect(pageForPath('/leads/abc')).toBe('leads');
    expect(pageForPath('/nowhere')).toBeUndefined();
    expect(canOpen('EMPLOYEE', 'users')).toBe(false);
    expect(canOpen('MANAGER', 'whatsapp')).toBe(false);
    expect(canOpen('SUPER_ADMIN', 'home')).toBe(false);

    const { api } = harness();
    await login(api, 'karan');
    expect(await rejection(api.listUsers())).toBe('forbidden');
    expect(await rejection(api.listAudit())).toBe('forbidden');
    await login(api, 'rohan');
    expect((await api.listUsers()).length).toBe(8);
    expect((await api.listAudit()).length).toBeGreaterThan(0);
  });

  it('DEMO-10 an Employee gets only their own chats, leads and follow-ups', async () => {
    const { api, store } = harness();
    const priya = await login(api, 'priya');
    const chats = await api.listConversations();
    expect(chats.length).toBeGreaterThan(0);
    expect(chats.every((c) => c.assignee?.id === priya.id)).toBe(true);
    expect((await api.listLeads()).every((l) => l.owner?.id === priya.id)).toBe(true);
    expect((await api.listFollowUps()).every((f) => f.owner.id === priya.id)).toBe(true);

    const other = store.data.conversations.find((c) => c.assigneeId !== priya.id);
    const otherLead = store.data.leads.find((l) => l.ownerId !== priya.id);
    expect(await rejection(api.getConversation(other?.id ?? ''))).toBe('not_found');
    expect(await rejection(api.listItems(other?.id ?? ''))).toBe('not_found');
    expect(await rejection(api.getLead(otherLead?.id ?? ''))).toBe('not_found');

    await login(api, 'neha');
    expect(await api.listConversations()).toHaveLength(24);
    expect(await api.listLeads()).toHaveLength(24);
  });
});

describe('demo WhatsApp (simulated)', () => {
  it('DEMO-11 the QR is a random DEMO string, refreshes every 20 s, and times out after 3', async () => {
    const { api, store, advance } = harness();
    await login(api, 'aarav');
    await api.logoutWa();
    const first = (await api.getWaAdmin()).qr?.qr ?? '';
    expect(first).toMatch(/^DEMO-[0-9a-f-]{36}$/);
    expect((await api.getWa()).state.state).toBe('qr_required');

    advance(TIMING.qrRefreshMs);
    const second = (await api.getWaAdmin()).qr?.qr;
    expect(second).toMatch(/^DEMO-/);
    expect(second).not.toBe(first);
    advance(TIMING.qrRefreshMs);
    expect(store.data.wa.qrAttempts).toBe(3);
    advance(TIMING.qrRefreshMs);
    const wa = await api.getWaAdmin();
    expect(wa.state).toMatchObject({ state: 'reconnect_required', reason: 'qr_timeout' });
    expect(wa.qr).toBeNull();

    // "Get new QR" starts again; the QR is only for the Super Admin.
    await api.requestQr();
    expect((await api.getWaAdmin()).qr).not.toBeNull();
    await login(api, 'neha');
    expect(await rejection(api.getWaAdmin())).toBe('forbidden');
    expect(await rejection(api.requestQr())).toBe('forbidden');
  });

  it('DEMO-12 simulate scan connects, log out moves to qr_required, both audited and pushed', async () => {
    const { api, store, events, advance } = harness();
    await login(api, 'aarav');
    expect(await rejection(api.scanQr())).toBe('wrong_state');
    await api.logoutWa();
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'wa.logout',
      actor: { name: 'Aarav Shah' },
    });
    await api.scanQr();
    expect((await api.getWa()).state.state).toBe('connecting');
    advance(TIMING.connectMs);
    const wa = await api.getWa();
    expect(wa.state.state).toBe('connected');
    expect(wa.number).toBe('+12025550100');
    expect(store.data.audit.at(-1)?.action).toBe('wa.connected');
    const states = events.flatMap((e) => (e.event === 'wa.state' ? [e.payload.state] : []));
    expect(states).toEqual(['qr_required', 'connecting', 'connected']);
    expect(events.some((e) => e.event === 'wa.qr')).toBe(true);
  });

  it('DEMO-13 a dropped connection refuses sends, fails a queued one, and comes back', async () => {
    const { api, store, advance } = harness();
    await login(api, 'neha');
    const id = conversationOf(store, 'Meera Joshi');
    await api.sendMessage(id, 'Queued just before the drop');
    const queued = lastMessage(store, id);
    await api.dropConnection();
    expect((await api.getWa()).state).toMatchObject({ state: 'disconnected', reason: 'network' });
    expect(await rejection(api.sendMessage(id, 'Hello?'))).toBe('wa_not_connected');
    advance(TIMING.sentMs);
    const failed = store.data.items.find(
      (i) => i.kind === 'message' && i.message.id === queued?.id,
    );
    expect(failed?.kind === 'message' && failed.message).toMatchObject({
      status: 'failed',
      failureReason: 'wa_not_connected',
    });
    advance(TIMING.reconnectMs + TIMING.connectMs);
    expect((await api.getWa()).state.state).toBe('connected');
    await api.sendMessage(id, 'Back online');
  });
});

describe('demo inbox', () => {
  it.todo('DEMO-14 inbox three columns with list filters (manual)');

  it('DEMO-15 opening a chat clears unread; an inbound message raises it live', async () => {
    const { api, store, events } = harness();
    await login(api, 'neha');
    const id = conversationOf(store, 'Rahul Sharma');
    expect((await api.getConversation(id)).unreadCount).toBe(2);
    await api.openConversation(id);
    expect((await api.getConversation(id)).unreadCount).toBe(0);

    const rahul = store.data.contacts.find((c) => c.name === 'Rahul Sharma');
    await api.simulateInbound({ phone: rahul?.phone ?? '', text: 'Any update?' });
    const list = await api.listConversations();
    expect(list[0]?.id).toBe(id);
    expect(list[0]?.unreadCount).toBe(1);
    expect(list[0]?.lastMessage?.body).toBe('Any update?');
    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining(['message.created', 'conversation.updated']),
    );
  });

  it('DEMO-15 two tabs share the data: a change in one reaches the other and is never overwritten', async () => {
    const storage = memoryStorage();
    const tabA = harness(storage);
    const tabB = harness(storage);
    await login(tabA.api, 'neha');
    await login(tabB.api, 'rohan');
    const id = conversationOf(tabA.store, 'Rahul Sharma');
    await tabA.api.addNote(id, 'Written in tab A');
    let notified = false;
    tabB.store.subscribe(() => (notified = true));
    expect(tabB.store.sync()).toBe(true);
    expect(notified).toBe(true);
    expect(tabB.store.sync()).toBe(false);
    // Tab B writes on top of A's change, even without syncing first.
    await tabA.api.addNote(id, 'Second note from A');
    await tabB.api.addNote(id, 'Written in tab B');
    const notes = (await tabA.api.listItems(id)).flatMap((i) =>
      i.kind === 'note' ? [i.note.body] : [],
    );
    expect(notes).toEqual(['Written in tab A', 'Second note from A', 'Written in tab B']);
  });

  it('DEMO-16 a reply moves queued, sent, delivered, read; the failing contact fails; Retry sends again', async () => {
    const { api, store, advance } = harness();
    await login(api, 'priya');
    const id = conversationOf(store, 'Meera Joshi');
    await api.sendMessage(id, 'Saturday 10:30 works.');
    const message = lastMessage(store, id);
    expect(message).toMatchObject({ status: 'queued', sender: { name: 'Priya Nair' } });
    const statusOf = () => lastMessage(store, id)?.status;
    advance(TIMING.sentMs);
    expect(statusOf()).toBe('sent');
    advance(TIMING.deliveredMs - TIMING.sentMs);
    expect(statusOf()).toBe('delivered');
    advance(TIMING.readMinMs + TIMING.readSpreadMs);
    expect(statusOf()).toBe('read');

    await login(api, 'karan');
    const failing = conversationOf(store, 'Divya Pillai');
    await api.sendMessage(failing, 'It is ₹4 per sq ft per month.');
    advance(TIMING.failMs);
    const failed = lastMessage(store, failing);
    expect(failed).toMatchObject({ status: 'failed', failureReason: 'provider_error' });
    await api.retryMessage(failed?.id ?? '');
    expect(lastMessage(store, failing)).toMatchObject({ status: 'queued', body: failed?.body });
    // The failed one stays failed (forward only).
    const before = store.data.items.find(
      (i) => i.kind === 'message' && i.message.id === failed?.id,
    );
    expect(before?.kind === 'message' && before.message.status).toBe('failed');
    expect(await rejection(api.retryMessage(lastMessage(store, failing)?.id ?? ''))).toBe(
      'wrong_state',
    );
  });

  it('DEMO-17 the text must be 1 to 4096 characters after trimming', async () => {
    const { api, store } = harness();
    await login(api, 'neha');
    const id = conversationOf(store, 'Meera Joshi');
    expect(await rejection(api.sendMessage(id, '   '))).toBe('invalid_body');
    expect(await rejection(api.sendMessage(id, 'x'.repeat(4097)))).toBe('invalid_body');
    await api.sendMessage(id, `  ${'x'.repeat(4096)}  `);
    expect(lastMessage(store, id)?.body).toHaveLength(4096);
    expect(await rejection(api.addNote(id, ''))).toBe('invalid_body');
  });

  it('DEMO-18 an internal note is stored with the chat, never ticked, never a message', async () => {
    const { api, store, advance } = harness();
    await login(api, 'neha');
    const id = conversationOf(store, 'Meera Joshi');
    const before = (await api.getConversation(id)).lastMessage?.id;
    await api.addNote(id, 'Prefers a morning visit.');
    const items = await api.listItems(id);
    const note = items.at(-1);
    expect(note).toMatchObject({ kind: 'note', note: { body: 'Prefers a morning visit.' } });
    expect(note && 'message' in note).toBe(false);
    // The customer-facing last message is unchanged, and notes work while WhatsApp is down.
    expect((await api.getConversation(id)).lastMessage?.id).toBe(before);
    await api.dropConnection();
    await api.addNote(id, 'Written while WhatsApp is down.');
    advance(TIMING.readMinMs + TIMING.readSpreadMs);
    expect(store.data.sim.tasks.every((t) => t.kind !== 'status')).toBe(true);
  });

  it('DEMO-19 assign and status changes are pushed and audited; Employees cannot assign', async () => {
    const { api, store, events } = harness();
    await login(api, 'neha');
    const id = conversationOf(store, 'Rahul Sharma');
    const priya = store.data.users.find((u) => u.name === 'Priya Nair');
    await api.assignConversation(id, priya?.id ?? null);
    expect((await api.getConversation(id)).assignee?.name).toBe('Priya Nair');
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'conversation.assigned',
      detail: 'Unassigned → Priya Nair',
    });
    // The open lead follows the chat.
    const lead = await api.getLead((await api.getConversation(id)).leadId ?? '');
    expect(lead.owner?.name).toBe('Priya Nair');
    await api.setConversationStatus(id, 'pending');
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'conversation.status',
      detail: 'Open → Pending',
    });
    expect(events.filter((e) => e.event === 'conversation.updated').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(await rejection(api.assignConversation(id, 'not-a-user'))).toBe('invalid_body');

    await login(api, 'priya');
    expect(await rejection(api.assignConversation(id, null))).toBe('forbidden');
    await api.setConversationStatus(id, 'open');
    expect((await api.getConversation(id)).status).toBe('open');
  });

  it('DEMO-20 the reply lock refuses other senders, expires, and can be taken over', async () => {
    const { api, store, advance } = harness();
    const id = conversationOf(store, 'Meera Joshi');
    await login(api, 'priya');
    const lock = await api.typing(id);
    expect(lock.holder.name).toBe('Priya Nair');

    await login(api, 'neha');
    expect((await api.getLock(id))?.holder.name).toBe('Priya Nair');
    expect(await rejection(api.sendMessage(id, 'Hi'))).toBe('reply_locked');
    expect(await rejection(api.typing(id))).toBe('reply_locked');
    await api.takeOver(id);
    expect((await api.getLock(id))?.holder.name).toBe('Neha Kapoor');
    await api.sendMessage(id, 'I will take this one.');
    expect(await api.getLock(id)).toBeNull();

    // Expiry after 60 s without typing.
    await login(api, 'priya');
    await api.typing(id);
    advance(TIMING.lockMs + 250);
    await login(api, 'neha');
    expect(await api.getLock(id)).toBeNull();

    // A simulated agent holds the lock, then replies and lets go.
    const karan = store.data.users.find((u) => u.name === 'Karan Verma');
    await api.simulateAgent(id, karan?.id ?? '');
    expect(await rejection(api.sendMessage(id, 'Hi'))).toBe('reply_locked');
    advance(TIMING.agentReplyMs);
    expect(lastMessage(store, id)?.sender?.name).toBe('Karan Verma');
    expect(await api.getLock(id)).toBeNull();

    // Employees cannot take over; logging out releases the lock.
    await login(api, 'priya');
    await api.typing(id);
    await login(api, 'karan');
    expect(await rejection(api.takeOver(id))).toBe('forbidden');
    await login(api, 'priya');
    await api.logout();
    expect(store.data.locks.filter((l) => l.conversationId === id)).toHaveLength(0);
  });

  it.todo('DEMO-21 sent-from-phone, unsupported, day separators and new-messages divider (manual)');

  it('DEMO-22 simulated customers create conversations and New leads; auto activity every ~45 s', async () => {
    const { api, store, advance } = harness();
    await login(api, 'neha');
    const before = store.data.conversations.length;
    const id = await api.simulateInbound({ text: 'Hi, I saw your ad for 2 BHK flats.' });
    const chat = await api.getConversation(id);
    expect(store.data.conversations).toHaveLength(before + 1);
    expect(chat).toMatchObject({
      status: 'open',
      assignee: null,
      unreadCount: 1,
      leadStage: 'new',
    });
    expect(isTestNumber(chat.contact.phone)).toBe(true);
    expect(store.data.audit.at(-1)?.action).toBe('lead.created');

    // A closed chat reopens, and a closed lead gets a new open one.
    const lakshmi = store.data.contacts.find((c) => c.name === 'Lakshmi Narayan');
    const lakshmiChat = conversationOf(store, 'Lakshmi Narayan');
    expect((await api.getConversation(lakshmiChat)).status).toBe('closed');
    await api.simulateInbound({ phone: lakshmi?.phone ?? '', text: 'Hello again' });
    expect((await api.getConversation(lakshmiChat)).status).toBe('open');
    expect((await api.getConversation(lakshmiChat)).leadStage).toBe('new');

    // Auto activity: the first round sets the clock, later rounds bring a message.
    const count = () => store.data.items.filter((i) => i.kind === 'message').length;
    advance(250);
    const start = count();
    advance(TIMING.autoMs + 10_000);
    expect(count()).toBeGreaterThan(start);
    await api.setAutoActivity(false);
    const off = count();
    advance(TIMING.autoMs * 3);
    expect(count()).toBe(off);
  });
});

function leadOf(store: DemoStore, name: string) {
  const contact = store.data.contacts.find((c) => c.name === name);
  const lead = store.data.leads.find((l) => l.contactId === contact?.id);
  if (!lead) throw new Error(`no lead for ${name}`);
  return lead;
}

describe('demo leads, properties and follow-ups', () => {
  it('DEMO-23 stage, needs and owner changes add history and audit rows; one open lead per customer', async () => {
    const { api, store } = harness();
    await login(api, 'priya');
    const arjun = leadOf(store, 'Arjun Reddy');
    await api.updateLeadStage(arjun.id, 'site_visit');
    const history = await api.listLeadHistory(arjun.id);
    expect(history.at(-1)).toMatchObject({
      field: 'stage',
      from: 'qualified',
      to: 'site_visit',
      actor: { name: 'Priya Nair' },
    });
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'lead.stage',
      detail: 'Qualified → Site visit',
    });

    await api.updateLeadNeeds(arjun.id, {
      budgetMin: 8_000_000,
      budgetMax: 9_000_000,
      location: 'Whitefield',
      propertyType: 'apartment',
      bhk: 2,
    });
    expect((await api.listLeadHistory(arjun.id)).at(-1)).toMatchObject({
      field: 'needs',
      to: '₹80 L – ₹90 L · Whitefield · apartment · 2 BHK',
    });
    expect(
      await rejection(
        api.updateLeadNeeds(arjun.id, {
          budgetMin: 9_000_000,
          budgetMax: 8_000_000,
          location: null,
          propertyType: null,
          bhk: null,
        }),
      ),
    ).toBe('invalid_body');

    // Converted closes the lead; it reopens while no other lead is open.
    await api.updateLeadStage(arjun.id, 'converted');
    expect((await api.getLead(arjun.id)).closedAt).not.toBeNull();
    await api.updateLeadStage(arjun.id, 'negotiation');
    expect((await api.getLead(arjun.id)).closedAt).toBeNull();

    // Lakshmi's lead is converted; a new enquiry opens another, so the old one cannot reopen.
    await login(api, 'neha');
    const lakshmi = leadOf(store, 'Lakshmi Narayan');
    const contact = store.data.contacts.find((c) => c.name === 'Lakshmi Narayan');
    await api.simulateInbound({ phone: contact?.phone ?? '', text: 'Hi again' });
    expect(await rejection(api.updateLeadStage(lakshmi.id, 'negotiation'))).toBe('wrong_state');
    expect((await api.listOtherLeads(lakshmi.id)).map((l) => l.stage)).toEqual(['new']);

    // The owner moves with history, and the chat follows; Employees cannot change owners.
    const karan = store.data.users.find((u) => u.name === 'Karan Verma');
    await api.assignLead(arjun.id, karan?.id ?? null);
    expect((await api.getLead(arjun.id)).owner?.name).toBe('Karan Verma');
    expect((await api.getConversation(arjun.conversationId ?? '')).assignee?.name).toBe(
      'Karan Verma',
    );
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'lead.owner',
      detail: 'Priya Nair → Karan Verma',
    });
    await login(api, 'priya');
    expect(await rejection(api.getLead(arjun.id))).toBe('not_found');
    expect(await rejection(api.assignLead(leadOf(store, 'Meera Joshi').id, null))).toBe(
      'forbidden',
    );
    expect(
      needsSummary({
        budgetMin: null,
        budgetMax: null,
        location: null,
        propertyType: null,
        bhk: null,
      }),
    ).toBe('Not known');
  });

  it('DEMO-24 a shared property is a normal outbound message with a card; upload rules', async () => {
    const { api, store, advance } = harness();
    await login(api, 'priya');
    const meera = conversationOf(store, 'Meera Joshi');
    const lakeview = store.data.projects.find((p) => p.name === 'Lakeview Towers');
    const unit = lakeview?.units[0];
    await api.shareProperty(meera, lakeview?.id ?? '', unit?.id ?? null);
    const item = (await api.listItems(meera)).at(-1);
    expect(item?.kind === 'message' && item.property).toMatchObject({
      title: 'Lakeview Towers · T1-1501',
      price: 13_500_000,
    });
    expect(item?.kind === 'message' && item.message).toMatchObject({
      status: 'queued',
      direction: 'outbound',
      sender: { name: 'Priya Nair' },
    });
    expect(item?.kind === 'message' && item.message.body).toContain('Lakeview-Towers-brochure.pdf');
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'property.shared',
      target: 'Meera Joshi',
    });
    advance(TIMING.deliveredMs);
    expect(lastMessage(store, meera)?.status).toBe('delivered');

    // The same send rules apply: connection, lock, scope.
    await api.dropConnection();
    expect(await rejection(api.shareProperty(meera, lakeview?.id ?? '', null))).toBe(
      'wa_not_connected',
    );
    expect(
      await rejection(
        api.shareProperty(conversationOf(store, 'Rahul Sharma'), lakeview?.id ?? '', null),
      ),
    ).toBe('not_found');
    // Without a unit the card gives the cheapest available price.
    if (lakeview)
      expect(propertyCard(lakeview, null)).toMatchObject({
        unitId: null,
        price: 13_500_000,
        title: 'Lakeview Towers',
      });

    expect(
      uploadProblem({ name: 'site.jpg', mime: 'image/jpeg', size: 4 * 1024 * 1024 }),
    ).toBeNull();
    expect(uploadProblem({ name: 'site.png', mime: 'image/png', size: 6 * 1024 * 1024 })).toBe(
      'Images must be 5 MB or smaller.',
    );
    expect(
      uploadProblem({ name: 'b.pdf', mime: 'application/pdf', size: 9 * 1024 * 1024 }),
    ).toBeNull();
    expect(uploadProblem({ name: 'b.pdf', mime: 'application/pdf', size: 11 * 1024 * 1024 })).toBe(
      'PDFs must be 10 MB or smaller.',
    );
    expect(uploadProblem({ name: 'plan.docx', mime: 'application/msword', size: 1000 })).toBe(
      'Only JPG, PNG or PDF files can be uploaded.',
    );
    expect(uploadProblem({ name: 'empty.png', mime: 'image/png', size: 0 })).toBe(
      'The file is empty.',
    );

    const file = { name: 'tower.png', mime: 'image/png', size: 1000, url: 'blob:demo' };
    expect(await rejection(api.uploadMedia(lakeview?.id ?? '', file))).toBe('forbidden');
    await login(api, 'neha');
    const media = await api.uploadMedia(lakeview?.id ?? '', file);
    expect(media).toMatchObject({ kind: 'image', sessionOnly: true });
    expect((await api.getProject(lakeview?.id ?? '')).photos.at(-1)?.name).toBe('tower.png');
    // Not saved: the stored project is unchanged.
    expect(
      store.data.projects
        .find((p) => p.id === lakeview?.id)
        ?.photos.some((p) => p.name === 'tower.png'),
    ).toBe(false);
    expect(
      await rejection(api.uploadMedia(lakeview?.id ?? '', { ...file, size: 6 * 1024 * 1024 })),
    ).toBe('invalid_body');
  });

  it('DEMO-25 follow-up tabs; create, edit, complete; Run now (test) sends once', async () => {
    const { api, store, advance } = harness();
    expect(followUpTab({ dueAt: '2026-11-26T09:00:00.000Z', doneAt: null }, NOW)).toBe('overdue');
    expect(followUpTab({ dueAt: '2026-11-26T11:00:00.000Z', doneAt: null }, NOW)).toBe('today');
    expect(followUpTab({ dueAt: '2026-11-28T11:00:00.000Z', doneAt: null }, NOW)).toBe('upcoming');
    expect(
      followUpTab({ dueAt: '2026-11-20T11:00:00.000Z', doneAt: '2026-11-20T11:00:00.000Z' }, NOW),
    ).toBe('done');

    await login(api, 'priya');
    const meeraLead = leadOf(store, 'Meera Joshi');
    await api.createFollowUp({
      leadId: meeraLead.id,
      dueAt: '2026-11-27T05:00:00.000Z',
      note: 'Call about parking',
      autoReply: 'Hi Meera, a quick reminder about your visit.',
    });
    const created = (await api.listFollowUps()).find((f) => f.note === 'Call about parking');
    expect(created).toMatchObject({ owner: { name: 'Priya Nair' }, sentAt: null, doneAt: null });
    expect(
      await rejection(
        api.createFollowUp({
          leadId: leadOf(store, 'Rahul Sharma').id,
          dueAt: NOW.toISOString(),
          note: 'x',
          autoReply: null,
        }),
      ),
    ).toBe('not_found');
    expect(
      await rejection(
        api.createFollowUp({ leadId: meeraLead.id, dueAt: 'tomorrow', note: 'x', autoReply: null }),
      ),
    ).toBe('invalid_body');

    await api.updateFollowUp(created?.id ?? '', {
      dueAt: '2026-11-27T06:00:00.000Z',
      note: 'Call about parking and loan',
      autoReply: created?.autoReply ?? null,
    });
    expect((await api.listFollowUps()).find((f) => f.id === created?.id)?.note).toBe(
      'Call about parking and loan',
    );

    // Run now (test): sent once into the chat, labelled as an auto-reply; the second run refuses.
    await api.runFollowUp(created?.id ?? '');
    const sent = lastMessage(store, meeraLead.conversationId ?? '');
    expect(sent).toMatchObject({
      body: 'Hi Meera, a quick reminder about your visit.',
      sender: { name: 'Priya Nair · auto-reply (test)' },
    });
    expect(await rejection(api.runFollowUp(created?.id ?? ''))).toBe('already_sent');
    const count = store.data.items.length;
    advance(TIMING.readMinMs + TIMING.readSpreadMs);
    expect(await rejection(api.runFollowUp(created?.id ?? ''))).toBe('already_sent');
    expect(store.data.items).toHaveLength(count);
    expect(store.data.audit.at(-1)).toMatchObject({
      action: 'followup.sent',
      target: 'Meera Joshi',
    });

    // One without an auto-reply cannot run; completing moves it to Done.
    const noReply = (await api.listFollowUps()).find((f) => f.autoReply === null);
    if (noReply) expect(await rejection(api.runFollowUp(noReply.id))).toBe('invalid_body');
    await api.completeFollowUp(created?.id ?? '');
    const done = (await api.listFollowUps()).find((f) => f.id === created?.id);
    expect(done && followUpTab(done, NOW)).toBe('done');

    // An Employee sees only her own follow-ups.
    const karans = store.data.followUps.find((f) => f.ownerId !== created?.owner.id);
    expect(await rejection(api.completeFollowUp(karans?.id ?? ''))).toBe('not_found');
  });
});

describe('demo criteria built in later phases', () => {
  it.todo('DEMO-26 campaign CSV validation, test-numbers-only, opt-outs, reasons');
  it.todo('DEMO-27 campaign progress with pause and resume, audited');
  it.todo('DEMO-28 opt-out list; STOP adds the number');
  it.todo('DEMO-29 users: add, role, deactivate with history kept; Manager limits');
  it.todo('DEMO-30 dashboard numbers, per-employee table, filters, CSV export');
  it.todo('DEMO-31 audit log is read-only, newest first, filterable');
  it.todo('DEMO-32 Employee home (manual)');
  it.todo('DEMO-33 manual browser walk-through of the final demo in three roles');
  it.todo('DEMO-34 static demo build runs with deep links (manual)');
});
