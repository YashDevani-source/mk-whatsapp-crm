// DEMO-30 to DEMO-32: the dashboard, the per-employee report with CSV export, the read-only
// audit log, and the Employee home. Tables, not charts.
import { AuditAction, LEAD_STAGE_LABELS, LeadStage, type AuditEntry } from '@crm/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { stageTone } from './chat-view.ts';
import { useDemo, useLive, useNow, useUser } from './context.tsx';
import { formatAgo, formatDateTime, formatPhone } from './format.ts';
import { employeeReportCsv, filterAudit, type ReportFilter } from './reports.ts';
import { followUpTab } from './rules.ts';
import { Chip, Empty, ErrorNote, PageHeader, Skeleton, Tag } from './ui.tsx';

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

export function DashboardPage() {
  const { now } = useDemo();
  const dash = useLive((a) => a.getDashboard(), 'dashboard');
  const chats = useLive((a) => a.listConversations(), 'conversations');
  const followUps = useLive((a) => a.listFollowUps(), 'followups');
  const unassigned = (chats.data ?? [])
    .filter((c) => c.assignee === null && c.status !== 'closed')
    .slice(0, 6);
  const overdue = (followUps.data ?? [])
    .filter((f) => followUpTab(f, now()) === 'overdue')
    .slice(0, 6);

  const cards: [string, number | undefined, string, string][] = [
    ['Open chats', dash.data?.openChats, '/inbox', 'info'],
    ['Unassigned chats', dash.data?.unassignedChats, '/inbox', 'warn'],
    ['New leads', dash.data?.newLeads, '/leads', 'info'],
    ['Overdue follow-ups', dash.data?.overdueFollowUps, '/follow-ups', 'error'],
    ['Converted this month', dash.data?.convertedThisMonth, '/leads', 'ok'],
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What needs attention now. Full numbers are under Reports."
      />
      {dash.error !== undefined && <ErrorNote error={dash.error} />}
      <div className="number-cards">
        {cards.map(([label, value, to, tone]) => (
          <Link key={label} to={to} className={`number-card number-${tone}`}>
            <span className="number">{value ?? '…'}</span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Unassigned chats</h2>
          {unassigned.length === 0 ? (
            <p className="muted">Every open chat has an owner.</p>
          ) : (
            <ul className="plain-list">
              {unassigned.map((c) => (
                <li key={c.id} className="list-row">
                  <Link to={`/inbox/${c.id}`}>
                    {c.contact.name ?? formatPhone(c.contact.phone)}
                  </Link>
                  <span className="muted small">
                    {c.lastMessageAt ? formatAgo(c.lastMessageAt, now()) : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Overdue follow-ups</h2>
          {overdue.length === 0 ? (
            <p className="muted">Nothing overdue.</p>
          ) : (
            <ul className="plain-list">
              {overdue.map((f) => (
                <li key={f.id} className="list-row">
                  <Link to={`/leads/${f.leadId}`}>
                    {f.contact.name ?? formatPhone(f.contact.phone)}
                  </Link>
                  <span className="muted small">
                    {f.note} · {f.owner.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

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

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Per-employee performance. The date range applies to replies, follow-ups done and lead activity."
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

const ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
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
            Every login, assignment, stage change, campaign action and WhatsApp change.{' '}
            <Tag>Read-only</Tag>
          </>
        }
      />
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

// DEMO-32: an Employee's own unread chats, today's and overdue follow-ups, and leads by stage.
export function HomePage() {
  const user = useUser();
  const now = useNow(30_000);
  const chats = useLive((a) => a.listConversations(), 'conversations');
  const followUps = useLive((a) => a.listFollowUps(), 'followups');
  const leads = useLive((a) => a.listLeads(), 'leads');
  const unread = (chats.data ?? []).filter((c) => c.unreadCount > 0);
  const due = (followUps.data ?? []).filter((f) =>
    ['overdue', 'today'].includes(followUpTab(f, now)),
  );

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user.name.split(' ')[0]}`}
        subtitle="Your chats, follow-ups and leads."
      />
      <div className="three-col">
        <section className="card">
          <h2>Unread chats</h2>
          {chats.loading && <Skeleton rows={3} />}
          {!chats.loading && unread.length === 0 && <p className="muted">You are all caught up.</p>}
          <ul className="plain-list">
            {unread.map((c) => (
              <li key={c.id} className="list-row">
                <Link to={`/inbox/${c.id}`}>{c.contact.name ?? formatPhone(c.contact.phone)}</Link>
                <span className="unread-badge">{c.unreadCount}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Follow-ups today and overdue</h2>
          {followUps.loading && <Skeleton rows={3} />}
          {!followUps.loading && due.length === 0 && <p className="muted">Nothing due today.</p>}
          <ul className="plain-list">
            {due.map((f) => (
              <li key={f.id} className="list-row">
                <span>
                  <Link to={`/leads/${f.leadId}`}>
                    {f.contact.name ?? formatPhone(f.contact.phone)}
                  </Link>
                  <span className="muted small"> · {f.note}</span>
                </span>
                {followUpTab(f, now) === 'overdue' ? (
                  <Chip tone="error">Overdue</Chip>
                ) : (
                  <Chip tone="info">{formatDateTime(f.dueAt)}</Chip>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>My leads by stage</h2>
          <ul className="plain-list">
            {LeadStage.options.map((s) => {
              const count = (leads.data ?? []).filter((l) => l.stage === s).length;
              return (
                <li key={s} className="list-row">
                  <Chip tone={stageTone(s)}>{LEAD_STAGE_LABELS[s]}</Chip>
                  <strong>{count}</strong>
                </li>
              );
            })}
          </ul>
          <Link to="/leads">Open my leads</Link>
        </section>
      </div>
    </>
  );
}
