// The WA pages: login (WA-23), connection (WA-24), the placeholder home, and the banner (WA-25).
import type { SessionUser, WaState } from '@crm/shared';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { login, logoutWhatsApp, requestNewQr } from './api.ts';
import { actionErrorText, bannerText, loginErrorText } from './view.ts';

export function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await login(email, password);
      if (result.ok) onLogin(result.user);
      else setError(loginErrorText(result.status));
    } catch {
      setError(loginErrorText(0));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>MK CRM</h1>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}

export function Banner({ state }: { state: WaState | undefined }) {
  const banner = bannerText(state);
  return (
    <div className={`banner banner-${banner.tone}`} role="status">
      {banner.simulated && <span className="tag">Simulated</span>}
      {banner.text}
    </div>
  );
}

function QrImage({ text }: { text: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { margin: 1, width: 280 })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(undefined));
    return () => {
      live = false;
    };
  }, [text]);
  return src ? <img className="qr" src={src} alt="WhatsApp pairing QR code" /> : null;
}

export function ConnectionPage({
  state,
  qr,
}: {
  state: WaState | undefined;
  qr: string | undefined;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Logging out unlinks the device at WhatsApp, so it takes a second, separate click (WA-24).
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const simulated = state?.provider === 'fake';

  useEffect(() => {
    if (state?.state !== 'connected') setConfirmingLogout(false);
  }, [state?.state]);

  async function run(action: () => Promise<number>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const status = await action();
      if (status !== 202) setError(actionErrorText(status));
    } catch {
      setError(actionErrorText(0));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>WhatsApp connection</h2>
      <p>
        State: <strong>{state?.state ?? 'unknown'}</strong>
        {state?.provider && <> · provider {state.provider}</>}
      </p>
      {state?.state === 'qr_required' && (
        <div>
          <p>
            {simulated
              ? 'Simulated QR: the fake provider pairs itself in a few seconds. Nothing to scan.'
              : 'On the test phone, open WhatsApp → Linked devices → Link a device, and scan this code.'}
          </p>
          {qr ? <QrImage text={qr} /> : <p>Waiting for the QR…</p>}
        </div>
      )}
      {state?.state === 'reconnect_required' && (
        <button type="button" disabled={busy} onClick={() => void run(requestNewQr)}>
          Get new QR
        </button>
      )}
      {state?.state === 'connected' && (
        <div>
          <p>The WhatsApp number is linked to this CRM. Nothing else needs to be done here.</p>
          {confirmingLogout ? (
            <div className="confirm" role="alertdialog" aria-label="Confirm WhatsApp logout">
              <p>
                Unlink this device from WhatsApp? The stored session is deleted, and a new QR scan
                is needed to connect again.
              </p>
              {/* Cancel sits where the first button was, so a repeated click cancels. */}
              <button type="button" onClick={() => setConfirmingLogout(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void run(logoutWhatsApp)}
              >
                Yes, log out WhatsApp
              </button>
            </div>
          ) : (
            <button type="button" className="danger" onClick={() => setConfirmingLogout(true)}>
              Log out WhatsApp…
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function HomePage({ user }: { user: SessionUser }) {
  return (
    <section className="panel">
      <h2>Welcome, {user.name}</h2>
      <p>
        The shared inbox arrives with the INB module. Until then this page only shows the connection
        banner.
      </p>
    </section>
  );
}
