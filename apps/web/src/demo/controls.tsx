// The "Demo controls" drawer (DEMO-13, DEMO-20, DEMO-22): the reviewer's tools to make things
// happen. Everything here is labelled Demo and goes through the demo api.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useDemo, useLive, useStoreData } from './context.tsx';
import { AUTO_TEXTS } from './sim.ts';
import { useToast } from './toasts.tsx';
import { errorText, Modal, Tag } from './ui.tsx';

const NEW_CONTACT = '__new__';
const CUSTOM = '__custom__';

export function DemoControls({ onClose }: { onClose: () => void }) {
  const { api } = useDemo();
  const toast = useToast();
  const navigate = useNavigate();
  const contacts = useLive((a) => a.demoContacts(), 'demo-contacts');
  const agents = useLive((a) => a.demoAgents(), 'demo-agents');
  const chats = useLive((a) => a.listConversations(), 'conversations');
  const autoActivity = useStoreData((d) => d.settings.autoActivity);
  const waState = useStoreData((d) => d.wa.state.state);

  const [phone, setPhone] = useState(NEW_CONTACT);
  const [preset, setPreset] = useState(AUTO_TEXTS[0] ?? '');
  const [custom, setCustom] = useState('');
  const [chatId, setChatId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  // `done` is left out when the result shows by itself (a new chat opens).
  async function run(action: () => Promise<unknown>, done?: string): Promise<void> {
    try {
      await action();
      if (done) toast({ tone: 'ok', title: done });
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  const text = preset === CUSTOM ? custom : preset;
  const employees = (agents.data ?? []).filter((a) => a.role === 'EMPLOYEE');
  const chosenChat = chatId || chats.data?.[0]?.id || '';
  const chosenAgent = agentId || employees[0]?.id || '';

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label="Demo controls"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2>Demo controls</h2>
          <Tag>Demo</Tag>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted">
          Make things happen for the walk-through. Nothing here reaches WhatsApp.
        </p>

        <section className="drawer-section">
          <h3>Customer writes in</h3>
          <label className="field">
            From
            <select value={phone} onChange={(e) => setPhone(e.target.value)}>
              <option value={NEW_CONTACT}>A new test contact</option>
              {(contacts.data ?? []).map((c) => (
                <option key={c.phone} value={c.phone}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Message
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {AUTO_TEXTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="STOP">STOP (opt out)</option>
              <option value={CUSTOM}>Custom text…</option>
            </select>
          </label>
          {preset === CUSTOM && (
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type the customer's message"
              aria-label="Custom customer message"
            />
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={text.trim() === ''}
            onClick={() =>
              void run(() =>
                api
                  .simulateInbound(phone === NEW_CONTACT ? { text } : { phone, text })
                  .then((id) => {
                    // Show the chat it opened.
                    void navigate(`/inbox/${id}`);
                    onClose();
                  }),
              )
            }
          >
            Send as customer
          </button>
        </section>

        <section className="drawer-section">
          <h3>Another agent replies</h3>
          <p className="muted small">
            The agent holds the reply lock for about 8 seconds, then replies. Others see “… is
            replying”.
          </p>
          <label className="field">
            Chat
            <select value={chosenChat} onChange={(e) => setChatId(e.target.value)}>
              {(chats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contact.name ?? c.contact.phone}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Agent
            <select value={chosenAgent} onChange={(e) => setAgentId(e.target.value)}>
              {(agents.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={!chosenChat || !chosenAgent}
            onClick={() =>
              void run(() => api.simulateAgent(chosenChat, chosenAgent), 'The agent started typing')
            }
          >
            Simulate agent replying
          </button>
        </section>

        <section className="drawer-section">
          <h3>WhatsApp</h3>
          <button
            type="button"
            className="btn"
            disabled={waState !== 'connected'}
            onClick={() => void run(api.dropConnection, 'Connection dropped (back in ~8 s)')}
          >
            Drop connection
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoActivity}
              onChange={(e) => void api.setAutoActivity(e.target.checked)}
            />
            Auto activity: a customer writes about every 45 s
          </label>
        </section>

        <section className="drawer-section">
          <h3>Data</h3>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            Reset demo data…
          </button>
        </section>
      </aside>

      {confirmReset && (
        <Modal
          title="Reset demo data?"
          onClose={() => setConfirmReset(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  api.resetData();
                  setConfirmReset(false);
                  toast({ tone: 'ok', title: 'Demo data reset' });
                }}
              >
                Reset
              </button>
            </>
          }
        >
          <p>Every change made in this browser is lost and the Skyline Realty data comes back.</p>
        </Modal>
      )}
    </div>
  );
}
