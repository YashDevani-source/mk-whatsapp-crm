// Toasts: new customer messages the user may see (DEMO-15), connection changes, and action
// errors. Live events come from the demo bus, also from other tabs.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useDemo } from './context.tsx';
import { formatPhone } from './format.ts';

export interface Toast {
  id: number;
  tone: 'ok' | 'info' | 'warn' | 'error';
  title: string;
  body?: string;
  to?: string;
}

type Push = (toast: Omit<Toast, 'id'>) => void;

const ToastContext = createContext<Push>(() => undefined);

export function useToast(): Push {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastHost({ children }: { children: ReactNode }) {
  const { api, bus } = useDemo();
  const location = useLocation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<Push>((toast) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000);
  }, []);

  const path = location.pathname;
  useEffect(() => {
    const offMessage = bus.on('message.created', (message) => {
      if (message.direction !== 'inbound' || path === `/inbox/${message.conversationId}`) return;
      // Only for chats this user may see: the demo api answers "not found" otherwise.
      api
        .getConversation(message.conversationId)
        .then((c) =>
          push({
            tone: 'info',
            title: `New message from ${c.contact.name ?? formatPhone(c.contact.phone)}`,
            body: message.body ?? 'Unsupported message',
            to: `/inbox/${c.id}`,
          }),
        )
        .catch(() => undefined);
    });
    const offState = bus.on('wa.state', (state) => {
      if (state.state === 'disconnected') {
        push({
          tone: 'warn',
          title: 'WhatsApp disconnected',
          body: 'Replies are paused until it reconnects.',
        });
      }
      if (state.state === 'connected') push({ tone: 'ok', title: 'WhatsApp connected' });
    });
    return () => {
      offMessage();
      offState();
    };
  }, [api, bus, path, push]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <strong>{t.title}</strong>
            {t.body && <span className="toast-body">{t.body}</span>}
            {t.to && (
              <Link
                to={t.to}
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              >
                Open chat
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
