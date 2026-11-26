// DEMO-06: the demo login page, with the demo accounts and a one-click "Log in as".
// Layout: one framed split, the Skyline artwork on the left and the amber login card over it.
import type { SessionUser } from '@crm/shared';
import { useState, type FormEvent } from 'react';
import { useDemo } from './context.tsx';
import { DEMO_COMPANY, DEMO_PASSWORD } from './seed.ts';
import { Icon } from './icons.tsx';
import { LoginArt } from './login-art.tsx';
import { Avatar, errorText, Modal, ROLE_LABELS, Tag } from './ui.tsx';

export function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { api } = useDemo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);

  async function attempt(e: string, p: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      onLogin(await api.login(e, p));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    void attempt(email, password);
  }

  return (
    <div className="login-page">
      <div className="login-frame">
        <LoginArt />
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-brand">
            <span className="brand-mark small" aria-hidden="true">
              SR
            </span>
            <span>{DEMO_COMPANY} CRM</span>
            <Tag>Demo · simulated</Tag>
          </div>
          <h1 id="login-title">Log in to continue</h1>
          <p className="login-lede">One WhatsApp number, one shared inbox for the whole team.</p>

          <form onSubmit={submit} className="login-form">
            <label className="login-field">
              <span>Email</span>
              <span className="login-pill">
                <Icon name="mail" size={18} />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="name@skyline.test"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>
            <label className="login-field">
              <span>Password</span>
              <span className="login-pill">
                <Icon name="lock" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Your password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </span>
            </label>
            <div className="login-row">
              <button
                type="button"
                className="login-text-btn"
                aria-expanded={showHint}
                onClick={() => setShowHint((shown) => !shown)}
              >
                Forgot password?
              </button>
            </div>
            {showHint && (
              <p className="login-hint">
                Every demo account uses the password <code>{DEMO_PASSWORD}</code>.
              </p>
            )}
            {error && (
              <p className="error-note" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <section className="login-accounts" aria-labelledby="login-accounts-title">
            <h2 id="login-accounts-title">or log in as a demo user</h2>
            <ul>
              {api.demoAccounts().map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    className={account.active ? 'login-account' : 'login-account inactive'}
                    disabled={busy}
                    title={
                      account.active
                        ? `Log in as ${account.name}`
                        : 'Deactivated users cannot log in'
                    }
                    onClick={() => void attempt(account.email, DEMO_PASSWORD)}
                  >
                    <Avatar name={account.name} size="sm" />
                    <span className="login-account-who">
                      <strong>{account.name}</strong>
                      <span>{account.active ? ROLE_LABELS[account.role] : 'Deactivated'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <p className="login-foot">
            Data is kept in this browser. Open a second window to be two people at once.{' '}
            <button type="button" className="login-text-btn" onClick={() => setConfirmReset(true)}>
              Reset demo data
            </button>
            {resetDone && ' · Done: the original data is back.'}
          </p>
        </section>
      </div>
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
                  setResetDone(true);
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
