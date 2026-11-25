// Small shared pieces of the demo design system: tags, badges, page header, empty, loading and
// error states.
import type { Role } from '@crm/shared';
import { useEffect, type ReactNode } from 'react';
import { DemoApiError, type DemoErrorCode } from './api.ts';
import { initials } from './format.ts';

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

// Neutral grey, never confused with a real status (design prompt Part F).
export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge role-${role.toLowerCase()}`}>{ROLE_LABELS[role]}</span>;
}

export type Tone = 'ok' | 'info' | 'warn' | 'error' | 'neutral';

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {hint && <p className="muted">{hint}</p>}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

const ERROR_TEXT: Readonly<Record<DemoErrorCode, string>> = {
  invalid_credentials: 'Email or password is incorrect.',
  unauthenticated: 'Your session has ended. Log in again.',
  forbidden: "You don't have access to this.",
  not_found: 'This item does not exist or is not assigned to you.',
  invalid_body: 'Some fields are not valid. Check them and try again.',
  wrong_state: 'The state changed in the meantime. Check it and try again.',
  wa_not_connected: 'WhatsApp is not connected. Try again when the banner is green.',
  reply_locked: 'Someone else is replying in this chat.',
  already_sent: 'Already sent.',
};

export function errorText(error: unknown): string {
  if (error instanceof DemoApiError) return ERROR_TEXT[error.code];
  return 'Something went wrong. Reload the page to try again.';
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p className="error-note" role="alert">
      {errorText(error)}
    </p>
  );
}

export function NoAccess() {
  return (
    <div className="no-access">
      <h1>You don't have access to this page</h1>
      <p className="muted">Ask a Manager or the Super Admin if you think you should.</p>
    </div>
  );
}

export function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
