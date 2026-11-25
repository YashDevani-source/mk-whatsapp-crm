import type { Db } from '@crm/db';
import { can, type ApiError, type RouteAccess, type SessionUser } from '@crm/shared';
import type { Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { SESSION_COOKIE, type AuthConfig } from './config.ts';
import { destroyUserSessions, loadSession, readCookie, verifyCookie } from './session.ts';
import type { SocketControl } from './sockets.ts';

// Tag read by the FND-13 route walker: every route's first handler must carry it.
export const ACCESS: unique symbol = Symbol('access');

export type AccessGuard = RequestHandler & { readonly [ACCESS]: RouteAccess };
export type Access = (level: RouteAccess) => AccessGuard;

export interface CoreDeps {
  db: Db;
  redis: Redis;
  config: AuthConfig;
}

export interface AccessDeps extends CoreDeps {
  sockets: SocketControl;
}

export interface Authenticated {
  user: SessionUser;
  sessionId: string;
}

// Set by the guard for requests that passed a non-public check.
const authenticated = new WeakMap<Request, Authenticated>();

export function sessionOf(req: Request): Authenticated {
  const session = authenticated.get(req);
  if (!session) throw new Error('sessionOf called on a route without a session guard');
  return session;
}

function deny(res: Response, status: 401 | 403): void {
  const body: ApiError = { error: status === 401 ? 'unauthenticated' : 'forbidden' };
  res.status(status).json(body);
}

// The active user behind a session id, or undefined. The user is read on every call, not cached,
// so deactivation applies at once (FND-11), and the role comes from this row, not from the
// session. An inactive or deleted user has all their sessions ended and sockets disconnected
// (FND-20).
export async function checkSession(
  { db, redis, sockets }: AccessDeps,
  sessionId: string,
): Promise<Authenticated | undefined> {
  const session = await loadSession(redis, sessionId);
  if (session === undefined) return undefined;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!user?.active) {
    await destroyUserSessions(redis, session.userId);
    await sockets.endUser(session.userId);
    return undefined;
  }
  return { user: { id: user.id, name: user.name, role: user.role }, sessionId };
}

// The active user behind a `Cookie` header, for HTTP requests and the socket handshake.
export async function authenticate(
  deps: AccessDeps,
  cookieHeader: string | undefined,
): Promise<Authenticated | undefined> {
  const id = verifyCookie(readCookie(cookieHeader, SESSION_COOKIE), deps.config.sessionSecret);
  return id === undefined ? undefined : checkSession(deps, id);
}

// The route guard (FND-13, FND-14). `public` passes; otherwise a valid signed cookie, a live
// Redis session and an active user are required (401), and the role must hold the permission (403).
export function createAccess(deps: AccessDeps): Access {
  return (level) => {
    const guard: RequestHandler = async (req, res, next) => {
      if (level === 'public') return next();

      const session = await authenticate(deps, req.headers.cookie);
      if (session === undefined) return deny(res, 401);
      if (!can(session.user.role, level)) return deny(res, 403);

      authenticated.set(req, session);
      next();
    };
    return Object.assign(guard, { [ACCESS]: level });
  };
}
