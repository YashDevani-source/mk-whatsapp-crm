// The demo app: router, login gate, shell (sidebar, top bar, WhatsApp banner) and the page guard
// (DEMO-02, DEMO-08, DEMO-09). The demo api enforces every rule; the guard only mirrors it.
import type { SessionUser } from '@crm/shared';
import { useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { bannerText } from '../view.ts';
import { canOpen, landingPath, navFor, pageForPath, PAGES, type PageKey } from './access.ts';
import { UserProvider, useDemo, useLive, useUser } from './context.tsx';
import { DemoControls } from './controls.tsx';
import { formatPhone } from './format.ts';
import { FollowUpsPage } from './followups-page.tsx';
import { InboxPage } from './inbox-page.tsx';
import { LeadsPage } from './leads-page.tsx';
import { LoginPage } from './login.tsx';
import { PropertiesPage } from './properties-page.tsx';
import { DEMO_COMPANY } from './seed.ts';
import { ToastHost } from './toasts.tsx';
import { Avatar, Empty, NoAccess, PageHeader, RoleBadge, Skeleton, Tag } from './ui.tsx';
import { WhatsAppPage } from './whatsapp-page.tsx';

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
  inbox: <InboxPage />,
  leads: <LeadsPage />,
  properties: <PropertiesPage />,
  followUps: <FollowUpsPage />,
  campaigns: <Placeholder page="campaigns" phase={4} />,
  users: <Placeholder page="users" phase={4} />,
  reports: <Placeholder page="reports" phase={4} />,
  audit: <Placeholder page="audit" phase={4} />,
  whatsapp: <WhatsAppPage />,
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
  const location = useLocation();
  const [controlsOpen, setControlsOpen] = useState(false);
  const chats = useLive((a) => a.listConversations(), 'conversations');
  const unread = (chats.data ?? []).filter((c) => c.unreadCount > 0).length;
  const flush = pageForPath(location.pathname) === 'inbox';

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
              {page === 'inbox' && unread > 0 && (
                <span className="nav-badge" aria-label={`${unread} chats with unread messages`}>
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="btn btn-demo" onClick={() => setControlsOpen(true)}>
            Demo controls
          </button>
          <span className="muted small">Simulate customers, agents and drops.</span>
        </div>
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
        <ToastHost>
          <main className={flush ? 'content flush' : 'content'}>
            <Outlet />
          </main>
          {controlsOpen && <DemoControls onClose={() => setControlsOpen(false)} />}
        </ToastHost>
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
