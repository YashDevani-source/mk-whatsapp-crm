// The demo entry (DEMO-01): builds the store, bus and demo api in the browser and renders the
// demo app. Nothing here talks to the api server.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDemoApi, type SessionSlot } from './api.ts';
import { DemoApp } from './app.tsx';
import { DemoBus } from './bus.ts';
import { DemoProvider } from './context.tsx';
import { buildSeed } from './seed.ts';
import { DemoStore, STORAGE_KEY } from './store.ts';
import './demo.css';

const SESSION_KEY = 'crm-demo-session';

// Per tab, so two windows can be two users (DEMO-07).
const session: SessionSlot = {
  get: () => sessionStorage.getItem(SESSION_KEY),
  set: (id) =>
    id === null ? sessionStorage.removeItem(SESSION_KEY) : sessionStorage.setItem(SESSION_KEY, id),
};

export function mountDemo(root: HTMLElement): void {
  const now = (): Date => new Date();
  const store = new DemoStore(localStorage, () => buildSeed(now()));
  const bus = new DemoBus('crm-demo');
  const api = createDemoApi({ store, bus, session, now });

  // Another tab changed the data: take its copy, so both windows show the same inbox.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) store.reload();
  });

  createRoot(root).render(
    <StrictMode>
      <DemoProvider value={{ api, store, bus, now }}>
        <DemoApp />
      </DemoProvider>
    </StrictMode>,
  );
}
