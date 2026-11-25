import type { SessionUser } from '@crm/shared';
import { useEffect, useState } from 'react';
import { currentUser, logout } from './api.ts';
import { Banner, ConnectionPage, HomePage, LoginPage } from './pages.tsx';
import { useWhatsApp } from './useWhatsApp.ts';
import { viewFor } from './view.ts';

// Two views chosen by the logged-in user's role (WA Decision 3). The api enforces every
// permission; this only decides what to show.
export function App() {
  // undefined while the session is checked, null when logged out.
  const [user, setUser] = useState<SessionUser | null>();

  useEffect(() => {
    currentUser()
      .then((u) => setUser(u ?? null))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p className="loading">Loading…</p>;
  if (user === null) return <LoginPage onLogin={setUser} />;
  return <Shell user={user} onLogout={() => setUser(null)} />;
}

function Shell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { state, qr } = useWhatsApp();

  async function signOut(): Promise<void> {
    await logout().catch(() => undefined);
    onLogout();
  }

  return (
    <>
      <header className="top">
        <strong>MK CRM</strong>
        <span>
          {user.name} · {user.role.replace('_', ' ').toLowerCase()}
        </span>
        <button type="button" onClick={() => void signOut()}>
          Log out
        </button>
      </header>
      <Banner state={state} />
      <main>
        {viewFor(user.role) === 'connection' ? (
          <ConnectionPage state={state} qr={qr} />
        ) : (
          <HomePage user={user} />
        )}
      </main>
    </>
  );
}
