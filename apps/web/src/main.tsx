import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isDemoMode } from './mode.ts';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

// DEMO-01: the flag is fixed at build time, so the other branch and its imports are dropped.
if (isDemoMode(import.meta.env)) {
  void import('./demo/main.tsx').then(({ mountDemo }) => mountDemo(root));
} else {
  void Promise.all([import('./App.tsx'), import('./styles.css')]).then(([{ App }]) => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
