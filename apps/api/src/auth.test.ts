import { randomUUID } from 'node:crypto';
import { ApiError, SessionRecord } from '@crm/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureOutput,
  createUser,
  deleteUsers,
  sessionCookie,
  sessionIdOf,
  sessionSetCookie,
  testApp,
  type TestContext,
  type TestUser,
} from './test-support.ts';

// Everything the api sent back or printed during this file, checked by FND-18 at the end.
const output = captureOutput();
const seen: string[] = [];
function record(res: request.Response): request.Response {
  seen.push(res.text, JSON.stringify(res.headers));
  return res;
}

const contexts: TestContext[] = [];
const users: TestUser[] = [];
let ctx: TestContext;

function app(config: Parameters<typeof testApp>[0] = {}): TestContext {
  const c = testApp(config);
  contexts.push(c);
  return c;
}

async function user(role: TestUser['role'], active = true): Promise<TestUser> {
  const u = await createUser(ctx.db, { role, active });
  users.push(u);
  return u;
}

async function login(c: TestContext, email: string, password: string): Promise<request.Response> {
  return record(await request(c.app).post('/auth/login').send({ email, password }));
}

async function me(c: TestContext, cookie?: string): Promise<request.Response> {
  const req = request(c.app).get('/auth/me');
  return record(await (cookie === undefined ? req : req.set('Cookie', cookie)));
}

async function logout(c: TestContext, cookie: string): Promise<request.Response> {
  return record(await request(c.app).post('/auth/logout').set('Cookie', cookie));
}

beforeAll(() => {
  ctx = app();
});

afterAll(async () => {
  output.restore();
  await deleteUsers(ctx.db, users);
  for (const c of contexts) await c.close();
});

describe('auth routes', () => {
  it('FND-07 login sets an httpOnly SameSite cookie, stores a Redis session, returns id name role', async () => {
    const u = await user('EMPLOYEE');
    // Decision 15: the email is matched case-insensitively.
    const res = await login(ctx, u.email.toUpperCase(), u.password);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: u.id, name: u.name, role: 'EMPLOYEE' });

    const line = sessionSetCookie(res) ?? '';
    expect(line).toMatch(/;\s*HttpOnly/i);
    expect(line).toMatch(/;\s*SameSite=Strict/i);
    expect(line).not.toMatch(/;\s*Secure/i);

    const cookie = sessionCookie(res);
    const id = sessionIdOf(cookie);
    const stored = await ctx.redis.get(`sess:${id}`);
    expect(SessionRecord.parse(JSON.parse(stored ?? 'null'))).toMatchObject({
      userId: u.id,
      role: 'EMPLOYEE',
    });
    expect(await ctx.redis.ttl(`sess:${id}`)).toBeGreaterThan(0);
    expect(await ctx.redis.sismember(`user-sess:${u.id}`, id)).toBe(1);

    const again = await me(ctx, cookie);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(res.body);
  });

  it('FND-07 the session cookie is Secure when the secure cookie flag is on (production)', async () => {
    const u = await user('MANAGER');
    const res = await login(app({ secureCookie: true }), u.email, u.password);
    expect(res.status).toBe(200);
    expect(sessionSetCookie(res)).toMatch(/;\s*Secure/i);
  });

  it('FND-08 wrong password, unknown email and deactivated user return the same 401', async () => {
    const active = await user('EMPLOYEE');
    const inactive = await user('EMPLOYEE', false);
    const responses = [
      await login(ctx, active.email, 'wrong-password-123'),
      await login(ctx, `nobody-${randomUUID()}@crm.test`, active.password),
      await login(ctx, inactive.email, inactive.password),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(ApiError.parse(res.body)).toEqual(responses[0]?.body);
      expect(sessionSetCookie(res)).toBeUndefined();
    }
  });

  it('FND-09 repeated failed logins for one email return 429 without affecting other emails', async () => {
    const target = await user('EMPLOYEE');
    const bystander = await user('EMPLOYEE');
    for (let i = 0; i < 5; i++) {
      expect((await login(ctx, target.email, 'wrong-password-123')).status).toBe(401);
    }
    const blocked = await login(ctx, target.email, 'wrong-password-123');
    expect(blocked.status).toBe(429);
    expect(ApiError.parse(blocked.body)).toBeDefined();
    const blockedCorrect = await login(ctx, target.email, target.password);
    expect(blockedCorrect.status).toBe(429);
    expect(sessionSetCookie(blockedCorrect)).toBeUndefined();

    expect((await login(ctx, bystander.email, bystander.password)).status).toBe(200);
    // A success for another email does not reset the blocked one.
    expect((await login(ctx, target.email, target.password)).status).toBe(429);
  });

  it('FND-09 the failed-login counter expires after the window', async () => {
    const short = app({ loginMaxAttempts: 2, loginWindowSeconds: 1 });
    const u = await user('EMPLOYEE');
    expect((await login(short, u.email, 'wrong-password-123')).status).toBe(401);
    expect((await login(short, u.email, 'wrong-password-123')).status).toBe(401);
    expect((await login(short, u.email, u.password)).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect((await login(short, u.email, u.password)).status).toBe(200);
  });

  it('FND-10 logout deletes the Redis session and the old cookie returns 401', async () => {
    const u = await user('SUPER_ADMIN');
    const cookie = sessionCookie(await login(ctx, u.email, u.password));
    const id = sessionIdOf(cookie);

    const out = await logout(ctx, cookie);
    expect(out.status).toBe(204);
    expect(sessionSetCookie(out)).toMatch(/^crm_sid=;/);
    expect(await ctx.redis.exists(`sess:${id}`)).toBe(0);
    expect(await ctx.redis.sismember(`user-sess:${u.id}`, id)).toBe(0);

    const after = await me(ctx, cookie);
    expect(after.status).toBe(401);
    expect(ApiError.parse(after.body)).toBeDefined();
    expect((await logout(ctx, cookie)).status).toBe(401);
    expect((await me(ctx)).status).toBe(401);
  });

  it('FND-10 a session cookie with a tampered signature returns 401', async () => {
    const u = await user('EMPLOYEE');
    const cookie = sessionCookie(await login(ctx, u.email, u.password));
    const last = cookie.at(-1) === 'A' ? 'B' : 'A';
    expect((await me(ctx, `${cookie.slice(0, -1)}${last}`)).status).toBe(401);
    expect((await me(ctx, `crm_sid=${sessionIdOf(cookie)}`)).status).toBe(401);
    expect((await me(ctx, cookie)).status).toBe(200);
  });

  it('FND-11 a user set inactive is rejected with 401 on the next request', async () => {
    const u = await user('MANAGER');
    const cookie = sessionCookie(await login(ctx, u.email, u.password));
    expect((await me(ctx, cookie)).status).toBe(200);

    await ctx.db.user.update({ where: { id: u.id }, data: { active: false } });
    expect((await me(ctx, cookie)).status).toBe(401);
    expect(await ctx.redis.exists(`sess:${sessionIdOf(cookie)}`)).toBe(0);
  });

  // Last in the file: it checks everything the earlier tests received and printed.
  it('FND-18 passwords are stored as argon2 hashes and never appear in responses or logs', async () => {
    const u = await user('EMPLOYEE');
    // A malformed and a wrongly shaped body: rejected without echoing the password.
    const malformed = record(
      await request(ctx.app)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send(`{"email":"${u.email}","password":"${u.password}"`),
    );
    expect(malformed.status).toBe(400);
    const shapeless = await login(ctx, 'not-an-email', u.password);
    expect(shapeless.status).toBe(400);

    const rows = await ctx.db.user.findMany({ select: { passwordHash: true } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.passwordHash).toMatch(/^\$argon2id\$/);

    const everything = `${seen.join('\n')}\n${output.text()}`;
    expect(seen.length).toBeGreaterThan(20);
    for (const secret of [u.password, ...users.map((x) => x.passwordHash)]) {
      expect(everything).not.toContain(secret);
    }
  });
});
