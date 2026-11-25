import type { Db } from '@crm/db';
import { can, type ApiError, type RouteAccess, type SessionUser } from '@crm/shared';
import type { Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { SESSION_COOKIE, type AuthConfig } from './config.ts';
import { destroySession, loadSession, readCookie, verifyCookie } from './session.ts';

// Tag read by the FND-13 route walker: every route's first handler must carry it.
export const ACCESS: unique symbol = Symbol('access');

export type AccessGuard = RequestHandler & { readonly [ACCESS]: RouteAccess };
export type Access = (level: RouteAccess) => AccessGuard;

export interface AccessDeps {
  db: Db;
  redis: Redis;
  config: AuthConfig;
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

// The route guard (FND-13, FND-14). `public` passes; otherwise a valid signed cookie, a live
// Redis session and an active user are required (401), and the role must hold the permission (403).
export function createAccess({ db, redis, config }: AccessDeps): Access {
  return (level) => {
    const guard: RequestHandler = async (req, res, next) => {
      if (level === 'public') return next();

      const id = verifyCookie(readCookie(req.headers.cookie, SESSION_COOKIE), config.sessionSecret);
      const session = id === undefined ? undefined : await loadSession(redis, id);
      if (id === undefined || session === undefined) return deny(res, 401);

      // Read on every request, not cached, so deactivation applies at once (FND-11). The role
      // comes from this row, not from the session.
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, name: true, role: true, active: true },
      });
      if (!user?.active) {
        await destroySession(redis, id, session.userId);
        return deny(res, 401);
      }
      if (!can(user.role, level)) return deny(res, 403);

      authenticated.set(req, {
        user: { id: user.id, name: user.name, role: user.role },
        sessionId: id,
      });
      next();
    };
    return Object.assign(guard, { [ACCESS]: level });
  };
}
