// The demo entry (DEMO-01): builds the store, bus and demo api in the browser and renders the
// demo app. Nothing here talks to the api server.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDemoApi, type SessionSlot } from './api.ts';
import { DemoApp } from './app.tsx';
import { DemoBus } from './bus.ts';
import { DemoProvider } from './context.tsx';
import { buildSeed } from './seed.ts';
import { setVisibilityCheck, startSimulator } from './sim.ts';
import { DemoStore, STORAGE_KEY } from './store.ts';
import './demo.css';

const SESSION_KEY = 'crm-demo-session';

// Per tab, so two windows can be two users (DEMO-07).
const session: SessionSlot = {
  get: () => sessionStorage.getItem(SESSION_KEY),
  set: (id) =>
    id === null ? sessionStorage.removeItem(SESSION_KEY) : sessionStorage.setItem(SESSION_KEY, id),
};

// The tab title and icon for demo mode, set here so the live app's index.html stays as it is.
function brandTab(): void {
  document.title = 'Skyline Realty CRM · Demo';
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#3b5bdb"/><text x="16" y="21" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="white" text-anchor="middle">SR</text></svg>',
  )}`;
  document.head.append(icon);
}

export function mountDemo(root: HTMLElement): void {
  brandTab();
  const now = (): Date => new Date();
  const store = new DemoStore(localStorage, () => buildSeed(now()));
  const bus = new DemoBus('crm-demo');
  const api = createDemoApi({ store, bus, session, now });

  // Every tab runs the simulator; a task still runs once (DEMO Decision 19).
  setVisibilityCheck(() => document.visibilityState === 'visible');
  startSimulator({ store, bus, now });

  // Another tab changed the data: take its copy, so both windows show the same inbox. The
  // `storage` event is fast; the 1 s check covers tabs that miss it (DEMO Decision 21).
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) store.sync();
  });
  setInterval(() => store.sync(), 1000);
  bus.onRemote(() => store.sync());

  createRoot(root).render(
    <StrictMode>
      <DemoProvider value={{ api, store, bus, now }}>
        <DemoApp />
      </DemoProvider>
    </StrictMode>,
  );
}
