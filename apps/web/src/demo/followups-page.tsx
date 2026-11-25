// DEMO-25: follow-ups in Overdue, Today, Upcoming and Done, with create, edit, complete and
// "Run now (test)". Also the rows and modal the lead page uses.
import type { FollowUpView } from '@crm/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useDemo, useLive, useNow } from './context.tsx';
import { formatDateTime, formatPhone } from './format.ts';
import { followUpTab, type FollowUpTab } from './rules.ts';
import { useToast } from './toasts.tsx';
import { Chip, Empty, errorText, ErrorNote, Modal, PageHeader, Skeleton, Tag } from './ui.tsx';

const TABS: readonly [FollowUpTab, string][] = [
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['done', 'Done'],
];

export function FollowUpsPage() {
  const now = useNow(30_000);
  const list = useLive((a) => a.listFollowUps(), 'followups');
  const [tab, setTab] = useState<FollowUpTab>('overdue');
  const [creating, setCreating] = useState(false);
  const all = list.data ?? [];
  const counts = Object.fromEntries(
    TABS.map(([t]) => [t, all.filter((f) => followUpTab(f, now) === t).length]),
  );
  const shown = all.filter((f) => followUpTab(f, now) === tab);
  // Done shows the newest first; the others the soonest first.
  if (tab === 'done') shown.reverse();

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle="Reminders on leads. “Run now (test)” sends the test auto-reply once."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            New follow-up
          </button>
        }
      />
      <div className="tabs-row" role="tablist" aria-label="Follow-up lists">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`tab-btn${tab === value ? ' active' : ''}${value === 'overdue' ? ' tab-overdue' : ''}`}
            onClick={() => setTab(value)}
          >
            {label} <span className="count">{counts[value]}</span>
          </button>
        ))}
      </div>
      {list.loading && <Skeleton rows={5} />}
      {list.error !== undefined && <ErrorNote error={list.error} />}
      {!list.loading && shown.length === 0 && (
        <Empty
          title={tab === 'overdue' ? 'Nothing overdue' : 'Nothing here'}
          hint={
            tab === 'done'
              ? 'Completed follow-ups appear here.'
              : 'Create one from a lead or with “New follow-up”.'
          }
        />
      )}
      {shown.length > 0 && <FollowUpRows rows={shown} showCustomer />}
      {creating && <FollowUpModal onClose={() => setCreating(false)} />}
    </>
  );
}

export function FollowUpRows({
  rows,
  showCustomer,
}: {
  rows: FollowUpView[];
  showCustomer: boolean;
}) {
  const { api } = useDemo();
  const toast = useToast();
  const now = useNow(30_000);
  const [editing, setEditing] = useState<FollowUpView>();

  async function run(action: () => Promise<void>, done: string): Promise<void> {
    try {
      await action();
      toast({ tone: 'ok', title: done });
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showCustomer && <th>Customer</th>}
            <th>Due</th>
            <th>Note</th>
            <th>Owner</th>
            <th>Auto-reply</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const tab = followUpTab(f, now);
            return (
              <tr key={f.id}>
                {showCustomer && (
                  <td>
                    <Link to={`/leads/${f.leadId}`}>
                      <strong>{f.contact.name ?? formatPhone(f.contact.phone)}</strong>
                    </Link>
                  </td>
                )}
                <td>
                  <span className={tab === 'overdue' ? 'overdue' : ''}>
                    {formatDateTime(f.dueAt)}
                  </span>
                  {tab === 'overdue' && <Chip tone="error">Overdue</Chip>}
                  {tab === 'done' && <Chip tone="ok">Done</Chip>}
                </td>
                <td>{f.note}</td>
                <td>{f.owner.name}</td>
                <td className="auto-reply">
                  {f.autoReply === null ? (
                    <span className="muted">None</span>
                  ) : (
                    <>
                      <Tag>Test</Tag>{' '}
                      {f.sentAt ? (
                        <span className="muted small">Sent {formatDateTime(f.sentAt)}</span>
                      ) : (
                        <span className="muted small" title={f.autoReply}>
                          Not sent yet
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="row-actions">
                  {f.autoReply !== null && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => void run(() => api.runFollowUp(f.id), 'Test auto-reply sent')}
                    >
                      Run now (test)
                    </button>
                  )}
                  {f.doneAt === null && (
                    <>
                      <button type="button" className="btn btn-small" onClick={() => setEditing(f)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => void run(() => api.completeFollowUp(f.id), 'Marked as done')}
                      >
                        Complete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && <FollowUpModal existing={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

// `datetime-local` works in local time without a zone; the api stores ISO times.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowUpModal({
  leadId,
  existing,
  onClose,
}: {
  leadId?: string;
  existing?: FollowUpView;
  onClose: () => void;
}) {
  const { api, now } = useDemo();
  const toast = useToast();
  const leads = useLive((a) => a.listLeads(), 'leads');
  const [lead, setLead] = useState(existing?.leadId ?? leadId ?? '');
  const [due, setDue] = useState(
    toLocalInput(existing?.dueAt ?? new Date(now().getTime() + 3_600_000).toISOString()),
  );
  const [note, setNote] = useState(existing?.note ?? '');
  const [autoReply, setAutoReply] = useState(existing?.autoReply ?? '');
  const [error, setError] = useState<string>();
  const sent = existing?.sentAt != null;
  const openLeads = (leads.data ?? []).filter((l) => l.closedAt === null);
  const chosenLead = lead || openLeads[0]?.id || '';

  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const body = {
      dueAt: new Date(due).toISOString(),
      note,
      autoReply: autoReply.trim() === '' ? null : autoReply,
    };
    try {
      if (existing) await api.updateFollowUp(existing.id, body);
      else await api.createFollowUp({ ...body, leadId: chosenLead });
      toast({ tone: 'ok', title: existing ? 'Follow-up saved' : 'Follow-up created' });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal
      title={existing ? 'Edit follow-up' : 'New follow-up'}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={note.trim() === '' || due === '' || (!existing && chosenLead === '')}
            onClick={() => void submit()}
          >
            {existing ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => void submit(e)}>
        {!existing && !leadId && (
          <label>
            Lead
            <select value={chosenLead} onChange={(e) => setLead(e.target.value)}>
              {openLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.contact.name ?? formatPhone(l.contact.phone)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Due
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label>
          Note
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What to do"
          />
        </label>
        <label>
          Test auto-reply (optional) <Tag>Test</Tag>
          <textarea
            rows={3}
            value={autoReply}
            disabled={sent}
            onChange={(e) => setAutoReply(e.target.value)}
            placeholder="Sent to the customer by “Run now (test)”, once"
          />
        </label>
        {sent && <p className="muted small">The auto-reply was already sent and cannot change.</p>}
        {error && <p className="error-note">{error}</p>}
      </form>
    </Modal>
  );
}
