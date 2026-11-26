// DEMO-35: the charts above the Reports table (moved from the dashboard in phase 7, Decision 40).
// Every value comes from `getDashboardCharts`, which the demo api serves to staff only.
import { LEAD_STAGE_LABELS } from '@crm/shared';
import { Link } from 'react-router';
import { BarChart, Donut, Legend, StackedBar, STAGE_COLOR, type Part } from './charts.tsx';
import { useLive } from './context.tsx';
import { Icon } from './icons.tsx';
import type { DayCount, MonthCount } from './reports.ts';
import { ErrorNote, Skeleton } from './ui.tsx';

const shortDay = (day: string): string => String(Number(day.slice(8)));

const longDay = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

function sum<K extends string>(rows: Record<K, number>[] | undefined, key: K): number {
  return (rows ?? []).reduce((n, r) => n + r[key], 0);
}

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

function MonthCard({ label, month, tone }: { label: string; month: MonthCount; tone: string }) {
  return (
    <div className={`month-card pastel-${tone}`}>
      <span className="month-label">{label}</span>
      <span className="month-value">{month.thisMonth}</span>
      <span className="month-foot">
        <Change month={month} /> <span>vs last month ({month.lastMonth})</span>
      </span>
    </div>
  );
}

function CardHead({
  title,
  hint,
  to,
  label,
}: {
  title: string;
  hint: string;
  to?: string;
  label?: string;
}) {
  return (
    <header className="dash-card-head">
      <div>
        <h2>{title}</h2>
        <p className="muted small">{hint}</p>
      </div>
      {to && (
        <Link to={to} className="round-arrow" aria-label={label}>
          <Icon name="arrow" size={16} />
        </Link>
      )}
    </header>
  );
}

function ChatsChart({ days }: { days: DayCount[] }) {
  const total = days.reduce((n, d) => n + d.count, 0);
  const busiest = days.reduce<DayCount | undefined>(
    (best, d) => (best === undefined || d.count > best.count ? d : best),
    undefined,
  );
  return (
    <section className="dash-card chart-wide">
      <CardHead
        title="New chats per day"
        hint={`Last 14 days · ${total} in total`}
        to="/inbox"
        label="Open the inbox"
      />
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

export function ReportCharts() {
  const charts = useLive((a) => a.getDashboardCharts(), 'dashboard-charts');
  const c = charts.data;
  if (charts.error !== undefined) return <ErrorNote error={charts.error} />;
  if (!c) {
    return (
      <div className="report-charts">
        <section className="dash-card chart-wide">
          <Skeleton rows={4} />
        </section>
      </div>
    );
  }

  const stageParts: Part[] = c.leadsByStage.map((s) => ({
    label: LEAD_STAGE_LABELS[s.stage],
    value: s.count,
    color: STAGE_COLOR[s.stage],
  }));
  const followUpParts: Part[] = [
    { label: 'Overdue', value: c.followUps.overdue, color: 'var(--status-critical)' },
    { label: 'Due today', value: c.followUps.today, color: 'var(--status-warning)' },
    { label: 'Upcoming', value: c.followUps.upcoming, color: 'var(--series-1)' },
    { label: 'Done', value: c.followUps.done, color: 'var(--status-good)' },
  ];
  const workloadMax = Math.max(1, ...c.workload.map((w) => w.open + w.pending));
  const campaignMax = Math.max(
    1,
    ...c.campaigns.map((k) => k.sent + k.skipped + k.failed + k.pending),
  );

  return (
    <div className="report-charts" aria-label="Charts">
      <div className="month-cards">
        <MonthCard label="New leads this month" month={c.leadsCreated} tone="yellow" />
        <MonthCard label="Converted this month" month={c.converted} tone="mint" />
      </div>
      <ChatsChart days={c.chatsPerDay} />

      <section className="dash-card">
        <CardHead
          title="Leads by stage"
          hint="Every lead, open and closed"
          to="/leads"
          label="Open leads"
        />
        <div className="donut-row">
          <Donut
            parts={stageParts}
            total={stageParts.reduce((n, p) => n + p.value, 0)}
            unit="lead"
          />
          <Legend parts={stageParts} share />
        </div>
      </section>

      <section className="dash-card">
        <header className="dash-card-head">
          <div>
            <h2>Team workload</h2>
            <p className="muted small">Chats each Employee owns now</p>
          </div>
          <Legend
            parts={[
              { label: 'Open', value: sum(c.workload, 'open'), color: 'var(--series-1)' },
              { label: 'Pending', value: sum(c.workload, 'pending'), color: 'var(--series-2)' },
            ]}
          />
        </header>
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
      </section>

      <section className="dash-card">
        <CardHead
          title="Follow-ups"
          hint={`${followUpParts.reduce((n, p) => n + p.value, 0)} in total`}
          to="/follow-ups"
          label="Open follow-ups"
        />
        <StackedBar label="Follow-ups" parts={followUpParts} />
        <Legend parts={followUpParts} share />
      </section>

      <section className="dash-card">
        <CardHead
          title="Campaign delivery"
          hint="Test numbers only · simulated sends"
          to="/campaigns"
          label="Open campaigns"
        />
        {c.campaigns.length === 0 ? (
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
                { label: 'Pending', value: sum(c.campaigns, 'pending'), color: 'var(--series-1)' },
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
  );
}
