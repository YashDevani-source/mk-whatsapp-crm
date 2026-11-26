// DEMO-11, DEMO-12: the Super Admin's WhatsApp page with the simulated QR.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { bannerText } from '../view.ts';
import { useDemo, useLive, useNow } from './context.tsx';
import { TIMING } from './engine.ts';
import { formatDateTime, formatPhone } from './format.ts';
import { WhatsAppLogo } from './icons.tsx';
import { ACTION_LABELS } from './reports-page.tsx';
import { Chip, errorText, ErrorNote, Modal, PageHeader, Skeleton, Tag, type Tone } from './ui.tsx';

const STATE_LABEL = {
  connecting: ['Connecting', 'info'],
  qr_required: ['Waiting for QR scan', 'warn'],
  connected: ['Connected', 'ok'],
  disconnected: ['Disconnected', 'warn'],
  reconnect_required: ['Reconnect required', 'warn'],
} as const satisfies Record<string, readonly [string, Tone]>;

function QrImage({ text }: { text: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { margin: 1, width: 240 })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(undefined));
    return () => {
      live = false;
    };
  }, [text]);
  return src ? (
    <img className="qr" src={src} alt="Simulated WhatsApp pairing QR code" />
  ) : (
    <div className="qr qr-loading" />
  );
}

export function WhatsAppPage() {
  const { api } = useDemo();
  const wa = useLive((a) => a.getWaAdmin(), 'wa-admin');
  const now = useNow(1000);
  // The connection's own history, from the audit log (the Super Admin may read it).
  const audit = useLive((a) => a.listAudit(), 'audit');
  const history = (audit.data ?? []).filter((e) => e.action.startsWith('wa.')).slice(0, 6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (wa.error) return <ErrorNote error={wa.error} />;
  if (!wa.data) return <Skeleton rows={4} />;
  const { state, number, since, qr, qrAttempts } = wa.data;
  const [label, tone] = STATE_LABEL[state.state];
  const secondsLeft = qr
    ? Math.max(
        0,
        Math.ceil((new Date(qr.at).getTime() + TIMING.qrRefreshMs - now.getTime()) / 1000),
      )
    : 0;

  return (
    <>
      <PageHeader
        title="WhatsApp connection"
        subtitle={
          state.state === 'connected' && number
            ? `Connected as ${formatPhone(number)} since ${formatDateTime(since)}. One company number, one live connection.`
            : `${label}. One company number, one live connection; only the Super Admin sees this page.`
        }
      />
      <div className="wa-grid">
        <section className="card state-card">
          <div className="card-head">
            <h2 className="with-logo">
              <WhatsAppLogo size={28} /> Status
            </h2>
            <Tag>Simulated</Tag>
          </div>
          <dl className="facts">
            <dt>State</dt>
            <dd>
              <Chip tone={tone}>{label}</Chip>
            </dd>
            <dt>Number</dt>
            <dd>{number ? formatPhone(number) : 'Not linked'}</dd>
            <dt>Since</dt>
            <dd>{formatDateTime(since)}</dd>
            <dt>Details</dt>
            <dd>{bannerText(state).text}</dd>
            <dt>Provider</dt>
            <dd>Simulated provider (demo mode, nothing is sent to WhatsApp)</dd>
          </dl>
          <div className="card-actions">
            {state.state === 'connected' && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
                Log out WhatsApp…
              </button>
            )}
            {(state.state === 'reconnect_required' || state.state === 'disconnected') && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(api.requestQr)}
              >
                Get new QR
              </button>
            )}
          </div>
          {error && <p className="error-note">{error}</p>}
        </section>

        {state.state === 'qr_required' && qr && (
          <section className="card qr-card">
            <div className="card-head">
              <h2>Scan to link</h2>
              <Tag>Simulated QR — no phone needed</Tag>
            </div>
            <QrImage text={qr.qr} />
            <p className="muted">
              On a real phone: WhatsApp → Linked devices → Link a device. Here, press “Simulate
              scan”.
            </p>
            <p className="qr-meta">
              New code in <strong>{secondsLeft}s</strong> · code {qrAttempts} of{' '}
              {TIMING.qrMaxAttempts}
            </p>
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(api.scanQr)}
              >
                Simulate scan
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void run(api.requestQr)}
              >
                Get new QR
              </button>
            </div>
          </section>
        )}

        {(state.state === 'connected' || state.state === 'disconnected') && (
          <section className="card">
            <div className="card-head">
              <h2>Connection history</h2>
              <Link to="/audit" className="small">
                Audit log
              </Link>
            </div>
            {history.length === 0 ? (
              <p className="muted">No connection changes yet.</p>
            ) : (
              <ul className="plain-list">
                {history.map((e) => (
                  <li key={e.id} className="list-row">
                    <span>
                      {ACTION_LABELS[e.action]}
                      {e.detail && <span className="muted small"> · {e.detail}</span>}
                    </span>
                    <span className="muted small nowrap">{formatDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">WhatsApp is a trademark of its owner.</p>
          </section>
        )}

        {state.state === 'connecting' && (
          <section className="card qr-card">
            <h2>Linking…</h2>
            <p className="muted">The simulated phone is pairing. This takes a second or two.</p>
          </section>
        )}
      </div>

      {confirming && (
        <Modal
          title="Log out WhatsApp?"
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  void run(api.logoutWa);
                }}
              >
                Yes, log out WhatsApp
              </button>
            </>
          }
        >
          <p>
            This unlinks the company number from the CRM. Nobody can send or receive messages until
            the QR is scanned again.
          </p>
        </Modal>
      )}
    </>
  );
}
