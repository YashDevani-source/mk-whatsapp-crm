// MSG-24, MSG-25: the minimal messages page for the Super Admin and Managers. The full inbox
// (assignment, notes, reply lock) is INB. Ticks show only the stored status (MSG-22).
import type { MessageView, WaState } from '@crm/shared';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { sendMessage } from './api.ts';
import {
  bodyText,
  contactLabel,
  resendText,
  sendErrorText,
  senderLabel,
  tickFor,
} from './messages-view.ts';
import { useMessages } from './useMessages.ts';

function time(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function Bubble({ message, onResend }: { message: MessageView; onResend: (text: string) => void }) {
  const tick = tickFor(message);
  const sender = senderLabel(message);
  const again = resendText(message);
  return (
    <li className={`bubble bubble-${message.direction}`}>
      {sender && <div className="bubble-sender">{sender}</div>}
      <div className={message.type === 'unsupported' ? 'bubble-body unsupported' : 'bubble-body'}>
        {bodyText(message)}
      </div>
      <div className="bubble-meta">
        {time(message.at)}
        {tick && (
          <span className={`tick tick-${tick.tone}`} title={tick.label} aria-label={tick.label}>
            {tick.symbol}
          </span>
        )}
      </div>
      {tick?.tone === 'failed' && <div className="bubble-failed">{tick.label}</div>}
      {again !== undefined && (
        <button type="button" className="link" onClick={() => onResend(again)}>
          Resend
        </button>
      )}
    </li>
  );
}

export function MessagesPage({
  socket,
  state,
}: {
  socket: Socket | undefined;
  state: WaState | undefined;
}) {
  const live = useMessages(socket);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const current = live.conversations.find((c) => c.id === live.selected);
  const connected = state?.state === 'connected';

  async function send(body: string): Promise<boolean> {
    if (!live.selected || body.trim() === '') return false;
    setBusy(true);
    setError(undefined);
    try {
      const result = await sendMessage(live.selected, body, crypto.randomUUID());
      if (result.ok) {
        live.addOwn(result.message);
        return true;
      }
      setError(sendErrorText(result.status, result.error));
    } catch {
      setError(sendErrorText(0));
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (await send(text)) setText('');
  }

  // Enter sends; Shift+Enter starts a new line.
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section className="messages">
      <aside className="conversation-list">
        <h2>Conversations</h2>
        {live.loadError && <p className="error">The conversations could not be loaded.</p>}
        {live.conversations.length === 0 && !live.loadError && (
          <p className="muted">No conversations yet. They start when a customer writes.</p>
        )}
        <ul>
          {live.conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === live.selected ? 'conversation active' : 'conversation'}
                onClick={() => live.select(c.id)}
              >
                <strong>{contactLabel(c.contact)}</strong>
                <span className="preview">{c.lastMessage ? bodyText(c.lastMessage) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="chat">
        {current ? (
          <>
            <h2>{contactLabel(current.contact)}</h2>
            <ul className="bubbles">
              {live.messages.map((m) => (
                <Bubble key={m.id} message={m} onResend={(t) => void send(t)} />
              ))}
            </ul>
            <form className="compose" onSubmit={(e) => void submit(e)}>
              <textarea
                value={text}
                maxLength={4096}
                rows={2}
                placeholder={connected ? 'Type a reply' : 'WhatsApp is not connected'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
              />
              <button type="submit" disabled={busy || text.trim() === ''}>
                Send
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <p className="muted">Choose a conversation.</p>
        )}
      </div>
    </section>
  );
}
