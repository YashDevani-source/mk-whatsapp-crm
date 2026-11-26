// DEMO-36: the light theme (default) and the dark one. The choice is kept per browser; with storage
// blocked (private window, blocked site data) the page still works and the toggle lasts the tab.
import type { KeyValueStorage } from './store.ts';

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'crm-demo-theme';

export function readTheme(storage: Pick<KeyValueStorage, 'getItem'> | undefined): Theme {
  try {
    return storage?.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(
  storage: Pick<KeyValueStorage, 'setItem'> | undefined,
  theme: Theme,
): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // Not saved: the theme still applies to this tab.
  }
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

// The page reads the theme from `data-theme` on <html> (demo.css).
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

// `localStorage` itself can throw when site data is blocked.
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
