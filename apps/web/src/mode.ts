// DEMO-01: demo mode is chosen at build time, by `vite --mode demo` or `VITE_DEMO=1`
// (DEMO Decision 2). Anything else is the live app.
export function isDemoMode(env: { MODE?: unknown; VITE_DEMO?: unknown }): boolean {
  return env.MODE === 'demo' || env.VITE_DEMO === '1';
}
