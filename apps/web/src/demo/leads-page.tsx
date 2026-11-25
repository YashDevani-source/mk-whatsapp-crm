// DEMO-23: leads as a table or a board by stage, and the lead detail page.
import {
  LEAD_STAGE_LABELS,
  LeadStage,
  PropertyType,
  type LeadNeeds,
  type LeadView,
} from '@crm/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { demoCan } from './access.ts';
import { stageText, stageTone } from './chat-view.ts';
import { useDemo, useLive, useUser } from './context.tsx';
import { FollowUpModal, FollowUpRows } from './followups-page.tsx';
import { formatAgo, formatDateTime, formatPhone, formatPrice } from './format.ts';
import { budgetValid, needsSummary } from './rules.ts';
import { useToast } from './toasts.tsx';
import { Chip, Empty, errorText, ErrorNote, PageHeader, Skeleton } from './ui.tsx';

const STAGES = LeadStage.options;

export function LeadsPage() {
  const id = useParams()['*'] || undefined;
  return id ? <LeadDetail key={id} id={id} /> : <LeadList />;
}

function budgetText(n: LeadNeeds): string {
  if (n.budgetMax === null && n.budgetMin === null) return '—';
  if (n.budgetMax === null) return `from ${formatPrice(n.budgetMin ?? 0)}`;
  return n.budgetMin === null
    ? `up to ${formatPrice(n.budgetMax)}`
    : `${formatPrice(n.budgetMin)} – ${formatPrice(n.budgetMax)}`;
}

function LeadList() {
  const { now } = useDemo();
  const user = useUser();
  const leads = useLive((a) => a.listLeads(), 'leads');
  const [view, setView] = useState<'table' | 'board'>('table');
  const [stage, setStage] = useState<LeadStage | ''>('');
  const [owner, setOwner] = useState('');
  const [type, setType] = useState<PropertyType | ''>('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const staff = demoCan(user.role, 'leads.assign');

  const all = leads.data ?? [];
  const owners = [
    ...new Map(all.flatMap((l) => (l.owner ? [[l.owner.id, l.owner.name]] : []))).entries(),
  ];
  const q = search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const shown = all.filter(
    (l) =>
      (stage === '' || l.stage === stage) &&
      (owner === '' || (owner === 'none' ? l.owner === null : l.owner?.id === owner)) &&
      (type === '' || l.needs.propertyType === type) &&
      (q === '' ||
        (l.contact.name ?? '').toLowerCase().includes(q) ||
        (digits !== '' && l.contact.phone.includes(digits)) ||
        (l.needs.location ?? '').toLowerCase().includes(q)),
  );

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={
          staff
            ? 'Every customer enquiry becomes a lead. At most one open lead per customer.'
            : 'The leads you own.'
        }
        actions={
          <div className="segmented small-seg" role="tablist" aria-label="View">
            <button
              type="button"
              className={view === 'table' ? 'active' : ''}
              onClick={() => setView('table')}
            >
              Table
            </button>
            <button
              type="button"
              className={view === 'board' ? 'active' : ''}
              onClick={() => setView('board')}
            >
              Board
            </button>
          </div>
        }
      />
      <div className="filters">
        <input
          type="search"
          placeholder="Search name, phone or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search leads"
        />
        {view === 'table' && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as LeadStage | '')}
            aria-label="Stage"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        {staff && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="">All owners</option>
            <option value="none">Unassigned</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType | '')}
          aria-label="Type"
        >
          <option value="">All types</option>
          {PropertyType.options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="muted small">{shown.length} leads</span>
      </div>

      {leads.loading && <Skeleton rows={8} />}
      {leads.error !== undefined && <ErrorNote error={leads.error} />}
      {!leads.loading && shown.length === 0 && (
        <Empty title="No leads match" hint="Clear a filter, or simulate a new enquiry." />
      )}

      {view === 'table' && shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Stage</th>
                <th>Owner</th>
                <th>Budget</th>
                <th>Location</th>
                <th>Type</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr
                  key={l.id}
                  className="clickable"
                  onClick={() => void navigate(`/leads/${l.id}`)}
                >
                  <td>
                    <Link to={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()}>
                      <strong>{l.contact.name ?? formatPhone(l.contact.phone)}</strong>
                    </Link>
                    <div className="muted small">{formatPhone(l.contact.phone)}</div>
                  </td>
                  <td>
                    <Chip tone={stageTone(l.stage)}>{LEAD_STAGE_LABELS[l.stage]}</Chip>
                  </td>
                  <td>{l.owner?.name ?? <span className="muted">Unassigned</span>}</td>
                  <td>{budgetText(l.needs)}</td>
                  <td>{l.needs.location ?? '—'}</td>
                  <td>
                    {l.needs.propertyType ?? '—'}
                    {l.needs.bhk !== null && ` · ${l.needs.bhk} BHK`}
                  </td>
                  <td className="muted">{formatAgo(l.updatedAt, now())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'board' && shown.length > 0 && (
        <div className="board">
          {STAGES.map((s) => {
            const column = shown.filter((l) => l.stage === s);
            return (
              <section key={s} className="board-col" aria-label={LEAD_STAGE_LABELS[s]}>
                <header>
                  <Chip tone={stageTone(s)}>{LEAD_STAGE_LABELS[s]}</Chip>
                  <span className="muted small">{column.length}</span>
                </header>
                {column.map((l) => (
                  <Link key={l.id} to={`/leads/${l.id}`} className="board-card">
                    <strong>{l.contact.name ?? formatPhone(l.contact.phone)}</strong>
                    <span className="muted small">{budgetText(l.needs)}</span>
                    <span className="muted small">{l.owner?.name ?? 'Unassigned'}</span>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

// Budget fields are typed in lakh (₹ L), the unit sales teams use.
const toLakh = (rupees: number | null): string => (rupees === null ? '' : String(rupees / 100_000));
const fromLakh = (text: string): number | null =>
  text.trim() === '' ? null : Math.round(Number(text) * 100_000);

function LeadDetail({ id }: { id: string }) {
  const { api } = useDemo();
  const user = useUser();
  const toast = useToast();
  const lead = useLive((a) => a.getLead(id), `lead:${id}`);
  const history = useLive((a) => a.listLeadHistory(id), `history:${id}`);
  const others = useLive((a) => a.listOtherLeads(id), `others:${id}`);
  const followUps = useLive((a) => a.listFollowUps(), 'followups');
  const staff = demoCan(user.role, 'leads.assign');
  const owners = useLive(
    (a) => (staff ? a.listAssignees() : Promise.resolve([])),
    `owners:${staff}`,
  );
  const [adding, setAdding] = useState(false);

  async function run(action: () => Promise<void>, done: string): Promise<void> {
    try {
      await action();
      toast({ tone: 'ok', title: done });
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  if (lead.error !== undefined) {
    return (
      <>
        <PageHeader title="Lead" />
        <Empty title="This lead is not available" hint="It may belong to someone else." />
        <p>
          <Link to="/leads">Back to leads</Link>
        </p>
      </>
    );
  }
  if (!lead.data) return <Skeleton rows={6} />;
  const l = lead.data;
  const mine = (followUps.data ?? []).filter((f) => f.leadId === id);

  return (
    <>
      <p className="crumbs">
        <Link to="/leads">Leads</Link> / {l.contact.name ?? formatPhone(l.contact.phone)}
      </p>
      <PageHeader
        title={l.contact.name ?? formatPhone(l.contact.phone)}
        subtitle={`${formatPhone(l.contact.phone)} · created ${formatDateTime(l.createdAt)} · source ${l.source}`}
        actions={
          l.conversationId && (
            <Link className="btn" to={`/inbox/${l.conversationId}`}>
              Open chat
            </Link>
          )
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            <div className="row-fields">
              <label className="field">
                Stage
                <select
                  value={l.stage}
                  onChange={(e) =>
                    void run(
                      () => api.updateLeadStage(id, e.target.value as LeadStage),
                      `Stage changed to ${LEAD_STAGE_LABELS[e.target.value as LeadStage]}`,
                    )
                  }
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Owner
                {staff ? (
                  <select
                    value={l.owner?.id ?? ''}
                    onChange={(e) =>
                      void run(() => api.assignLead(id, e.target.value || null), 'Owner changed')
                    }
                  >
                    <option value="">Unassigned</option>
                    {(owners.data ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="static-field">{l.owner?.name ?? 'Unassigned'}</span>
                )}
              </label>
              <div className="field">
                Status
                <span className="static-field">
                  {l.closedAt ? `Closed ${formatDateTime(l.closedAt)}` : 'Open'}
                </span>
              </div>
            </div>
            <p className="muted small">
              Stage names are placeholders until the LEAD spec names them (DEMO Decision 7).
            </p>
          </section>

          <NeedsForm
            key={l.updatedAt}
            lead={l}
            onSave={(needs) => run(() => api.updateLeadNeeds(id, needs), 'Needs saved')}
          />

          <section className="card">
            <div className="card-head">
              <h2>Follow-ups</h2>
              <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
                Add follow-up
              </button>
            </div>
            {mine.length === 0 ? (
              <p className="muted">No follow-ups for this lead yet.</p>
            ) : (
              <FollowUpRows rows={mine} showCustomer={false} />
            )}
          </section>
        </div>

        <aside className="detail-side">
          <section className="card">
            <h2>History</h2>
            <ol className="timeline">
              {[...(history.data ?? [])].reverse().map((h) => (
                <li key={h.id}>
                  <span>
                    {h.field === 'created' && 'Lead created'}
                    {h.field === 'stage' && `Stage ${stageText(h.from)} → ${stageText(h.to)}`}
                    {h.field === 'owner' &&
                      `Owner ${h.from ?? 'Unassigned'} → ${h.to ?? 'Unassigned'}`}
                    {h.field === 'needs' && `Needs: ${h.to ?? ''}`}
                  </span>
                  <span className="muted small">
                    {h.actor?.name ?? 'System'} · {formatDateTime(h.at)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {(others.data ?? []).length > 0 && (
            <section className="card">
              <h2>Other leads of this customer</h2>
              <ul className="plain-list">
                {(others.data ?? []).map((o: LeadView) => (
                  <li key={o.id}>
                    <Link to={`/leads/${o.id}`}>{LEAD_STAGE_LABELS[o.stage]}</Link>
                    <span className="muted small"> · created {formatDateTime(o.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      {adding && <FollowUpModal leadId={id} onClose={() => setAdding(false)} />}
    </>
  );
}

function NeedsForm({
  lead,
  onSave,
}: {
  lead: LeadView;
  onSave: (needs: LeadNeeds) => Promise<void>;
}) {
  const n = lead.needs;
  const [min, setMin] = useState(toLakh(n.budgetMin));
  const [max, setMax] = useState(toLakh(n.budgetMax));
  const [location, setLocation] = useState(n.location ?? '');
  const [type, setType] = useState<PropertyType | ''>(n.propertyType ?? '');
  const [bhk, setBhk] = useState(n.bhk === null ? '' : String(n.bhk));
  const [busy, setBusy] = useState(false);

  const needs: LeadNeeds = {
    budgetMin: fromLakh(min),
    budgetMax: fromLakh(max),
    location: location.trim() === '' ? null : location.trim(),
    propertyType: type === '' ? null : type,
    bhk: bhk === '' ? null : Number(bhk),
  };
  const numbersOk = [needs.budgetMin, needs.budgetMax].every(
    (v) => v === null || (Number.isFinite(v) && v >= 0),
  );
  const valid = numbersOk && budgetValid(needs);
  const changed = JSON.stringify(needs) !== JSON.stringify(n);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    await onSave(needs);
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <div className="card-head">
        <h2>Property needs</h2>
        <span className="muted small">{needsSummary(n)}</span>
      </div>
      <div className="row-fields">
        <label className="field">
          Budget from (₹ L)
          <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
        </label>
        <label className="field">
          Budget up to (₹ L)
          <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <label className="field">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="field">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as PropertyType | '')}>
            <option value="">Not known</option>
            {PropertyType.options.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          BHK
          <select value={bhk} onChange={(e) => setBhk(e.target.value)}>
            <option value="">Not known</option>
            {[1, 2, 3, 4, 5, 6].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!valid && (
        <p className="error-note">The budget “from” must be a number no higher than “up to”.</p>
      )}
      <div className="card-actions">
        <button type="submit" className="btn btn-primary" disabled={!valid || !changed || busy}>
          Save needs
        </button>
      </div>
    </form>
  );
}
