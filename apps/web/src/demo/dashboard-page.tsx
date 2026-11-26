// DEMO-30, DEMO-35: the Super Admin and Manager dashboard. Number cards, charts and two action
// tiles, all drawn from the demo data (Decision 36). Reports stay tables (reports-page.tsx).
import { LEAD_STAGE_LABELS, type LeadStage } from '@crm/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BarChart, Donut, Legend, Sparkline, StackedBar, type Part } from './charts.tsx';
import { useDemo, useLive, useUser } from './context.tsx';
import { countOf, formatPhone } from './format.ts';
import { Icon } from './icons.tsx';
import type { DayCount, MonthCount } from './reports.ts';
import { followUpTab } from './rules.ts';
import { Chip, ErrorNote, Skeleton, Tag } from './ui.tsx';

// Stage colours: the validated dark categorical order (Decision 37); converted and lost
// happen to land on green and red.
export const STAGE_COLOR: Readonly<Record<LeadStage, string>> = {
  new: 'var(--series-1)',
  contacted: 'var(--series-2)',
  qualified: 'var(--series-3)',
  site_visit: 'var(--series-4)',
  negotiation: 'var(--series-5)',
  converted: 'var(--series-6)',
  lost: 'var(--series-7)',
};

const shortDay = (day: string): string => String(Number(day.slice(8)));

const longDay = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

// "+2 vs last month" as a chip; the change is a count, never a percentage (Decision 36).
function Change({ month }: { month: MonthCount }) {
  const diff = month.thisMonth - month.lastMonth;
  const tone = diff > 0 ? 'ok' : diff < 0 ? 'error' : 'neutral';
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
  return (
    <span
      className={`chip chip-${tone}`}
      title={`${month.thisMonth} this month, ${month.lastMonth} last month`}
    >
      <span aria-hidden="true">{arrow}</span> {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

function KpiCard({
  label,
  value,
  to,
  highlight,
  children,
}: {
  label: string;
  value: number | undefined;
  to: string;
  highlight?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link to={to} className={highlight ? 'kpi kpi-highlight' : 'kpi'}>
      <span className="kpi-head">
        <span>{label}</span>
        <span className="round-arrow" aria-hidden="true">
          <Icon name="arrow" size={16} />
        </span>
      </span>
      <span className="kpi-value">{value ?? '…'}</span>
      <span className="kpi-foot">{children}</span>
    </Link>
  );
}

function ChatsChart({ days }: { days: DayCount[] }) {
  const total = days.reduce((n, d) => n + d.count, 0);
  const busiest = days.reduce<DayCount | undefined>(
    (best, d) => (best === undefined || d.count > best.count ? d : best),
    undefined,
  );
  return (
    <section className="dash-card span-7">
      <header className="dash-card-head">
        <div>
          <h2>New chats per day</h2>
          <p className="muted small">Last 14 days · {total} in total</p>
        </div>
        <Link to="/inbox" className="round-arrow" aria-label="Open the inbox">
          <Icon name="arrow" size={16} />
        </Link>
      </header>
      <BarChart
        label={`New chats per day for the last 14 days, ${total} in total${
          busiest && busiest.count > 0 ? `, most on ${longDay(busiest.day)} (${busiest.count})` : ''
        }`}
        unit="chat"
        bars={days.map((d) => ({
          key: d.day,
          label: shortDay(d.day),
          title: longDay(d.day),
          value: d.count,
        }))}
      />
    </section>
  );
}

export function DashboardPage() {
  const { now } = useDemo();
  const user = useUser();
  const dash = useLive((a) => a.getDashboard(), 'dashboard');
  const charts = useLive((a) => a.getDashboardCharts(), 'dashboard-charts');
  const followUps = useLive((a) => a.listFollowUps(), 'followups');
  const c = charts.data;
  const today = now();
  // The next follow-ups to act on: overdue first, then today's, oldest first.
  const nextDue = (followUps.data ?? [])
    .map((f) => ({ f, tab: followUpTab(f, today) }))
    .filter((x) => x.tab === 'overdue' || x.tab === 'today')
    .sort((a, b) => a.f.dueAt.localeCompare(b.f.dueAt))
    .slice(0, 4);

  const stageParts: Part[] = (c?.leadsByStage ?? []).map((s) => ({
    label: LEAD_STAGE_LABELS[s.stage],
    value: s.count,
    color: STAGE_COLOR[s.stage],
  }));
  const leadTotal = stageParts.reduce((n, p) => n + p.value, 0);
  const followUpParts: Part[] = c
    ? [
        { label: 'Overdue', value: c.followUps.overdue, color: 'var(--status-critical)' },
        { label: 'Due today', value: c.followUps.today, color: 'var(--status-warning)' },
        { label: 'Upcoming', value: c.followUps.upcoming, color: 'var(--series-1)' },
        { label: 'Done', value: c.followUps.done, color: 'var(--status-good)' },
      ]
    : [];
  const workloadMax = Math.max(1, ...(c?.workload ?? []).map((w) => w.open + w.pending));
  const campaignMax = Math.max(
    1,
    ...(c?.campaigns ?? []).map((k) => k.sent + k.skipped + k.failed + k.pending),
  );

  return (
    <div className="dashboard">
      <header className="dash-hello">
        <div>
          <h1>Hello, {user.name.split(' ')[0]}</h1>
          <p className="muted">
            {dash.data
              ? `${countOf(dash.data.unassignedChats, 'chat has', 'chats have')} no owner and ${countOf(dash.data.overdueFollowUps, 'follow-up is', 'follow-ups are')} overdue.`
              : 'Loading today’s numbers…'}
          </p>
        </div>
        <div className="dash-hello-side">
          <Tag>Simulated data</Tag>
          <span className="date-pill">
            {today.toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      </header>

      {dash.error !== undefined && <ErrorNote error={dash.error} />}
      {charts.error !== undefined && <ErrorNote error={charts.error} />}

      <div className="dash-grid">
        <div className="kpi-grid span-5">
          <KpiCard label="Open chats" value={dash.data?.openChats} to="/inbox" highlight>
            {c && (
              <>
                <Sparkline
                  values={c.chatsPerDay.slice(-7).map((d) => d.count)}
                  label={`New chats in the last 7 days: ${c.chatsPerDay
                    .slice(-7)
                    .map((d) => d.count)
                    .join(', ')}`}
                />
                <span>Last 7 days</span>
              </>
            )}
          </KpiCard>
          <KpiCard label="Unassigned chats" value={dash.data?.unassignedChats} to="/inbox">
            {c && <span>{c.waitingForReply} wait for a reply</span>}
          </KpiCard>
          <KpiCard label="New leads" value={dash.data?.newLeads} to="/leads">
            {c && (
              <>
                <Change month={c.leadsCreated} />
                <span>created vs last month</span>
              </>
            )}
          </KpiCard>
          <KpiCard label="Converted this month" value={dash.data?.convertedThisMonth} to="/leads">
            {c && (
              <>
                <Change month={c.converted} />
                <span>vs last month</span>
              </>
            )}
          </KpiCard>
        </div>

        {c ? (
          <ChatsChart days={c.chatsPerDay} />
        ) : (
          <section className="dash-card span-7">
            <Skeleton rows={4} />
          </section>
        )}

        <Link to="/inbox" className="action-tile tile-warn span-3">
          <span className="tile-band">Unassigned</span>
          <span className="tile-body">
            <span className="tile-number">{dash.data?.unassignedChats ?? '…'}</span>
            <span>
              chats without an owner
              {c && (
                <>
                  , <strong>{c.waitingForReply} waiting</strong> for a reply
                </>
              )}
              .
            </span>
          </span>
          <span className="tile-action">
            Assign chats <Icon name="arrow" size={16} />
          </span>
        </Link>
        <Link to="/follow-ups" className="action-tile tile-error span-3">
          <span className="tile-band">Overdue</span>
          <span className="tile-body">
            <span className="tile-number">{dash.data?.overdueFollowUps ?? '…'}</span>
            <span>
              follow-ups past their time
              {c && (
                <>
                  , <strong>{c.followUps.today} more</strong> due today
                </>
              )}
              .
            </span>
          </span>
          <span className="tile-action">
            Open follow-ups <Icon name="arrow" size={16} />
          </span>
        </Link>

        <section className="dash-card span-6">
          <header className="dash-card-head">
            <div>
              <h2>Leads by stage</h2>
              <p className="muted small">Every lead, open and closed</p>
            </div>
            <Link to="/leads" className="round-arrow" aria-label="Open leads">
              <Icon name="arrow" size={16} />
            </Link>
          </header>
          {c ? (
            <div className="donut-row">
              <Donut parts={stageParts} total={leadTotal} unit="lead" />
              <Legend parts={stageParts} share />
            </div>
          ) : (
            <Skeleton rows={3} />
          )}
        </section>

        <section className="dash-card span-6">
          <header className="dash-card-head">
            <div>
              <h2>Team workload</h2>
              <p className="muted small">Chats each Employee owns now</p>
            </div>
            <Legend
              parts={[
                { label: 'Open', value: sum(c?.workload, 'open'), color: 'var(--series-1)' },
                { label: 'Pending', value: sum(c?.workload, 'pending'), color: 'var(--series-2)' },
              ]}
            />
          </header>
          {c ? (
            <ul className="bar-rows">
              {c.workload.map((w) => (
                <li key={w.employeeId}>
                  <span className="bar-row-name">{w.employee}</span>
                  <StackedBar
                    label={w.employee}
                    max={workloadMax}
                    parts={[
                      { label: 'Open', value: w.open, color: 'var(--series-1)' },
                      { label: 'Pending', value: w.pending, color: 'var(--series-2)' },
                    ]}
                  />
                  <span className="bar-row-value">
                    {w.open} open · {w.pending} pending
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton rows={4} />
          )}
        </section>

        <section className="dash-card span-6">
          <header className="dash-card-head">
            <div>
              <h2>Follow-ups</h2>
              <p className="muted small">
                {c ? `${followUpParts.reduce((n, p) => n + p.value, 0)} in total` : ' '}
              </p>
            </div>
            <Link to="/follow-ups" className="round-arrow" aria-label="Open follow-ups">
              <Icon name="arrow" size={16} />
            </Link>
          </header>
          {c ? (
            <>
              <StackedBar label="Follow-ups" parts={followUpParts} />
              <Legend parts={followUpParts} share />
              {nextDue.length > 0 && (
                <>
                  <h3 className="muted small">Act on next</h3>
                  <ul className="due-list">
                    {nextDue.map(({ f, tab }) => (
                      <li key={f.id}>
                        <Chip tone={tab === 'overdue' ? 'error' : 'warn'}>
                          {tab === 'overdue' ? 'Overdue' : 'Today'}
                        </Chip>
                        <Link to={`/leads/${f.leadId}`} className="due-text">
                          {f.contact.name ?? formatPhone(f.contact.phone)}
                        </Link>
                        <span className="muted small">{f.owner.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <Skeleton rows={2} />
          )}
        </section>

        <section className="dash-card span-12">
          <header className="dash-card-head">
            <div>
              <h2>Campaign delivery</h2>
              <p className="muted small">Test numbers only · simulated sends</p>
            </div>
            <Link to="/campaigns" className="round-arrow" aria-label="Open campaigns">
              <Icon name="arrow" size={16} />
            </Link>
          </header>
          {c === undefined ? (
            <Skeleton rows={2} />
          ) : c.campaigns.length === 0 ? (
            <p className="muted">No campaigns yet.</p>
          ) : (
            <>
              <ul className="bar-rows campaign-rows">
                {c.campaigns.map((k) => (
                  <li key={k.id}>
                    <Link to={`/campaigns/${k.id}`} className="bar-row-name">
                      {k.name}
                    </Link>
                    <StackedBar
                      label={k.name}
                      max={campaignMax}
                      parts={[
                        { label: 'Sent', value: k.sent, color: 'var(--status-good)' },
                        { label: 'Pending', value: k.pending, color: 'var(--series-1)' },
                        { label: 'Failed', value: k.failed, color: 'var(--status-critical)' },
                        { label: 'Skipped', value: k.skipped, color: 'var(--status-idle)' },
                      ]}
                    />
                    <span className="bar-row-value">
                      {k.sent} sent · {k.failed} failed · {k.skipped} skipped
                      {k.pending > 0 && ` · ${k.pending} pending`}
                    </span>
                  </li>
                ))}
              </ul>
              <Legend
                parts={[
                  { label: 'Sent', value: sum(c.campaigns, 'sent'), color: 'var(--status-good)' },
                  {
                    label: 'Pending',
                    value: sum(c.campaigns, 'pending'),
                    color: 'var(--series-1)',
                  },
                  {
                    label: 'Failed',
                    value: sum(c.campaigns, 'failed'),
                    color: 'var(--status-critical)',
                  },
                  {
                    label: 'Skipped',
                    value: sum(c.campaigns, 'skipped'),
                    color: 'var(--status-idle)',
                  },
                ]}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function sum<K extends string>(rows: Record<K, number>[] | undefined, key: K): number {
  return (rows ?? []).reduce((n, r) => n + r[key], 0);
}
