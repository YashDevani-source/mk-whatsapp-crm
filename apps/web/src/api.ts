// Calls to the api through the Vite proxy (same origin). The session cookie is httpOnly, so the
// page never sees it; the browser sends it with every request.
import { SessionUser } from '@crm/shared';

const json = { 'Content-Type': 'application/json' };

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; status: number };

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, user: SessionUser.parse(await res.json()) };
}

// The logged-in user, or undefined when there is no valid session.
export async function currentUser(): Promise<SessionUser | undefined> {
  const res = await fetch('/auth/me');
  if (!res.ok) return undefined;
  const parsed = SessionUser.safeParse(await res.json());
  return parsed.success ? parsed.data : undefined;
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' });
}

// WA-18 and WA-19. Returns the status: 202 accepted, 409 wrong state, 403 not allowed.
export async function requestNewQr(): Promise<number> {
  return (await fetch('/wa/qr', { method: 'POST' })).status;
}

export async function logoutWhatsApp(): Promise<number> {
  return (await fetch('/wa/logout', { method: 'POST' })).status;
}
