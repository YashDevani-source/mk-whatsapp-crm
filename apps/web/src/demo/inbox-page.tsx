// DEMO-14 to DEMO-21: the shared inbox in three columns (chat list, chat panel, lead panel).
import {
  LEAD_STAGE_LABELS,
  MAX_TEXT_LENGTH,
  type ConversationStatus,
  type InboxConversation,
  type InboxItem,
  type ReplyLock,
} from '@crm/shared';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { demoCan } from './access.ts';
import {
  chatRows,
  filterConversations,
  previewText,
  stageLabel,
  stageText,
  stageTone,
  statusCounts,
  TICKS,
  timeOf,
  type Scope,
} from './chat-view.ts';
import { useDemo, useLive, useNow, useUser } from './context.tsx';
import { formatAgo, formatDateTime, formatPhone, formatPrice } from './format.ts';
import { ShareModal } from './properties-page.tsx';
import { useToast } from './toasts.tsx';
import { Avatar, Chip, Empty, errorText, ErrorNote, Skeleton } from './ui.tsx';

const STATUS_TABS: readonly [ConversationStatus, string][] = [
  ['open', 'Open'],
  ['pending', 'Pending'],
  ['closed', 'Closed'],
];

const SCOPES: readonly [Scope, string][] = [
  ['unassigned', 'Unassigned'],
  ['mine', 'Mine'],
  ['all', 'All'],
];

export function InboxPage() {
  const user = useUser();
  const selected = useParams()['*'] || undefined;
  const list = useLive((api) => api.listConversations(), 'conversations');
  const [status, setStatus] = useState<ConversationStatus>('open');
  // Employees only ever see their own chats (DEMO-10), so they get no scope switch.
  const isEmployee = user.role === 'EMPLOYEE';
  const [scope, setScope] = useState<Scope>(isEmployee ? 'mine' : 'all');
  const [search, setSearch] = useState('');

  const all = list.data ?? [];
  const shown = filterConversations(all, { status, scope, search, userId: user.id });
  const counts = statusCounts(all, scope, user.id);

  return (
    <div className="inbox">
      <section className="chat-list" aria-label="Chats">
        <div className="chat-list-head">
          <input
            type="search"
            placeholder="Search name, phone or message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search chats"
          />
          <div className="segmented" role="tablist" aria-label="Chat status">
            {STATUS_TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? 'active' : ''}
                onClick={() => setStatus(value)}
              >
                {label} <span className="count">{counts[value]}</span>
              </button>
            ))}
          </div>
          {!isEmployee && (
            <div className="scope-row" role="group" aria-label="Assignment">
              {SCOPES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={scope === value ? 'pill active' : 'pill'}
                  onClick={() => setScope(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="chat-rows">
          {list.loading && <Skeleton rows={6} />}
          {list.error !== undefined && <ErrorNote error={list.error} />}
          {!list.loading && shown.length === 0 && (
            <Empty
              title="No chats here"
              hint={
                isEmployee
                  ? 'Chats assigned to you appear here.'
                  : 'Try another tab, or use Demo controls to simulate a customer message.'
              }
            />
          )}
          {shown.map((c) => (
            <ChatRowLink key={c.id} conversation={c} active={c.id === selected} />
          ))}
        </div>
      </section>
      {selected ? (
        <>
          <ChatPanel key={selected} id={selected} />
          <LeadPanel key={`lead-${selected}`} id={selected} />
        </>
      ) : (
        <div className="chat-placeholder">
          <Empty title="Select a chat" hint="Pick a conversation on the left to read and reply." />
        </div>
      )}
    </div>
  );
}

function ChatRowLink({
  conversation: c,
  active,
}: {
  conversation: InboxConversation;
  active: boolean;
}) {
  const { now } = useDemo();
  const name = c.contact.name ?? formatPhone(c.contact.phone);
  return (
    <Link to={`/inbox/${c.id}`} className={active ? 'chat-row active' : 'chat-row'}>
      <Avatar name={c.contact.name ?? '#'} />
      <div className="chat-row-main">
        <div className="chat-row-top">
          <strong className={c.unreadCount > 0 ? 'unread' : ''}>{name}</strong>
          <span className="muted small">
            {c.lastMessageAt ? formatAgo(c.lastMessageAt, now()) : ''}
          </span>
        </div>
        <div className="chat-row-preview">
          <span className={c.unreadCount > 0 ? 'preview unread' : 'preview'}>
            {previewText(c.lastMessage)}
          </span>
          {c.unreadCount > 0 && (
            <span className="unread-badge" aria-label={`${c.unreadCount} unread`}>
              {c.unreadCount}
            </span>
          )}
        </div>
        <div className="chat-row-meta">
          {c.leadStage && <Chip tone={stageTone(c.leadStage)}>{stageLabel(c.leadStage)}</Chip>}
          <span className="muted small">{c.assignee ? c.assignee.name : 'Unassigned'}</span>
        </div>
      </div>
    </Link>
  );
}

function ChatPanel({ id }: { id: string }) {
  const { api } = useDemo();
  const user = useUser();
  const toast = useToast();
  const now = useNow(5000);
  const conv = useLive((a) => a.getConversation(id), `conv:${id}`);
  const items = useLive((a) => a.listItems(id), `items:${id}`);
  // A lock past its expiry stops counting without a store change (checked every 5 s).
  const lockLive = useLive((a) => a.getLock(id), `lock:${id}`);
  const lock = lockLive.data && new Date(lockLive.data.expiresAt) > now ? lockLive.data : null;
  const wa = useLive((a) => a.getWa(), 'wa');
  const staff = demoCan(user.role, 'inbox.assign');
  const assignees = useLive(
    (a) => (staff ? a.listAssignees() : Promise.resolve([])),
    `assignees:${staff}`,
  );
  // The unread count when the chat was opened places the "New messages" divider.
  const [unreadAtOpen, setUnreadAtOpen] = useState<number>();
  const bottom = useRef<HTMLDivElement>(null);

  const unread = conv.data?.unreadCount ?? 0;
  useEffect(() => {
    if (conv.data && unreadAtOpen === undefined) setUnreadAtOpen(conv.data.unreadCount);
  }, [conv.data, unreadAtOpen]);
  // Reading the chat marks it read, also when a message arrives while it is open (DEMO-15).
  useEffect(() => {
    if (unread > 0) void api.openConversation(id).catch(() => undefined);
  }, [api, id, unread]);

  const count = items.data?.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  if (conv.error !== undefined) {
    return (
      <div className="chat-placeholder">
        <Empty
          title="This chat is not available"
          hint="It may have been reassigned, or it is not assigned to you."
        />
      </div>
    );
  }
  if (!conv.data) {
    return (
      <div className="chat-panel">
        <Skeleton rows={6} />
      </div>
    );
  }
  const c = conv.data;

  async function change(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  return (
    <section className="chat-panel" aria-label="Conversation">
      <header className="chat-head">
        <Link to="/inbox" className="chat-back" aria-label="Back to the chat list">
          ←
        </Link>
        <Avatar name={c.contact.name ?? '#'} />
        <div className="chat-head-who">
          <strong>{c.contact.name ?? formatPhone(c.contact.phone)}</strong>
          <span className="muted small">{formatPhone(c.contact.phone)}</span>
        </div>
        <div className="chat-head-actions">
          {staff ? (
            <label className="inline-field">
              <span>Assignee</span>
              <select
                value={c.assignee?.id ?? ''}
                onChange={(e) =>
                  void change(() => api.assignConversation(id, e.target.value || null))
                }
              >
                <option value="">Unassigned</option>
                {(assignees.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (
                    {a.role === 'EMPLOYEE'
                      ? 'Employee'
                      : a.role === 'MANAGER'
                        ? 'Manager'
                        : 'Super Admin'}
                    )
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="muted small">Assigned to you</span>
          )}
          <label className="inline-field">
            <span>Status</span>
            <select
              value={c.status}
              onChange={(e) =>
                void change(() =>
                  api.setConversationStatus(id, e.target.value as ConversationStatus),
                )
              }
            >
              {STATUS_TABS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="chat-scroll">
        {items.loading && <Skeleton rows={5} />}
        {chatRows(items.data ?? [], now, unreadAtOpen ?? 0).map((row) => {
          if (row.kind === 'day')
            return (
              <div key={row.key} className="day-sep">
                <span>{row.label}</span>
              </div>
            );
          if (row.kind === 'divider')
            return (
              <div key={row.key} className="new-divider">
                <span>New messages</span>
              </div>
            );
          return (
            <Bubble
              key={row.key}
              item={row.item}
              onRetry={(mid) => void change(() => api.retryMessage(mid))}
            />
          );
        })}
        <div ref={bottom} />
      </div>

      <Composer
        id={id}
        lock={lock}
        waConnected={wa.data?.state.state === 'connected'}
        canTakeOver={staff}
      />
    </section>
  );
}

function Bubble({ item, onRetry }: { item: InboxItem; onRetry: (messageId: string) => void }) {
  if (item.kind === 'note') {
    const n = item.note;
    return (
      <div className="note">
        <div className="note-head">
          Internal note · {n.author.name} · {timeOf(n.at)}
        </div>
        <div className="note-body">{n.body}</div>
        <div className="note-foot">Not sent to the customer</div>
      </div>
    );
  }
  const m = item.message;
  const out = m.direction === 'outbound';
  const tick = m.status ? TICKS[m.status] : undefined;
  return (
    <div className={`bubble-row ${out ? 'out' : 'in'}`}>
      <div
        className={`bubble ${out ? 'bubble-out' : 'bubble-in'}${m.status === 'failed' ? ' bubble-failed' : ''}`}
      >
        {out && <div className="bubble-sender">{m.sender ? m.sender.name : 'Sent from phone'}</div>}
        {item.property && (
          <div className="property-card">
            <div className="property-thumb" aria-hidden="true">
              {item.property.title.slice(0, 1)}
            </div>
            <div>
              <strong>{item.property.title}</strong>
              <div className="muted small">{item.property.subtitle}</div>
              <div className="price">From {formatPrice(item.property.price)}</div>
            </div>
          </div>
        )}
        {m.type === 'unsupported' ? (
          <div className="unsupported">Unsupported message ({m.unsupportedKind ?? 'media'})</div>
        ) : (
          <div className="bubble-body">{m.body}</div>
        )}
        <div className="bubble-foot">
          <span>{timeOf(m.at)}</span>
          {tick && (
            <span className={`tick ${tick.className}`} title={tick.label} aria-label={tick.label}>
              {tick.icon}
              {m.status === 'failed' && <span className="tick-word"> Failed</span>}
            </span>
          )}
        </div>
      </div>
      {m.status === 'failed' && out && (
        <button type="button" className="btn-link retry" onClick={() => onRetry(m.id)}>
          Retry
        </button>
      )}
    </div>
  );
}

function Composer({
  id,
  lock,
  waConnected,
  canTakeOver,
}: {
  id: string;
  lock: ReplyLock | null;
  waConnected: boolean;
  canTakeOver: boolean;
}) {
  const { api } = useDemo();
  const user = useUser();
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sharing, setSharing] = useState(false);
  const lastTyping = useRef(0);
  const holding = useRef(false);

  const lockedByOther = lock !== null && lock.holder.id !== user.id;
  const blocked = !note && (!waConnected || lockedByOther);
  const length = text.trim().length;

  // Leaving the chat lets go of the lock.
  useEffect(
    () => () => {
      if (holding.current) void api.stopTyping(id).catch(() => undefined);
    },
    [api, id],
  );

  function onChange(value: string): void {
    setText(value);
    setError(undefined);
    if (note) return;
    if (value.trim() === '') {
      if (holding.current) void api.stopTyping(id).catch(() => undefined);
      holding.current = false;
      return;
    }
    // Typing takes the reply lock and renews it at most every 5 s.
    if (Date.now() - lastTyping.current > 5000) {
      lastTyping.current = Date.now();
      api
        .typing(id)
        .then(() => {
          holding.current = true;
        })
        .catch((err: unknown) => setError(errorText(err)));
    }
  }

  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (length === 0 || length > MAX_TEXT_LENGTH || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (note) await api.addNote(id, text);
      else await api.sendMessage(id, text);
      setText('');
      holding.current = false;
      lastTyping.current = 0;
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form className={note ? 'composer composer-note' : 'composer'} onSubmit={(e) => void submit(e)}>
      {!note && !waConnected && (
        <div className="composer-state warn">WhatsApp is not connected. Replies are paused.</div>
      )}
      {!note && waConnected && lockedByOther && (
        <div className="composer-state info">
          <span>
            <strong>{lock.holder.name}</strong> is replying…
          </span>
          {canTakeOver && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                void api.takeOver(id).catch((err: unknown) => setError(errorText(err)))
              }
            >
              Take over
            </button>
          )}
        </div>
      )}
      <textarea
        rows={3}
        placeholder={note ? 'Write an internal note (only the team sees it)…' : 'Type a reply…'}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={blocked}
        aria-label={note ? 'Internal note' : 'Reply'}
      />
      {error && <p className="error-note">{error}</p>}
      <div className="composer-bar">
        <label className="toggle">
          <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
          Internal note
        </label>
        <button
          type="button"
          className="btn btn-small"
          disabled={!waConnected || lockedByOther}
          onClick={() => setSharing(true)}
        >
          Share property
        </button>
        <span className={length > MAX_TEXT_LENGTH ? 'counter over' : 'counter'}>
          {length}/{MAX_TEXT_LENGTH}
        </span>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || blocked || length === 0 || length > MAX_TEXT_LENGTH}
        >
          {note ? 'Add note' : 'Send'}
        </button>
      </div>
      {sharing && <ShareModal conversationId={id} onClose={() => setSharing(false)} />}
    </form>
  );
}

function LeadPanel({ id }: { id: string }) {
  const conv = useLive((a) => a.getConversation(id), `conv:${id}`);
  const leadId = conv.data?.leadId ?? null;
  const lead = useLive(
    (a) => (leadId ? a.getLead(leadId) : Promise.resolve(null)),
    `lead:${leadId}`,
  );
  const history = useLive(
    (a) => (leadId ? a.listLeadHistory(leadId) : Promise.resolve([])),
    `history:${leadId}`,
  );
  const followUps = useLive((a) => a.listFollowUps(), 'followups');
  const navigate = useNavigate();

  if (conv.error !== undefined) return <aside className="lead-panel" />;
  if (!conv.data) {
    return (
      <aside className="lead-panel">
        <Skeleton rows={4} />
      </aside>
    );
  }
  const l = lead.data;
  const next = (followUps.data ?? []).find((f) => f.leadId === leadId && f.doneAt === null);
  const needs = l?.needs;

  return (
    <aside className="lead-panel" aria-label="Lead">
      <h2>Lead</h2>
      {lead.error !== undefined && <p className="muted">This lead is owned by someone else.</p>}
      {l && (
        <>
          <div className="lead-stage">
            <Chip tone={stageTone(l.stage)}>{LEAD_STAGE_LABELS[l.stage]}</Chip>
            <span className="muted small">Owner: {l.owner?.name ?? 'Unassigned'}</span>
          </div>
          <dl className="facts compact">
            <dt>Budget</dt>
            <dd>
              {needs?.budgetMax
                ? `${needs.budgetMin ? `${formatPrice(needs.budgetMin)} – ` : 'Up to '}${formatPrice(needs.budgetMax)}`
                : 'Not known'}
            </dd>
            <dt>Location</dt>
            <dd>{needs?.location ?? 'Not known'}</dd>
            <dt>Type</dt>
            <dd>{needs?.propertyType ?? 'Not known'}</dd>
            <dt>BHK</dt>
            <dd>{needs?.bhk ?? 'Not known'}</dd>
            <dt>Next follow-up</dt>
            <dd>{next ? `${formatDateTime(next.dueAt)} · ${next.note}` : 'None'}</dd>
          </dl>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void navigate(`/leads/${l.id}`)}
          >
            Open lead
          </button>
          <h3>History</h3>
          <ol className="timeline">
            {[...(history.data ?? [])].reverse().map((h) => (
              <li key={h.id}>
                <span>
                  {h.field === 'created' && 'Lead created'}
                  {h.field === 'stage' && `Stage ${stageText(h.from)} → ${stageText(h.to)}`}
                  {h.field === 'owner' && `Owner → ${h.to ?? 'Unassigned'}`}
                  {h.field === 'needs' && 'Needs updated'}
                </span>
                <span className="muted small">
                  {h.actor?.name ?? 'System'} · {formatDateTime(h.at)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
