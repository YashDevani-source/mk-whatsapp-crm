// Server-side sessions in Redis (FND Decision 10). `sess:<id>` holds a SessionRecord;
// `user-sess:<userId>` is the set of that user's session ids, so all of them can be ended (FND-20).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SessionRecord, type Role } from '@crm/shared';
import type { CookieOptions } from 'express';
import type { Redis } from 'ioredis';
import type { AuthConfig } from './config.ts';

const sessionKey = (id: string): string => `sess:${id}`;
const userSessionsKey = (userId: string): string => `user-sess:${userId}`;

function sign(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

// The value of one cookie in a `Cookie` request header, or undefined.
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// The session id from a signed `<id>.<sig>` cookie value, or undefined if the signature is wrong.
export function verifyCookie(value: string | undefined, secret: string): string | undefined {
  const [id, sig, ...rest] = (value ?? '').split('.');
  if (!id || !sig || rest.length > 0) return undefined;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : undefined;
}

export function sessionCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookie,
    path: '/',
    maxAge: config.sessionTtlSeconds * 1_000,
  };
}

// Stores a new session and returns the signed cookie value.
export async function createSession(
  redis: Redis,
  config: AuthConfig,
  user: { id: string; role: Role },
): Promise<{ id: string; cookie: string }> {
  const id = randomBytes(32).toString('base64url');
  const record: SessionRecord = { userId: user.id, role: user.role, createdAt: Date.now() };
  await redis
    .multi()
    .set(sessionKey(id), JSON.stringify(record), 'EX', config.sessionTtlSeconds)
    .sadd(userSessionsKey(user.id), id)
    .expire(userSessionsKey(user.id), config.sessionTtlSeconds)
    .exec();
  return { id, cookie: `${id}.${sign(id, config.sessionSecret)}` };
}

export async function loadSession(redis: Redis, id: string): Promise<SessionRecord | undefined> {
  const raw = await redis.get(sessionKey(id));
  if (raw === null) return undefined;
  const parsed = SessionRecord.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
}

export async function destroySession(redis: Redis, id: string, userId: string): Promise<void> {
  await redis.multi().del(sessionKey(id)).srem(userSessionsKey(userId), id).exec();
}
