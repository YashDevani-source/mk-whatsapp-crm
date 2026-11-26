import type { SessionUser } from '@crm/shared';
import { useEffect, useState } from 'react';
import { currentUser, logout } from './api.ts';
import { MessagesPage } from './messages-page.tsx';
import { Banner, ConnectionPage, HomePage, LoginPage } from './pages.tsx';
import { useSocket, useWhatsApp } from './useWhatsApp.ts';
import { tabsFor, viewFor, type View } from './view.ts';

// The pages chosen by the logged-in user's role (WA Decision 3, MSG-24). The api enforces every
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

const TAB_NAMES: Record<View, string> = {
  connection: 'Connection',
  messages: 'Messages',
  home: 'Home',
};

function Shell({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const socket = useSocket();
  const { state, qr } = useWhatsApp(socket);
  const tabs = tabsFor(user.role);
  const [view, setView] = useState<View>(viewFor(user.role));

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
      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={t === view ? 'tab active' : 'tab'}
              onClick={() => setView(t)}
            >
              {TAB_NAMES[t]}
            </button>
          ))}
        </nav>
      )}
      <main>
        {view === 'connection' && <ConnectionPage state={state} qr={qr} />}
        {view === 'messages' && <MessagesPage socket={socket} state={state} />}
        {view === 'home' && <HomePage user={user} />}
      </main>
    </>
  );
}
