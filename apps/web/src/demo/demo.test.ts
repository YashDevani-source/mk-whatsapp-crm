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
import { DemoBus } from './bus.ts';
import { buildSeed, DEMO_PASSWORD, isTestNumber } from './seed.ts';
import { DemoData, DemoStore, memoryStorage, STORAGE_KEY, type KeyValueStorage } from './store.ts';

const NOW = new Date('2026-11-26T10:00:00.000Z');

interface Harness {
  api: DemoApi;
  store: DemoStore;
  storage: KeyValueStorage;
}

function harness(storage: KeyValueStorage = memoryStorage()): Harness {
  const store = new DemoStore(storage, () => buildSeed(NOW));
  const api = createDemoApi({
    store,
    bus: new DemoBus(),
    session: memorySession(),
    now: () => NOW,
    delay: () => Promise.resolve(),
  });
  return { api, store, storage };
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

describe('demo criteria built in later phases', () => {
  it.todo('DEMO-11 simulated QR: random DEMO string, 20 s refresh, reconnect_required after 3');
  it.todo('DEMO-12 simulate scan connects, log out needs a confirm, both audited and pushed');
  it.todo('DEMO-13 drop connection disables sends with wa_not_connected, then recovers');
  it.todo('DEMO-14 inbox three columns with list filters (manual)');
  it.todo('DEMO-15 opening a chat clears unread; an inbound message raises it live');
  it.todo('DEMO-16 replies move queued, sent, delivered, read forward only; failing contact fails');
  it.todo('DEMO-17 the composer enforces 1 to 4096 characters');
  it.todo('DEMO-18 internal notes are stored, yellow, never ticked, never delivered');
  it.todo('DEMO-19 assign and status changes are live, audited, and refused to Employees');
  it.todo('DEMO-20 the reply lock refuses other senders, expires, and can be taken over');
  it.todo('DEMO-21 sent-from-phone, unsupported, day separators and new-messages divider (manual)');
  it.todo('DEMO-22 simulated customer messages create conversations and New leads');
  it.todo('DEMO-23 lead changes add history and audit rows; one open lead per customer');
  it.todo('DEMO-24 share a property into a chat; upload type and size rules');
  it.todo('DEMO-25 follow-up tabs; Run now (test) sends once');
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
