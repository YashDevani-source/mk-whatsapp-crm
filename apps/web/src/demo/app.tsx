// The demo app: router, login gate, shell (sidebar, top bar, WhatsApp banner) and the page guard
// (DEMO-02, DEMO-08, DEMO-09). The demo api enforces every rule; the guard only mirrors it.
import type { SessionUser } from '@crm/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router';
import { bannerText } from '../view.ts';
import { canOpen, landingPath, navFor, PAGES, type PageKey } from './access.ts';
import { UserProvider, useDemo, useLive, useUser } from './context.tsx';
import { formatPhone } from './format.ts';
import { LoginPage } from './login.tsx';
import { DEMO_COMPANY } from './seed.ts';
import { Avatar, Empty, NoAccess, PageHeader, RoleBadge, Skeleton, Tag } from './ui.tsx';

export function DemoApp() {
  const { api } = useDemo();
  // undefined while the session is checked, null when logged out.
  const [user, setUser] = useState<SessionUser | null>();

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, [api]);

  if (user === undefined) {
    return (
      <div className="boot">
        <Skeleton rows={3} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={landingPath(user.role)} replace />
            ) : (
              <LoginPage onLogin={setUser} />
            )
          }
        />
        <Route
          element={
            user ? (
              <UserProvider value={user}>
                <Shell onLogout={() => setUser(null)} />
              </UserProvider>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={user ? <Navigate to={landingPath(user.role)} replace /> : null} />
          {(Object.keys(PAGES) as PageKey[]).map((page) => (
            <Route
              key={page}
              path={`${PAGES[page].path}/*`}
              element={<Guard page={page}>{PAGE_ELEMENTS[page]}</Guard>}
            />
          ))}
          <Route path="*" element={<Empty title="Page not found" hint="Use the sidebar." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Filled in by later phases; each shows what it will hold until then.
const PAGE_ELEMENTS: Readonly<Record<PageKey, ReactNode>> = {
  dashboard: <Placeholder page="dashboard" phase={4} />,
  home: <Placeholder page="home" phase={4} />,
  inbox: <Placeholder page="inbox" phase={2} />,
  leads: <Placeholder page="leads" phase={3} />,
  properties: <Placeholder page="properties" phase={3} />,
  followUps: <Placeholder page="followUps" phase={3} />,
  campaigns: <Placeholder page="campaigns" phase={4} />,
  users: <Placeholder page="users" phase={4} />,
  reports: <Placeholder page="reports" phase={4} />,
  audit: <Placeholder page="audit" phase={4} />,
  whatsapp: <Placeholder page="whatsapp" phase={2} />,
};

function Placeholder({ page, phase }: { page: PageKey; phase: number }) {
  return (
    <>
      <PageHeader title={PAGES[page].label} />
      <Empty
        title="This screen is not built yet"
        hint={`It arrives in phase ${phase} of the demo build (docs/specs/004-demo.md).`}
      />
    </>
  );
}

function Guard({ page, children }: { page: PageKey; children: ReactNode }) {
  const user = useUser();
  return canOpen(user.role, page) ? children : <NoAccess />;
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { api } = useDemo();
  const user = useUser();
  const navigate = useNavigate();

  async function logout(): Promise<void> {
    await api.logout().catch(() => undefined);
    onLogout();
    void navigate('/login');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark small" aria-hidden="true">
            SR
          </span>
          <span>
            <strong>{DEMO_COMPANY}</strong>
            <span className="brand-sub">CRM</span>
          </span>
        </div>
        <nav aria-label="Main">
          {navFor(user.role).map((page) => (
            <NavLink
              key={page}
              to={PAGES[page].path}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              {PAGES[page].label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <Tag>Demo · simulated</Tag>
          <div className="topbar-user">
            <Avatar name={user.name} size="sm" />
            <span>{user.name}</span>
            <RoleBadge role={user.role} />
            <button type="button" className="btn btn-small" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </header>
        <WaBanner />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// The WhatsApp banner every user sees (design prompt E2). Always tagged Simulated in demo mode.
function WaBanner() {
  const wa = useLive((api) => api.getWa(), 'wa');
  if (!wa.data) return <div className="banner banner-info">Checking the WhatsApp connection…</div>;
  const banner = bannerText(wa.data.state);
  const connected = wa.data.state.state === 'connected';
  return (
    <div className={`banner banner-${banner.tone}${connected ? ' compact' : ''}`} role="status">
      <Tag>Simulated</Tag>
      <span>
        {banner.text}
        {connected && wa.data.number && <> · {formatPhone(wa.data.number)}</>}
      </span>
    </div>
  );
}
