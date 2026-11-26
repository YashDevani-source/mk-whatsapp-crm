// DEMO-26 to DEMO-28: campaigns (list, 5-step wizard, live progress) and the opt-out list.
// Safe by default: test numbers only, opt-outs always skipped, preview and confirm, slow sending.
import type { CampaignRecipient, CampaignStatus, CampaignView } from '@crm/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  campaignCounts,
  checkRecipients,
  MAX_CAMPAIGN_MESSAGE,
  readCampaignCsv,
  REASON_TEXT,
  renderMessage,
  SAMPLE_CSV,
  type CsvRow,
} from './campaigns.ts';
import { useDemo, useLive } from './context.tsx';
import { countOf, formatDateTime, formatPhone } from './format.ts';
import { useToast } from './toasts.tsx';
import {
  Chip,
  Empty,
  ErrorNote,
  errorText,
  PageHeader,
  Skeleton,
  StatStrip,
  Tag,
  type Tone,
} from './ui.tsx';

const STATUS_TONE: Record<CampaignStatus, Tone> = {
  draft: 'neutral',
  running: 'info',
  paused: 'warn',
  completed: 'ok',
};

const RECIPIENT_TONE: Record<CampaignRecipient['status'], Tone> = {
  pending: 'neutral',
  sent: 'ok',
  skipped: 'warn',
  failed: 'error',
};

export function CampaignsPage() {
  const sub = useParams()['*'] || '';
  if (sub === 'new') return <CampaignWizard />;
  if (sub === 'opt-outs') return <OptOutsPage />;
  if (sub !== '') return <CampaignDetail key={sub} id={sub} />;
  return <CampaignList />;
}

const total = (list: CampaignView[], status: 'sent' | 'skipped' | 'failed'): number =>
  list.reduce((n, c) => n + c.recipients.filter((r) => r.status === status).length, 0);

function CampaignList() {
  const campaigns = useLive((a) => a.listCampaigns(), 'campaigns');
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={
          <>
            {campaigns.data
              ? `${countOf(total(campaigns.data, 'sent'), 'message')} sent so far, one every 2 seconds, to opted-in test numbers only. `
              : 'Messages to opted-in test numbers, sent slowly. '}
            <Tag>Simulated</Tag>
          </>
        }
        actions={
          <>
            <Link className="btn" to="/campaigns/opt-outs">
              Opt-out list
            </Link>
            <Link className="btn btn-primary" to="/campaigns/new">
              New campaign
            </Link>
          </>
        }
      />
      {campaigns.data && (
        <StatStrip
          label="Campaign totals"
          stats={[
            {
              key: 'all',
              label: 'Campaigns',
              value: campaigns.data.length,
              hint: `${campaigns.data.filter((c) => c.status === 'running' || c.status === 'paused').length} running or paused`,
              tone: 'neutral',
            },
            {
              key: 'sent',
              label: 'Messages sent',
              value: total(campaigns.data, 'sent'),
              hint: 'Simulated sends',
              tone: 'green',
            },
            {
              key: 'skipped',
              label: 'Skipped',
              value: total(campaigns.data, 'skipped'),
              hint: 'Each with a reason',
              tone: 'yellow',
            },
            {
              key: 'failed',
              label: 'Failed',
              value: total(campaigns.data, 'failed'),
              hint: 'Not delivered',
              tone: 'red',
            },
          ]}
        />
      )}
      {campaigns.loading && <Skeleton rows={3} />}
      {campaigns.error !== undefined && <ErrorNote error={campaigns.error} />}
      {campaigns.data?.length === 0 && (
        <Empty title="No campaigns yet" hint="Start one with “New campaign”." />
      )}
      {(campaigns.data ?? []).length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Skipped</th>
                <th>Failed</th>
                <th>Created by</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {(campaigns.data ?? []).map((c) => {
                const n = campaignCounts(c.recipients);
                return (
                  <tr
                    key={c.id}
                    className="clickable"
                    onClick={() => void navigate(`/campaigns/${c.id}`)}
                  >
                    <td>
                      <Link to={`/campaigns/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        <strong>{c.name}</strong>
                      </Link>{' '}
                      {c.testOnly && <Tag>Test numbers only</Tag>}
                    </td>
                    <td>
                      <Chip tone={STATUS_TONE[c.status]}>{c.status}</Chip>
                    </td>
                    <td>
                      {n.sent} / {n.total}
                    </td>
                    <td>{n.skipped}</td>
                    <td>{n.failed}</td>
                    <td>{c.createdBy.name}</td>
                    <td className="muted">{c.startedAt ? formatDateTime(c.startedAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const STEPS = ['Upload CSV', 'Segment', 'Message', 'Preview & confirm', 'Progress'] as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="steps">
      {STEPS.map((label, i) => (
        <li key={label} className={i === current ? 'active' : i < current ? 'done' : ''}>
          <span className="step-n">{i < current ? '✓' : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function CampaignWizard() {
  const { api } = useDemo();
  const toast = useToast();
  const navigate = useNavigate();
  const optOuts = useLive((a) => a.listOptOuts(), 'optouts');
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string>();
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [csvError, setCsvError] = useState<string>();
  const [testOnly, setTestOnly] = useState(true);
  const [segColumn, setSegColumn] = useState('');
  const [segValue, setSegValue] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('Hi {name}, Skyline Realty here. ');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function load(text: string, label: string): void {
    const result = readCampaignCsv(text);
    setFileName(label);
    if (!result.ok) {
      setCsvError(result.error);
      setRows([]);
      return;
    }
    setCsvError(undefined);
    setRows(result.rows);
    setColumns(result.columns);
    setSegColumn('');
    setSegValue('');
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) load(await file.text(), file.name);
  }

  const values = segColumn
    ? [...new Set(rows.map((r) => r.fields[segColumn] ?? ''))].filter(Boolean).sort()
    : [];
  const segment =
    segColumn && segValue ? rows.filter((r) => r.fields[segColumn] === segValue) : rows;
  const optedOut = new Set((optOuts.data ?? []).map((o) => o.phone));
  const checked = checkRecipients(segment, { testOnly, optedOut });
  const counts = campaignCounts(checked);
  const firstName = checked.find((r) => r.status === 'pending')?.name ?? null;
  const messageOk = message.trim().length > 0 && message.trim().length <= MAX_CAMPAIGN_MESSAGE;

  async function start(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const id = await api.createCampaign({ name, message, testOnly, rows: segment });
      toast({ tone: 'ok', title: 'Campaign started', body: 'One message about every 2 seconds.' });
      void navigate(`/campaigns/${id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

  return (
    <>
      <p className="crumbs">
        <Link to="/campaigns">Campaigns</Link> / New
      </p>
      <PageHeader title="New campaign" subtitle={<Tag>Simulated: nothing reaches WhatsApp</Tag>} />
      <Steps current={step} />

      {step === 0 && (
        <section className="card wizard-card">
          <h2>Upload a CSV</h2>
          <p className="muted">
            One contact per row with a <code>phone</code> column; <code>name</code> and any other
            columns (for the Segment step) are optional. At most 1,000 rows.
          </p>
          <div className="card-actions">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e)}
              aria-label="CSV file"
            />
            <button
              type="button"
              className="btn"
              onClick={() => load(SAMPLE_CSV, 'sample-contacts.csv')}
            >
              Use the sample file
            </button>
            <a className="btn-link" href={sampleHref} download="sample-contacts.csv">
              Download the sample
            </a>
          </div>
          <label className="toggle safety">
            <input
              type="checkbox"
              checked={testOnly}
              onChange={(e) => setTestOnly(e.target.checked)}
            />
            <strong>Test numbers only</strong> (+1 202 555 0100 to 0199). On by default.
          </label>
          {!testOnly && (
            <p className="error-note">
              Off: only for contacts who agreed to receive messages. This demo still sends nothing.
            </p>
          )}
          {csvError && <p className="error-note">{csvError}</p>}
          {rows.length > 0 && (
            <p>
              <strong>{fileName}</strong>: {rows.length} rows
              {columns.length > 0 && <>, columns {columns.join(', ')}</>}.
            </p>
          )}
          <div className="wizard-nav">
            <span />
            <button
              type="button"
              className="btn btn-primary"
              disabled={rows.length === 0}
              onClick={() => setStep(1)}
            >
              Next: Segment
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card wizard-card">
          <h2>Choose who gets it</h2>
          <div className="row-fields">
            <label className="field">
              Column
              <select
                value={segColumn}
                onChange={(e) => {
                  setSegColumn(e.target.value);
                  setSegValue('');
                }}
              >
                <option value="">Everyone in the file</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {segColumn && (
              <label className="field">
                Value
                <select value={segValue} onChange={(e) => setSegValue(e.target.value)}>
                  <option value="">Any</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p>
            <strong>{segment.length}</strong> of {rows.length} rows in this segment.
          </p>
          <div className="wizard-nav">
            <button type="button" className="btn" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={segment.length === 0}
              onClick={() => setStep(2)}
            >
              Next: Message
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card wizard-card">
          <h2>Write the message</h2>
          <div className="form">
            <label>
              Campaign name
              <input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Site-visit weekend"
              />
            </label>
            <label>
              Message <span className="muted small">({'{name}'} becomes the contact's name)</span>
              <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <span
              className={message.trim().length > MAX_CAMPAIGN_MESSAGE ? 'counter over' : 'counter'}
            >
              {message.trim().length}/{MAX_CAMPAIGN_MESSAGE}
            </span>
            {!/stop/i.test(message) && (
              <p className="muted small">
                Tip: tell people how to opt out, e.g. “Reply STOP to opt out.”
              </p>
            )}
            <div>
              <span className="muted small">Preview</span>
              <div className="bubble bubble-out preview-bubble">
                {renderMessage(message, firstName)}
              </div>
            </div>
          </div>
          <div className="wizard-nav">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!messageOk || name.trim() === ''}
              onClick={() => setStep(3)}
            >
              Next: Preview
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <form className="card wizard-card" onSubmit={(e) => void start(e)}>
          <h2>Preview and confirm</h2>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-n">{counts.pending}</span>
              <span>will be sent</span>
            </div>
            <div className="stat">
              <span className="stat-n">{counts.skipped}</span>
              <span>skipped</span>
            </div>
            <div className="stat">
              <span className="stat-n">{counts.total}</span>
              <span>rows in segment</span>
            </div>
          </div>
          <p className="muted">
            Sent one at a time, about every 2 seconds, and can be paused. The opt-out list is
            checked again before each message.{' '}
            {testOnly ? 'Test numbers only is on.' : 'Test numbers only is OFF.'}
          </p>
          <RecipientTable recipients={checked} />
          <label className="toggle safety">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I checked the list: every contact agreed to receive this message.
          </label>
          {error && <p className="error-note">{error}</p>}
          <div className="wizard-nav">
            <button type="button" className="btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!confirmed || counts.pending === 0 || busy}
            >
              Start sending to {counts.pending}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function RecipientTable({ recipients }: { recipients: CampaignRecipient[] }) {
  return (
    <div className="table-wrap recipients">
      <table>
        <thead>
          <tr>
            <th>Phone</th>
            <th>Name</th>
            <th>Status</th>
            <th>Reason</th>
            <th>At</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r, i) => (
            <tr key={`${r.phone}-${i}`}>
              <td>{formatPhone(r.phone)}</td>
              <td>{r.name ?? '—'}</td>
              <td>
                <Chip tone={RECIPIENT_TONE[r.status]}>
                  {r.status === 'pending' ? 'to send' : r.status}
                </Chip>
              </td>
              <td className="muted">{r.reason ? REASON_TEXT[r.reason] : ''}</td>
              <td className="muted">{r.at ? formatDateTime(r.at) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignDetail({ id }: { id: string }) {
  const { api } = useDemo();
  const toast = useToast();
  const campaign = useLive((a) => a.getCampaign(id), `campaign:${id}`);

  async function run(action: () => Promise<void>, done: string): Promise<void> {
    try {
      await action();
      toast({ tone: 'ok', title: done });
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  if (campaign.error !== undefined) return <ErrorNote error={campaign.error} />;
  if (!campaign.data) return <Skeleton rows={5} />;
  const c = campaign.data;
  const n = campaignCounts(c.recipients);
  const done = n.total - n.pending;

  return (
    <>
      <p className="crumbs">
        <Link to="/campaigns">Campaigns</Link> / {c.name}
      </p>
      <Steps current={4} />
      <PageHeader
        title={c.name}
        subtitle={
          <>
            <Chip tone={STATUS_TONE[c.status]}>{c.status}</Chip>{' '}
            {c.testOnly && <Tag>Test numbers only</Tag>} <Tag>Simulated</Tag> · by{' '}
            {c.createdBy.name}
          </>
        }
        actions={
          <>
            {c.status === 'running' && (
              <button
                type="button"
                className="btn"
                onClick={() => void run(() => api.pauseCampaign(id), 'Paused')}
              >
                Pause
              </button>
            )}
            {c.status === 'paused' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void run(() => api.resumeCampaign(id), 'Resumed')}
              >
                Resume
              </button>
            )}
          </>
        }
      />
      <section className="card">
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={n.total}
          aria-valuenow={done}
        >
          <div
            className="progress-sent"
            style={{ width: `${(n.sent / Math.max(1, n.total)) * 100}%` }}
          />
          <div
            className="progress-skipped"
            style={{ width: `${((n.skipped + n.failed) / Math.max(1, n.total)) * 100}%` }}
          />
        </div>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-n">{n.sent}</span>
            <span>sent</span>
          </div>
          <div className="stat">
            <span className="stat-n">{n.pending}</span>
            <span>to send</span>
          </div>
          <div className="stat">
            <span className="stat-n">{n.skipped}</span>
            <span>skipped</span>
          </div>
          <div className="stat">
            <span className="stat-n">{n.failed}</span>
            <span>failed</span>
          </div>
        </div>
        <p className="muted small">Message: “{c.message}”</p>
      </section>
      <RecipientTable recipients={c.recipients} />
    </>
  );
}

function OptOutsPage() {
  const { api } = useDemo();
  const toast = useToast();
  const list = useLive((a) => a.listOptOuts(), 'optouts');
  const [phone, setPhone] = useState('');

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      await api.addOptOut(phone);
      setPhone('');
      toast({ tone: 'ok', title: 'Added to the opt-out list' });
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/campaigns">Campaigns</Link> / Opt-out list
      </p>
      <PageHeader
        title="Opt-out list"
        subtitle="Checked before every campaign message. A customer who replies STOP is added automatically."
      />
      <form className="filters" onSubmit={(e) => void add(e)}>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 202 555 0150"
          aria-label="Phone number"
        />
        <button type="submit" className="btn btn-primary" disabled={phone.trim() === ''}>
          Add number
        </button>
      </form>
      {list.loading && <Skeleton rows={3} />}
      {list.data?.length === 0 && <Empty title="Nobody has opted out" />}
      {(list.data ?? []).length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>How</th>
                <th>Added by</th>
                <th>When</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((o) => (
                <tr key={o.phone}>
                  <td>{formatPhone(o.phone)}</td>
                  <td>
                    {o.reason === 'customer_stop' ? 'Customer replied STOP' : 'Added by hand'}
                  </td>
                  <td>{o.addedBy?.name ?? 'System'}</td>
                  <td className="muted">{formatDateTime(o.at)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        void api
                          .removeOptOut(o.phone)
                          .catch((err: unknown) => toast({ tone: 'error', title: errorText(err) }))
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
