// DEMO-38, DEMO-39: the dashboard (Super Admin, Manager) and the Employee home, one layout after
// the user's reference image: a centre column with a greeting, three pastel number cards, recent
// conversations, a leads overview and recent lead activity; a right panel with the user's profile
// and the follow-up agenda. Every value comes from the role-scoped lists (Decision 41).
import { LEAD_STAGE_LABELS, type FollowUpView, type LeadView } from '@crm/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { STAGE_COLOR } from './charts.tsx';
import { stageTone } from './chat-view.ts';
import { useLive, useNow, useUser } from './context.tsx';
import { countOf, formatAgo, formatClock, formatPhone } from './format.ts';
import { Icon, type IconName } from './icons.tsx';
import {
  agendaFor,
  daysWithFollowUps,
  interestOf,
  leadsOverview,
  overviewCards,
  recentConversations,
  recentLeadActivity,
  weekDays,
  type AgendaStatus,
} from './overview.ts';
import { dayKey } from './reports.ts';
import { Avatar, Chip, ErrorNote, ROLE_LABELS, Skeleton, Tag, type Tone } from './ui.tsx';

const nameOf = (c: { name: string | null; phone: string }): string =>
  c.name ?? formatPhone(c.phone);

function MetricCard({
  label,
  value,
  note,
  to,
  icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  note: string;
  to: string;
  icon: IconName;
  tone: 'yellow' | 'blue' | 'lavender';
}) {
  return (
    <Link to={to} className={`metric-card pastel-${tone}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value ?? '…'}</span>
      <span className="metric-note">{value === undefined ? ' ' : note}</span>
      <span className="metric-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
    </Link>
  );
}

function SectionHead({
  title,
  to,
  action = 'View all',
}: {
  title: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {to && (
        <Link to={to} className="pill-link">
          {action}
        </Link>
      )}
    </div>
  );
}

const CHAT_STATUS: Readonly<Record<string, string>> = {
  open: 'Open',
  pending: 'Pending',
  closed: 'Closed',
};

const AGENDA_TONE: Readonly<Record<AgendaStatus, Tone>> = {
  overdue: 'error',
  due: 'warn',
  done: 'ok',
};

const AGENDA_LABEL: Readonly<Record<AgendaStatus, string>> = {
  overdue: 'Overdue',
  due: 'Due',
  done: 'Done',
};

function Agenda({
  followUps,
  leads,
  now,
}: {
  followUps: FollowUpView[];
  leads: LeadView[];
  now: Date;
}) {
  const today = dayKey(now);
  const [day, setDay] = useState(today);
  const days = weekDays(now);
  const busy = daysWithFollowUps(followUps);
  const items = agendaFor(followUps, day, now);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const dayName = (key: string): string =>
    new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2);
  const longDay = (key: string): string =>
    new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  return (
    <>
      <div className="week-strip" role="group" aria-label="Pick a day of this week">
        {days.map((key) => (
          <button
            key={key}
            type="button"
            className={`week-day${key === day ? ' active' : ''}${key === today ? ' today' : ''}`}
            aria-pressed={key === day}
            aria-label={`${longDay(key)}${busy.has(key) ? ', has follow-ups' : ''}`}
            onClick={() => setDay(key)}
          >
            <span>{dayName(key)}</span>
            <strong>{Number(key.slice(8))}</strong>
            <span className={busy.has(key) ? 'week-dot' : 'week-dot is-free'} aria-hidden="true" />
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="agenda-empty muted">
          Nothing due {day === today ? 'today' : `on ${longDay(day)}`}.
        </p>
      ) : (
        <ul className="agenda">
          {items.map(({ followUp: f, status }) => {
            const lead = leadById.get(f.leadId);
            const interest = lead ? interestOf(lead.needs) : '';
            return (
              <li key={f.id} className={`agenda-card agenda-${status}`}>
                <span className="agenda-icon" aria-hidden="true">
                  <Icon name="users" size={16} />
                </span>
                <span className="agenda-text">
                  <Link to={`/leads/${f.leadId}`} className="agenda-name">
                    {nameOf(f.contact)}
                  </Link>
                  <span className="agenda-time">
                    {status === 'overdue' && dayKey(new Date(f.dueAt)) !== day
                      ? formatClock(f.dueAt, now)
                      : new Date(f.dueAt).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                    {' · '}
                    <Chip tone={AGENDA_TONE[status]}>{AGENDA_LABEL[status]}</Chip>
                  </span>
                  <span className="agenda-context">
                    {f.note}
                    {interest && <> · {interest}</>}
                  </span>
                </span>
                <span className="agenda-owner" title={`Owner: ${f.owner.name}`}>
                  <Avatar name={f.owner.name} size="sm" />
                  <span className="visually-hidden">Owner: {f.owner.name}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ProfilePanel({
  followUps,
  leads,
  now,
}: {
  followUps?: FollowUpView[];
  leads?: LeadView[];
  now: Date;
}) {
  const user = useUser();
  const wa = useLive((a) => a.getWa(), 'wa');
  const connected = wa.data?.state.state === 'connected';
  return (
    <aside className="overview-side" aria-label="Your profile and follow-up agenda">
      <div className="profile">
        <span className="profile-avatar" aria-hidden="true">
          <Avatar name={user.name} />
          <span className={connected ? 'presence on' : 'presence'} />
        </span>
        <strong className="profile-name">{user.name}</strong>
        <span className="muted">{ROLE_LABELS[user.role]} · Skyline Realty</span>
        {wa.data && (
          <span className={`presence-pill ${connected ? 'ok' : 'warn'}`}>
            <span className="presence-check" aria-hidden="true">
              {connected ? '✓' : '!'}
            </span>
            {connected ? 'WhatsApp connected' : 'WhatsApp not connected'}
            <Tag>Simulated</Tag>
          </span>
        )}
      </div>
      <div className="side-section">
        <SectionHead title="Follow-up agenda" to="/follow-ups" />
        {followUps && leads ? (
          <Agenda followUps={followUps} leads={leads} now={now} />
        ) : (
          <Skeleton rows={3} />
        )}
      </div>
      <Link to="/follow-ups" className="side-button">
        All follow-ups
      </Link>
    </aside>
  );
}

function Overview() {
  const user = useUser();
  const now = useNow(30_000);
  const staff = user.role !== 'EMPLOYEE';
  const chats = useLive((a) => a.listConversations(), 'conversations');
  const leads = useLive((a) => a.listLeads(), 'leads');
  const followUps = useLive((a) => a.listFollowUps(), 'followups');
  const cards =
    chats.data && leads.data && followUps.data
      ? overviewCards(chats.data, leads.data, followUps.data, now)
      : undefined;
  const unread = (chats.data ?? []).filter((c) => c.unreadCount > 0).length;
  const dueToday = (followUps.data ?? []).filter(
    (f) => f.doneAt === null && new Date(f.dueAt).toDateString() === now.toDateString(),
  ).length;
  const recent = recentConversations(chats.data ?? []);
  const overview = leadsOverview(leads.data ?? []);
  const stageMax = Math.max(1, ...overview.byStage.map((s) => s.count));
  const activity = recentLeadActivity(leads.data ?? []);
  const shownOwners = overview.owners.slice(0, 4);
  const error = chats.error ?? leads.error ?? followUps.error;

  return (
    <div className="overview">
      <div className="overview-main">
        <header className="overview-hello">
          <div>
            <h1>Welcome back, {user.name.split(' ')[0]}!</h1>
            <p className="muted">
              {!cards
                ? 'Loading today’s enquiries, leads and follow-ups…'
                : staff
                  ? `${countOf(cards.unassignedChats, 'chat needs', 'chats need')} an owner and ${countOf(cards.overdueFollowUps, 'follow-up is', 'follow-ups are')} overdue.`
                  : `${countOf(unread, 'chat waits', 'chats wait')} for you and ${countOf(cards.overdueFollowUps + dueToday, 'follow-up is', 'follow-ups are')} due today or overdue.`}
            </p>
          </div>
          <div className="overview-tools">
            <Tag>Simulated data</Tag>
            <span className="date-pill">
              {now.toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
        </header>

        {error !== undefined && <ErrorNote error={error} />}

        <div className="metric-row">
          <MetricCard
            label="New leads"
            value={cards?.newLeads}
            note={`of ${countOf(cards?.totalLeads ?? 0, 'lead')}${staff ? ' in total' : ' you own'}`}
            to="/leads"
            icon="leads"
            tone="yellow"
          />
          <MetricCard
            label="Open chats"
            value={cards?.openChats}
            note={
              staff
                ? `${cards?.unassignedChats ?? 0} without an owner`
                : `${unread} with unread messages`
            }
            to="/inbox"
            icon="inbox"
            tone="blue"
          />
          <MetricCard
            label="Pending follow-ups"
            value={cards?.pendingFollowUps}
            note={`${cards?.overdueFollowUps ?? 0} overdue · ${dueToday} due today`}
            to="/follow-ups"
            icon="followUps"
            tone="lavender"
          />
        </div>

        <div className="overview-pair">
          <section className="ov-section" aria-labelledby="recent-chats">
            <div className="section-head">
              <h2 id="recent-chats">Recent conversations</h2>
              <Link to="/inbox" className="pill-link">
                View all
              </Link>
            </div>
            {chats.loading ? (
              <Skeleton rows={3} />
            ) : recent.length === 0 ? (
              <p className="card muted">No conversations yet.</p>
            ) : (
              <ul className="convo-list">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link to={`/inbox/${c.id}`} className="convo-row">
                      <Avatar name={c.contact.name ?? '#'} />
                      <span className="convo-text">
                        <span className="convo-top">
                          <strong>{nameOf(c.contact)}</strong>
                          {c.lastMessageAt && (
                            <time dateTime={c.lastMessageAt}>
                              {formatClock(c.lastMessageAt, now)}
                            </time>
                          )}
                        </span>
                        <span className="convo-bottom">
                          <span className={c.unreadCount > 0 ? 'preview unread' : 'preview'}>
                            {c.lastMessage?.body ?? 'No messages yet'}
                          </span>
                          {c.unreadCount > 0 ? (
                            <span className="unread-badge" aria-label={`${c.unreadCount} unread`}>
                              {c.unreadCount}
                            </span>
                          ) : (
                            <span className={`convo-status status-${c.status}`}>
                              {CHAT_STATUS[c.status]}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ov-section" aria-labelledby="leads-overview">
            <div className="section-head">
              <h2 id="leads-overview">{staff ? 'Leads overview' : 'My leads'}</h2>
            </div>
            <div className="card leads-card">
              <div className="leads-card-top">
                <span className="big-number">{leads.data ? overview.total : '…'}</span>
                <Link to="/leads" className="pill-link">
                  View all
                </Link>
              </div>
              <p className="leads-card-line">
                <span className="count-bubble">{overview.open}</span> open ·{' '}
                {overview.total - overview.open} converted or lost
              </p>
              <ul className="stage-bars" aria-label="Leads per stage">
                {overview.byStage.map((s) => (
                  <li key={s.stage}>
                    <span className="stage-name">{LEAD_STAGE_LABELS[s.stage]}</span>
                    <span className="stage-track" aria-hidden="true">
                      <span
                        className="stage-fill"
                        style={{
                          width: `${(s.count / stageMax) * 100}%`,
                          background: STAGE_COLOR[s.stage],
                        }}
                      />
                    </span>
                    <span className="stage-count">{s.count}</span>
                  </li>
                ))}
              </ul>
              <div className="owner-row">
                <span className="avatar-stack" aria-hidden="true">
                  {shownOwners.map((o) => (
                    <Avatar key={o.id} name={o.name} />
                  ))}
                  {overview.owners.length > shownOwners.length && (
                    <span className="avatar avatar-md more">
                      +{overview.owners.length - shownOwners.length}
                    </span>
                  )}
                </span>
                <span className="muted small">
                  {overview.owners.length === 0
                    ? 'No owners yet'
                    : staff
                      ? `${countOf(overview.owners.length, 'owner')}${overview.unowned > 0 ? ` · ${overview.unowned} unassigned` : ''}`
                      : 'All yours'}
                </span>
              </div>
            </div>
          </section>
        </div>

        <section className="ov-section" aria-labelledby="lead-activity">
          <SectionHead title="Recent lead activity" to="/leads" />
          {leads.loading ? (
            <Skeleton rows={4} />
          ) : activity.length === 0 ? (
            <p className="card muted">No leads yet.</p>
          ) : (
            <div className="table-wrap activity-table">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Property interest</th>
                    <th>Assigned to</th>
                    <th>Last activity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((l) => {
                    const interest = interestOf(l.needs);
                    return (
                      <tr key={l.id}>
                        <td>
                          <Link to={`/leads/${l.id}`} className="who">
                            <Avatar name={l.contact.name ?? '#'} size="sm" />
                            <strong>{nameOf(l.contact)}</strong>
                          </Link>
                        </td>
                        <td className="nowrap muted">{formatPhone(l.contact.phone)}</td>
                        <td className="interest" title={interest || undefined}>
                          {interest || <span className="muted">Not known</span>}
                        </td>
                        <td>{l.owner?.name ?? <span className="muted">Unassigned</span>}</td>
                        <td className="nowrap muted">{formatAgo(l.updatedAt, now)}</td>
                        <td>
                          <Chip tone={stageTone(l.stage)}>
                            <span className="dot" style={{ background: STAGE_COLOR[l.stage] }} />
                            {LEAD_STAGE_LABELS[l.stage]}
                          </Chip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ProfilePanel followUps={followUps.data} leads={leads.data} now={now} />
    </div>
  );
}

export function DashboardPage() {
  return <Overview />;
}

// DEMO-32, DEMO-39: the Employee home is the same layout on their own work.
export function HomePage() {
  return <Overview />;
}
