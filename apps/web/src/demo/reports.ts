// Pure report rules (DEMO-30, DEMO-31, DEMO-35): dashboard numbers and chart data, the
// per-employee table, CSV export and the audit filter. Reports are tables; the dashboard has
// charts (Decision 36).
import {
  CLOSED_LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LeadStage,
  type AuditAction,
  type AuditEntry,
} from '@crm/shared';
import { campaignCounts } from './campaigns.ts';
import { followUpTab, type FollowUpTab } from './rules.ts';
import type { DemoData } from './store.ts';

export interface Dashboard {
  openChats: number;
  unassignedChats: number;
  newLeads: number;
  overdueFollowUps: number;
  convertedThisMonth: number;
}

export function dashboardNumbers(data: DemoData, now: Date): Dashboard {
  const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const t = now.toISOString();
  return {
    openChats: data.conversations.filter((c) => c.status === 'open').length,
    unassignedChats: data.conversations.filter(
      (c) => c.status !== 'closed' && c.assigneeId === null,
    ).length,
    newLeads: data.leads.filter((l) => l.stage === 'new').length,
    overdueFollowUps: data.followUps.filter((f) => f.doneAt === null && f.dueAt < t).length,
    convertedThisMonth: data.leads.filter(
      (l) => l.stage === 'converted' && l.closedAt !== null && l.closedAt >= month,
    ).length,
  };
}

// ── Dashboard charts (DEMO-35). Every number comes from the demo data; nothing is invented. ──

export interface DayCount {
  // Local calendar day, YYYY-MM-DD.
  day: string;
  count: number;
}

export interface MonthCount {
  thisMonth: number;
  lastMonth: number;
}

export interface WorkloadRow {
  employeeId: string;
  employee: string;
  open: number;
  pending: number;
}

export interface CampaignDelivery {
  id: string;
  name: string;
  sent: number;
  skipped: number;
  failed: number;
  pending: number;
}

export interface DashboardCharts {
  chatsPerDay: DayCount[];
  leadsCreated: MonthCount;
  converted: MonthCount;
  leadsByStage: { stage: LeadStage; count: number }[];
  workload: WorkloadRow[];
  followUps: Record<FollowUpTab, number>;
  campaigns: CampaignDelivery[];
  // Unassigned chats, not closed, where the customer wrote last.
  waitingForReply: number;
}

export function dayKey(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// New chats per local day, oldest first, today last.
export function chatsPerDay(data: DemoData, now: Date, days: number): DayCount[] {
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push({
      day: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)),
      count: 0,
    });
  }
  const index = new Map(out.map((d, i) => [d.day, i]));
  for (const c of data.conversations) {
    const i = index.get(dayKey(new Date(c.createdAt)));
    if (i !== undefined && out[i]) out[i].count += 1;
  }
  return out;
}

// This calendar month against the last one, as counts (Decision 36).
export function monthChange(
  data: DemoData,
  now: Date,
): { leadsCreated: MonthCount; converted: MonthCount } {
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const month = (at: string | null): 'this' | 'last' | null =>
    at === null ? null : at >= thisStart ? 'this' : at >= lastStart ? 'last' : null;
  const count = (ats: (string | null)[]): MonthCount => ({
    thisMonth: ats.filter((a) => month(a) === 'this').length,
    lastMonth: ats.filter((a) => month(a) === 'last').length,
  });
  return {
    leadsCreated: count(data.leads.map((l) => l.createdAt)),
    converted: count(data.leads.filter((l) => l.stage === 'converted').map((l) => l.closedAt)),
  };
}

export function leadsByStage(data: DemoData): { stage: LeadStage; count: number }[] {
  return LeadStage.options.map((stage) => ({
    stage,
    count: data.leads.filter((l) => l.stage === stage).length,
  }));
}

export function dashboardCharts(data: DemoData, now: Date): DashboardCharts {
  const followUps: Record<FollowUpTab, number> = { overdue: 0, today: 0, upcoming: 0, done: 0 };
  for (const f of data.followUps) followUps[followUpTab(f, now)] += 1;

  const lastDirection = new Map<string, { at: string; inbound: boolean }>();
  for (const i of data.items) {
    if (i.kind !== 'message') continue;
    const m = i.message;
    const seen = lastDirection.get(m.conversationId);
    if (!seen || m.at > seen.at) {
      lastDirection.set(m.conversationId, { at: m.at, inbound: m.direction === 'inbound' });
    }
  }

  return {
    chatsPerDay: chatsPerDay(data, now, 14),
    ...monthChange(data, now),
    leadsByStage: leadsByStage(data),
    workload: data.users
      .filter((u) => u.role === 'EMPLOYEE' && u.active)
      .map((u) => ({
        employeeId: u.id,
        employee: u.name,
        open: data.conversations.filter((c) => c.assigneeId === u.id && c.status === 'open').length,
        pending: data.conversations.filter((c) => c.assigneeId === u.id && c.status === 'pending')
          .length,
      })),
    followUps,
    campaigns: data.campaigns.map((c) => {
      const n = campaignCounts(c.recipients);
      return {
        id: c.id,
        name: c.name,
        sent: n.sent,
        skipped: n.skipped,
        failed: n.failed,
        pending: n.pending,
      };
    }),
    waitingForReply: data.conversations.filter(
      (c) =>
        c.assigneeId === null && c.status !== 'closed' && lastDirection.get(c.id)?.inbound === true,
    ).length,
  };
}

export interface ReportFilter {
  // Inclusive ISO bounds; null means open-ended.
  from: string | null;
  to: string | null;
  employeeId: string | null;
}

export interface EmployeeRow {
  employeeId: string;
  employee: string;
  active: boolean;
  chatsAssigned: number;
  repliesSent: number;
  openLeads: number;
  byStage: Record<LeadStage, number>;
  followUpsDone: number;
}

const inRange = (at: string | null, f: ReportFilter): boolean =>
  at !== null && (f.from === null || at >= f.from) && (f.to === null || at <= f.to);

// One row per Employee (active, or deactivated with activity in the range).
export function employeeReport(data: DemoData, filter: ReportFilter): EmployeeRow[] {
  return data.users
    .filter(
      (u) => u.role === 'EMPLOYEE' && (filter.employeeId === null || u.id === filter.employeeId),
    )
    .map((u) => {
      const leads = data.leads.filter((l) => l.ownerId === u.id);
      const byStage = Object.fromEntries(LeadStage.options.map((s) => [s, 0])) as Record<
        LeadStage,
        number
      >;
      for (const l of leads) if (inRange(l.updatedAt, filter)) byStage[l.stage] += 1;
      const repliesSent = data.items.filter(
        (i) =>
          i.kind === 'message' &&
          i.message.direction === 'outbound' &&
          i.message.sender?.id === u.id &&
          inRange(i.message.at, filter),
      ).length;
      return {
        employeeId: u.id,
        employee: u.name,
        active: u.active,
        chatsAssigned: data.conversations.filter(
          (c) => c.assigneeId === u.id && c.status !== 'closed',
        ).length,
        repliesSent,
        openLeads: leads.filter((l) => !CLOSED_LEAD_STAGES.includes(l.stage)).length,
        byStage,
        followUpsDone: data.followUps.filter((f) => f.ownerId === u.id && inRange(f.doneAt, filter))
          .length,
      };
    })
    .filter((row) => row.active || row.repliesSent > 0 || row.followUpsDone > 0);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Exactly the rows the table shows (DEMO-30).
export function employeeReportCsv(rows: EmployeeRow[]): string {
  return toCsv(
    [
      'Employee',
      'Chats assigned',
      'Replies sent',
      'Open leads',
      ...LeadStage.options.map((s) => LEAD_STAGE_LABELS[s]),
      'Follow-ups done',
    ],
    rows.map((r) => [
      r.active ? r.employee : `${r.employee} (deactivated)`,
      r.chatsAssigned,
      r.repliesSent,
      r.openLeads,
      ...LeadStage.options.map((s) => r.byStage[s]),
      r.followUpsDone,
    ]),
  );
}

export interface AuditFilter {
  actorId: string | null;
  action: AuditAction | null;
  from: string | null;
  to: string | null;
}

// DEMO-31: newest first, filtered by actor, action and date.
export function filterAudit(entries: AuditEntry[], f: AuditFilter): AuditEntry[] {
  return entries
    .filter(
      (e) =>
        (f.actorId === null ||
          (f.actorId === 'system' ? e.actor === null : e.actor?.id === f.actorId)) &&
        (f.action === null || e.action === f.action) &&
        (f.from === null || e.at >= f.from) &&
        (f.to === null || e.at <= f.to),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}
