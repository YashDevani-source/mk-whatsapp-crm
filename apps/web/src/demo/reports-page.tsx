// DEMO-30, DEMO-31, DEMO-35: the per-employee report with its charts (moved from the dashboard
// in phase 7, Decision 40) and CSV export, and the read-only audit log. The Employee home is
// dashboard-page.tsx (DEMO-39).
import { AuditAction, LEAD_STAGE_LABELS, LeadStage, type AuditEntry } from '@crm/shared';
import { useState } from 'react';
import { useLive } from './context.tsx';
import { countOf, formatDateTime } from './format.ts';
import { ReportCharts } from './report-charts.tsx';
import { employeeReportCsv, filterAudit, type ReportFilter } from './reports.ts';
import { Chip, Empty, ErrorNote, PageHeader, Skeleton, StatStrip, Tag } from './ui.tsx';

function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// Date inputs give a local day; the bounds cover that whole day.
const dayStart = (day: string): string | null =>
  day ? new Date(`${day}T00:00:00`).toISOString() : null;
const dayEnd = (day: string): string | null =>
  day ? new Date(`${day}T23:59:59.999`).toISOString() : null;

export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employee, setEmployee] = useState('');
  const filter: ReportFilter = {
    from: dayStart(from),
    to: dayEnd(to),
    employeeId: employee || null,
  };
  const report = useLive((a) => a.getReport(filter), `report:${from}:${to}:${employee}`);
  const everyone = useLive(
    (a) => a.getReport({ from: null, to: null, employeeId: null }),
    'report-all',
  );
  const rows = report.data ?? [];
  const sumRows = (key: 'chatsAssigned' | 'repliesSent' | 'openLeads' | 'followUpsDone'): number =>
    rows.reduce((n, r) => n + r[key], 0);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={
          report.data
            ? `${countOf(sumRows('repliesSent'), 'reply', 'replies')} and ${countOf(sumRows('followUpsDone'), 'follow-up')} done in this range. The range applies to replies, follow-ups and lead activity.`
            : 'Per-employee performance.'
        }
        actions={
          <button
            type="button"
            className="btn"
            disabled={rows.length === 0}
            onClick={() =>
              downloadText(
                `employee-report${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`,
                employeeReportCsv(rows),
              )
            }
          >
            Export CSV
          </button>
        }
      />
      <ReportCharts />
      <div className="section-head report-head">
        <h2>Per-employee report</h2>
      </div>
      {report.data && (
        <StatStrip
          label="Totals for the rows shown"
          stats={[
            {
              key: 'chats',
              label: 'Chats assigned',
              value: sumRows('chatsAssigned'),
              hint: 'Open and pending now',
              tone: 'neutral',
            },
            {
              key: 'replies',
              label: 'Replies sent',
              value: sumRows('repliesSent'),
              hint: 'In the date range',
              tone: 'neutral',
            },
            {
              key: 'leads',
              label: 'Open leads',
              value: sumRows('openLeads'),
              hint: 'Owned now',
              tone: 'neutral',
            },
            {
              key: 'followups',
              label: 'Follow-ups done',
              value: sumRows('followUpsDone'),
              hint: 'In the date range',
              tone: 'neutral',
            },
          ]}
        />
      )}
      <div className="filters">
        <label className="inline-field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          aria-label="Employee"
        >
          <option value="">All employees</option>
          {(everyone.data ?? []).map((r) => (
            <option key={r.employeeId} value={r.employeeId}>
              {r.employee}
            </option>
          ))}
        </select>
        {(from || to || employee) && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setFrom('');
              setTo('');
              setEmployee('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {report.loading && <Skeleton rows={5} />}
      {report.error !== undefined && <ErrorNote error={report.error} />}
      {!report.loading && rows.length === 0 && <Empty title="No activity in this range" />}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="numbers">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Chats assigned</th>
                <th>Replies sent</th>
                <th>Open leads</th>
                {LeadStage.options.map((s) => (
                  <th key={s}>{LEAD_STAGE_LABELS[s]}</th>
                ))}
                <th>Follow-ups done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>
                    <strong>{r.employee}</strong> {!r.active && <Chip>Deactivated</Chip>}
                  </td>
                  <td>{r.chatsAssigned}</td>
                  <td>{r.repliesSent}</td>
                  <td>{r.openLeads}</td>
                  {LeadStage.options.map((s) => (
                    <td key={s}>{r.byStage[s]}</td>
                  ))}
                  <td>{r.followUpsDone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        The export holds exactly the rows shown. Stage names are placeholders (DEMO Decision 7).
      </p>
    </>
  );
}

export const ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  'auth.login': 'Logged in',
  'auth.logout': 'Logged out',
  'wa.connected': 'WhatsApp connected',
  'wa.disconnected': 'WhatsApp disconnected',
  'wa.logout': 'WhatsApp logged out',
  'conversation.assigned': 'Chat assigned',
  'conversation.status': 'Chat status changed',
  'lead.created': 'Lead created',
  'lead.stage': 'Lead stage changed',
  'lead.owner': 'Lead owner changed',
  'lead.needs': 'Lead needs changed',
  'property.shared': 'Property shared',
  'followup.sent': 'Follow-up auto-reply sent',
  'campaign.created': 'Campaign created',
  'campaign.started': 'Campaign started',
  'campaign.paused': 'Campaign paused',
  'campaign.resumed': 'Campaign resumed',
  'campaign.completed': 'Campaign completed',
  'optout.added': 'Opt-out added',
  'optout.removed': 'Opt-out removed',
  'user.created': 'User added',
  'user.role': 'User role changed',
  'user.deactivated': 'User deactivated',
};

export function AuditPage() {
  const audit = useLive((a) => a.listAudit(), 'audit');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const entries: AuditEntry[] = audit.data ?? [];
  const actors = [
    ...new Map(entries.flatMap((e) => (e.actor ? [[e.actor.id, e.actor.name]] : []))).entries(),
  ];
  const shown = filterAudit(entries, {
    actorId: actor || null,
    action: action || null,
    from: dayStart(from),
    to: dayEnd(to),
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={
          <>
            {audit.data
              ? `${countOf(entries.filter((e) => new Date(e.at).toDateString() === new Date().toDateString()).length, 'entry', 'entries')} today. Every login, assignment, stage change, campaign action and WhatsApp change.`
              : 'Every login, assignment, stage change, campaign action and WhatsApp change.'}{' '}
            <Tag>Read-only</Tag>
          </>
        }
      />
      {audit.data && (
        <StatStrip
          label="Audit totals"
          stats={[
            {
              key: 'shown',
              label: 'Entries shown',
              value: shown.length,
              hint: `of ${entries.length} in the log`,
              tone: 'neutral',
            },
            {
              key: 'today',
              label: 'Today',
              value: entries.filter(
                (e) => new Date(e.at).toDateString() === new Date().toDateString(),
              ).length,
              hint: 'Since midnight',
              tone: 'neutral',
            },
            {
              key: 'logins',
              label: 'Logins',
              value: entries.filter((e) => e.action === 'auth.login').length,
              hint: 'All time',
              tone: 'neutral',
            },
            {
              key: 'stages',
              label: 'Stage changes',
              value: entries.filter((e) => e.action === 'lead.stage').length,
              hint: 'All time',
              tone: 'neutral',
            },
          ]}
        />
      )}
      <div className="filters">
        <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Who">
          <option value="">Everyone</option>
          <option value="system">System</option>
          {actors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | '')}
          aria-label="Action"
        >
          <option value="">All actions</option>
          {AuditAction.options.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <label className="inline-field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inline-field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <span className="muted small">{shown.length} entries</span>
      </div>
      {audit.loading && <Skeleton rows={8} />}
      {audit.error !== undefined && <ErrorNote error={audit.error} />}
      {!audit.loading && shown.length === 0 && <Empty title="No entries match" />}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>On</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="muted nowrap">{formatDateTime(e.at)}</td>
                  <td>{e.actor?.name ?? <span className="muted">System</span>}</td>
                  <td>{ACTION_LABELS[e.action]}</td>
                  <td>{e.target ?? ''}</td>
                  <td className="muted">{e.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
