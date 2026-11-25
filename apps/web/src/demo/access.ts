// DEMO-08 to DEMO-10: what each role may do and open in demo mode. The demo api checks
// `demoCan` on every call (DEMO Decision 6); the sidebar and page guard only mirror it.
import type { Role } from '@crm/shared';

export type DemoAction =
  | 'inbox.read'
  | 'messages.send'
  | 'inbox.assign'
  | 'leads.read'
  | 'leads.edit'
  | 'leads.assign'
  | 'properties.read'
  | 'properties.manage'
  | 'followups.manage'
  | 'campaigns.manage'
  | 'users.manage'
  | 'reports.read'
  | 'audit.read'
  | 'wa.read'
  | 'wa.manage';

const ALL: readonly Role[] = ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'];
const STAFF: readonly Role[] = ['SUPER_ADMIN', 'MANAGER'];

export const DEMO_ACCESS: Readonly<Record<DemoAction, readonly Role[]>> = {
  'inbox.read': ALL,
  'messages.send': ALL,
  'inbox.assign': STAFF,
  'leads.read': ALL,
  'leads.edit': ALL,
  'leads.assign': STAFF,
  'properties.read': ALL,
  'properties.manage': STAFF,
  'followups.manage': ALL,
  'campaigns.manage': STAFF,
  'users.manage': STAFF,
  'reports.read': STAFF,
  'audit.read': STAFF,
  'wa.read': ALL,
  'wa.manage': ['SUPER_ADMIN'],
};

export function demoCan(role: Role, action: DemoAction): boolean {
  return DEMO_ACCESS[action].includes(role);
}

// Employees see and act on only the chats, leads and follow-ups assigned to them (DEMO-10).
export function scopedToSelf(role: Role): boolean {
  return role === 'EMPLOYEE';
}

export type PageKey =
  | 'dashboard'
  | 'home'
  | 'inbox'
  | 'leads'
  | 'properties'
  | 'followUps'
  | 'campaigns'
  | 'users'
  | 'reports'
  | 'audit'
  | 'whatsapp';

export interface PageInfo {
  label: string;
  path: string;
  roles: readonly Role[];
}

export const PAGES: Readonly<Record<PageKey, PageInfo>> = {
  dashboard: { label: 'Dashboard', path: '/dashboard', roles: DEMO_ACCESS['reports.read'] },
  home: { label: 'Home', path: '/home', roles: ['EMPLOYEE'] },
  inbox: { label: 'Inbox', path: '/inbox', roles: DEMO_ACCESS['inbox.read'] },
  leads: { label: 'Leads', path: '/leads', roles: DEMO_ACCESS['leads.read'] },
  properties: { label: 'Properties', path: '/properties', roles: DEMO_ACCESS['properties.read'] },
  followUps: { label: 'Follow-ups', path: '/follow-ups', roles: DEMO_ACCESS['followups.manage'] },
  campaigns: { label: 'Campaigns', path: '/campaigns', roles: DEMO_ACCESS['campaigns.manage'] },
  users: { label: 'Users', path: '/users', roles: DEMO_ACCESS['users.manage'] },
  reports: { label: 'Reports', path: '/reports', roles: DEMO_ACCESS['reports.read'] },
  audit: { label: 'Audit log', path: '/audit', roles: DEMO_ACCESS['audit.read'] },
  whatsapp: { label: 'WhatsApp', path: '/whatsapp', roles: DEMO_ACCESS['wa.manage'] },
};

// Sidebar order (DEMO-08).
const NAV_ORDER: readonly PageKey[] = [
  'dashboard',
  'home',
  'inbox',
  'leads',
  'properties',
  'followUps',
  'campaigns',
  'users',
  'reports',
  'audit',
  'whatsapp',
];

export function canOpen(role: Role, page: PageKey): boolean {
  return PAGES[page].roles.includes(role);
}

export function navFor(role: Role): PageKey[] {
  return NAV_ORDER.filter((page) => canOpen(role, page));
}

export function landingPath(role: Role): string {
  const first = navFor(role)[0];
  return first ? PAGES[first].path : '/inbox';
}

// The page a path belongs to, e.g. `/leads/123` → `leads`.
export function pageForPath(pathname: string): PageKey | undefined {
  const top = `/${pathname.split('/')[1] ?? ''}`;
  return NAV_ORDER.find((page) => PAGES[page].path === top);
}
