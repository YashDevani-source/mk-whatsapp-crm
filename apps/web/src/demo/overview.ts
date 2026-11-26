// DEMO-38, DEMO-39: what the dashboard and the Employee home show, derived from the lists the
// demo api already scopes per role (Decision 41). Pure functions; nothing here is invented.
import {
  CLOSED_LEAD_STAGES,
  LeadStage,
  type FollowUpView,
  type InboxConversation,
  type LeadNeeds,
  type LeadView,
} from '@crm/shared';
import { dayKey } from './reports.ts';
import { followUpTab } from './rules.ts';

export interface OverviewCards {
  newLeads: number;
  totalLeads: number;
  openChats: number;
  unassignedChats: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
}

// The same definitions as the Reports numbers (`dashboardNumbers`, DEMO-30).
export function overviewCards(
  chats: InboxConversation[],
  leads: LeadView[],
  followUps: FollowUpView[],
  now: Date,
): OverviewCards {
  return {
    newLeads: leads.filter((l) => l.stage === 'new').length,
    totalLeads: leads.length,
    openChats: chats.filter((c) => c.status === 'open').length,
    unassignedChats: chats.filter((c) => c.status !== 'closed' && c.assignee === null).length,
    pendingFollowUps: followUps.filter((f) => f.doneAt === null).length,
    overdueFollowUps: followUps.filter((f) => followUpTab(f, now) === 'overdue').length,
  };
}

// The chats with the latest message, newest first.
export function recentConversations(chats: InboxConversation[], n = 5): InboxConversation[] {
  return [...chats]
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
    .slice(0, n);
}

export interface LeadOwner {
  id: string;
  name: string;
  count: number;
}

export interface LeadsOverview {
  total: number;
  open: number;
  byStage: { stage: LeadStage; count: number }[];
  // Most leads first, then by name.
  owners: LeadOwner[];
  unowned: number;
}

export function leadsOverview(leads: LeadView[]): LeadsOverview {
  const owners = new Map<string, LeadOwner>();
  let unowned = 0;
  for (const lead of leads) {
    if (!lead.owner) {
      unowned += 1;
      continue;
    }
    const row = owners.get(lead.owner.id) ?? { id: lead.owner.id, name: lead.owner.name, count: 0 };
    row.count += 1;
    owners.set(row.id, row);
  }
  return {
    total: leads.length,
    open: leads.filter((l) => !CLOSED_LEAD_STAGES.includes(l.stage)).length,
    byStage: LeadStage.options.map((stage) => ({
      stage,
      count: leads.filter((l) => l.stage === stage).length,
    })),
    owners: [...owners.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unowned,
  };
}

// The most recently updated leads, newest first.
export function recentLeadActivity(leads: LeadView[], n = 6): LeadView[] {
  return [...leads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, n);
}

// Monday to Sunday of the week `now` is in, as local day keys (Decision 43).
export function weekDays(now: Date): string[] {
  const offset = (now.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset + i)),
  );
}

export type AgendaStatus = 'overdue' | 'due' | 'done';

export interface AgendaItem {
  followUp: FollowUpView;
  status: AgendaStatus;
}

function statusOf(f: FollowUpView, now: Date): AgendaStatus {
  const tab = followUpTab(f, now);
  return tab === 'done' ? 'done' : tab === 'overdue' ? 'overdue' : 'due';
}

// The follow-ups due on `day`; on today, every overdue one comes first (oldest first).
export function agendaFor(followUps: FollowUpView[], day: string, now: Date): AgendaItem[] {
  const byTime = (a: FollowUpView, b: FollowUpView): number => a.dueAt.localeCompare(b.dueAt);
  const overdue =
    day === dayKey(now)
      ? followUps.filter((f) => followUpTab(f, now) === 'overdue').sort(byTime)
      : [];
  const listed = new Set(overdue.map((f) => f.id));
  const onDay = followUps
    .filter((f) => !listed.has(f.id) && dayKey(new Date(f.dueAt)) === day)
    .sort(byTime);
  return [
    ...overdue.map((f) => ({ followUp: f, status: 'overdue' as const })),
    ...onDay.map((f) => ({ followUp: f, status: statusOf(f, now) })),
  ];
}

// Days with at least one follow-up still to do, for the dots under the week strip.
export function daysWithFollowUps(followUps: FollowUpView[]): Set<string> {
  return new Set(followUps.filter((f) => f.doneAt === null).map((f) => dayKey(new Date(f.dueAt))));
}

const TYPE_LABEL: Readonly<Record<NonNullable<LeadNeeds['propertyType']>, string>> = {
  apartment: 'Apartment',
  villa: 'Villa',
  plot: 'Plot',
};

// The short property interest of a lead, e.g. "2 BHK apartment · Whitefield"; '' when unknown.
export function interestOf(n: LeadNeeds): string {
  const type = n.propertyType ? TYPE_LABEL[n.propertyType] : null;
  const kind =
    n.bhk !== null ? `${n.bhk} BHK${type ? ` ${type.toLowerCase()}` : ''}` : (type ?? null);
  return [kind, n.location].filter((p): p is string => p !== null && p !== '').join(' · ');
}
