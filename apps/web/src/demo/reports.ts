// Pure report rules (DEMO-30, DEMO-31): dashboard numbers, the per-employee table, CSV export
// and the audit filter. Tables, not charts.
import {
  CLOSED_LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LeadStage,
  type AuditAction,
  type AuditEntry,
} from '@crm/shared';
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
