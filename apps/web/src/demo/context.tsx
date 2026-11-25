// The demo api, store and bus for every demo screen, and `useLive`, which loads data through the
// demo api and loads it again whenever the store changes (in this tab or another).
import type { SessionUser } from '@crm/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { DemoApi } from './api.ts';
import type { DemoBus } from './bus.ts';
import type { DemoStore } from './store.ts';

export interface DemoContextValue {
  api: DemoApi;
  store: DemoStore;
  bus: DemoBus;
  now: () => Date;
}

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

export function DemoProvider({
  value,
  children,
}: {
  value: DemoContextValue;
  children: ReactNode;
}) {
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo outside DemoProvider');
  return value;
}

// The logged-in user, for components below the shell.
const UserContext = createContext<SessionUser | undefined>(undefined);
export const UserProvider = UserContext.Provider;

export function useUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser outside the shell');
  return user;
}

// Changes every time the store is written, so effects can depend on it.
export function useStoreVersion(): number {
  const { store } = useDemo();
  const [version, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((v) => v + 1)), [store]);
  return version;
}

// The current demo data itself, for the few places that read it directly (Demo controls).
export function useStoreData<T>(select: (data: DemoStore['data']) => T): T {
  const { store } = useDemo();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  return select(useSyncExternalStore(subscribe, () => store.data));
}

export interface Live<T> {
  data: T | undefined;
  error: unknown;
  // True only until the first answer; later reloads keep the old data on screen.
  loading: boolean;
}

export function useLive<T>(load: (api: DemoApi) => Promise<T>, key: string = ''): Live<T> {
  const { api } = useDemo();
  const version = useStoreVersion();
  const [state, setState] = useState<Live<T>>({ data: undefined, error: undefined, loading: true });

  // `load` is a new function on every render; `key` names what it loads, so only a new key
  // (or a store change) loads again.
  const run = useCallback(load, [key]);

  useEffect(() => {
    let live = true;
    run(api)
      .then((data) => live && setState({ data, error: undefined, loading: false }))
      .catch((error: unknown) => live && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      live = false;
    };
  }, [api, run, version]);

  // A new key means new data: show loading again rather than the old item.
  useEffect(() => {
    setState({ data: undefined, error: undefined, loading: true });
  }, [key]);

  return state;
}
