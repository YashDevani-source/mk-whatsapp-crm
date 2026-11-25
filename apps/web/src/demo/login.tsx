// DEMO-06: the demo login page, with the demo accounts and a one-click "Log in as".
import type { SessionUser } from '@crm/shared';
import { useState, type FormEvent } from 'react';
import { useDemo } from './context.tsx';
import { DEMO_COMPANY, DEMO_PASSWORD } from './seed.ts';
import { Avatar, errorText, RoleBadge, Tag } from './ui.tsx';

export function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { api } = useDemo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

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
      <section className="login-card">
        <div className="brand-mark" aria-hidden="true">
          SR
        </div>
        <h1>{DEMO_COMPANY} CRM</h1>
        <p className="muted">
          One WhatsApp number, one shared inbox. <Tag>Demo · simulated</Tag>
        </p>
        <form onSubmit={submit} className="form">
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
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </section>

      <section className="accounts-card" aria-label="Demo accounts">
        <h2>Demo accounts</h2>
        <p className="muted">
          Every account uses the password <code>{DEMO_PASSWORD}</code>. Open a second window to be
          two people at once.
        </p>
        <ul className="accounts">
          {api.demoAccounts().map((account) => (
            <li key={account.email} className={account.active ? '' : 'inactive'}>
              <Avatar name={account.name} />
              <div className="account-who">
                <strong>{account.name}</strong>
                <span className="muted">{account.email}</span>
              </div>
              <RoleBadge role={account.role} />
              {account.active ? (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  onClick={() => void attempt(account.email, DEMO_PASSWORD)}
                >
                  Log in as
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  title="Deactivated users cannot log in"
                  onClick={() => void attempt(account.email, DEMO_PASSWORD)}
                >
                  Try (deactivated)
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
