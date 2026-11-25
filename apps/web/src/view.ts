// Pure view rules for the WA pages, tested without a browser (WA-23 to WA-25). The server enforces
// every permission; these only choose what to show.
import type { Role, WaReason, WaState } from '@crm/shared';

export type View = 'connection' | 'home';

export function viewFor(role: Role): View {
  return role === 'SUPER_ADMIN' ? 'connection' : 'home';
}

// The api answers every failed login with the same 401 (FND-08); the page does the same.
export function loginErrorText(status: number): string {
  return status === 429
    ? 'Too many attempts for this email. Try again later.'
    : 'Email or password is incorrect.';
}

export function actionErrorText(status: number): string {
  if (status === 409) return 'The connection state changed. Check the status and try again.';
  if (status === 403) return 'Only the Super Admin can do this.';
  return `The request failed (${status}).`;
}

export interface Banner {
  tone: 'ok' | 'info' | 'warn';
  text: string;
  // The Fake provider is a simulation and must say so (WA-25).
  simulated: boolean;
}

const REASONS: Partial<Record<WaReason, string>> = {
  logged_out_from_phone: 'logged out from the phone',
  logged_out_by_admin: 'logged out by the Super Admin',
  qr_timeout: 'the QR expired before it was scanned',
  session_unreadable: 'the stored session cannot be read',
  other: 'another client took over the session',
};

export function bannerText(state: WaState | undefined): Banner {
  if (!state) return { tone: 'info', text: 'Checking the WhatsApp connection…', simulated: false };
  const simulated = state.provider === 'fake';
  const banner = (tone: Banner['tone'], text: string): Banner => ({ tone, text, simulated });
  switch (state.state) {
    case 'connected':
      return banner('ok', 'WhatsApp is connected.');
    case 'connecting':
      return banner('info', 'WhatsApp is connecting…');
    case 'qr_required':
      return banner('warn', 'WhatsApp is waiting for the Super Admin to scan the QR.');
    case 'disconnected':
      return state.reason === 'worker_offline'
        ? banner('warn', 'The WhatsApp worker is offline. Messages cannot be sent or received.')
        : banner('warn', 'WhatsApp is disconnected. Reconnecting…');
    case 'reconnect_required': {
      const why = state.reason ? REASONS[state.reason] : undefined;
      return banner(
        'warn',
        `WhatsApp needs to be reconnected by the Super Admin${why ? ` (${why})` : ''}.`,
      );
    }
  }
}
