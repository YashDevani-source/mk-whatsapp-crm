import { randomBytes } from 'node:crypto';
import { LoginRequest, type ApiError, type SessionUser } from '@crm/shared';
import argon2 from 'argon2';
import { Router, type Response } from 'express';
import { sessionOf, type Access, type AccessDeps } from './access.ts';
import { SESSION_COOKIE } from './config.ts';
import { createSession, destroySession, sessionCookieOptions } from './session.ts';

const failKey = (email: string): string => `login-fail:${email}`;

function fail(res: Response, status: 400 | 401 | 429, error: string): void {
  const body: ApiError = { error };
  res.status(status).json(body);
}

// Mounted at /auth: POST /auth/login (public), POST /auth/logout and GET /auth/me (auth.session).
export function authRouter({ db, redis, config }: AccessDeps, access: Access): Router {
  // Verified against for unknown emails, so the response time does not reveal whether an email
  // exists (FND-08).
  const dummyHash = argon2.hash(randomBytes(16).toString('hex'));
  const router = Router();

  router.post('/login', access('public'), async (req, res) => {
    const parsed = LoginRequest.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_request');
    const { email, password } = parsed.data;

    // Checked before the password, so the right password is blocked too (FND-09).
    const failures = Number((await redis.get(failKey(email))) ?? 0);
    if (failures >= config.loginMaxAttempts) return fail(res, 429, 'too_many_attempts');

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true, active: true, passwordHash: true },
    });
    const valid = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
    // Wrong password, unknown email and inactive user look the same (FND-08).
    if (!user?.active || !valid) {
      await redis
        .multi()
        .incr(failKey(email))
        .expire(failKey(email), config.loginWindowSeconds, 'NX')
        .exec();
      return fail(res, 401, 'invalid_credentials');
    }

    await redis.del(failKey(email));
    const session = await createSession(redis, config, user);
    res.cookie(SESSION_COOKIE, session.cookie, sessionCookieOptions(config));
    const body: SessionUser = { id: user.id, name: user.name, role: user.role };
    res.json(body);
  });

  router.post('/logout', access('auth.session'), async (req, res) => {
    const { user, sessionId } = sessionOf(req);
    await destroySession(redis, sessionId, user.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(config));
    res.status(204).end();
  });

  router.get('/me', access('auth.session'), (req, res) => {
    res.json(sessionOf(req).user);
  });

  return router;
}
