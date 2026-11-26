import { ApiError, type Role } from '@crm/shared';
import { Router, type RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Access } from './access.ts';
import {
  createUser,
  deleteUsers,
  listRoutes,
  sessionCookie,
  testApp,
  type TestContext,
  type TestUser,
} from './test-support.ts';

const ok: RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

// Mounted only in this file's test app, never by main.ts (FND-14).
function testOnlyRouter(access: Access): Router {
  const router = Router();
  router.get('/__test/wa', access('wa.manage'), ok);
  router.get('/__test/users', access('users.manage'), ok);
  return router;
}

let production: TestContext;
let withTestRouter: TestContext;
const users: TestUser[] = [];

beforeAll(() => {
  production = testApp();
  withTestRouter = testApp({}, { extraRouters: [testOnlyRouter] });
});

afterAll(async () => {
  await deleteUsers(production.db, users);
  await production.close();
  await withTestRouter.close();
});

describe('route access', () => {
  it('FND-13 every route declares public or a permission, and only health and login are public', () => {
    const routes = listRoutes(production.app);
    const names = routes.map((r) => `${r.method} ${r.path}`);
    // Proves the walker reaches routes on a router mounted under a prefix.
    expect(names).toEqual(
      expect.arrayContaining([
        'GET /health',
        'POST /auth/login',
        'POST /auth/logout',
        'GET /auth/me',
      ]),
    );
    for (const r of routes) expect(r.access, `${r.method} ${r.path}`).toBeDefined();
    const isPublic = routes
      .filter((r) => r.access === 'public')
      .map((r) => `${r.method} ${r.path}`);
    expect(isPublic.sort()).toEqual(['GET /health', 'POST /auth/login']);
  });

  it('FND-13 the route walker reports a nested route without a guard', () => {
    const unguarded = testApp(
      {},
      {
        extraRouters: [
          () => {
            const outer = Router();
            const inner = Router();
            inner.get('/open', ok);
            outer.use('/nested', inner);
            return outer;
          },
        ],
      },
    );
    const found = listRoutes(unguarded.app).find((r) => r.path === '/nested/open');
    void unguarded.close();
    expect(found).toEqual({ method: 'GET', path: '/nested/open', access: undefined });
  });

  it('FND-14 a protected route returns 401 without a session and 403 for the wrong role', async () => {
    const cookies = {} as Record<Role, string>;
    for (const role of ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'] as const) {
      const u = await createUser(production.db, { role });
      users.push(u);
      const res = await request(withTestRouter.app)
        .post('/auth/login')
        .send({ email: u.email, password: u.password });
      cookies[role] = sessionCookie(res);
    }
    const get = (path: string, cookie?: string): request.Test => {
      const req = request(withTestRouter.app).get(path);
      return cookie === undefined ? req : req.set('Cookie', cookie);
    };

    for (const path of ['/__test/wa', '/__test/users']) {
      const anonymous = await get(path);
      expect(anonymous.status, path).toBe(401);
      expect(ApiError.parse(anonymous.body)).toBeDefined();
    }
    const expected: ReadonlyArray<[Role, string, number]> = [
      ['EMPLOYEE', '/__test/wa', 403],
      ['EMPLOYEE', '/__test/users', 403],
      ['MANAGER', '/__test/wa', 403],
      ['MANAGER', '/__test/users', 200],
      ['SUPER_ADMIN', '/__test/wa', 200],
      ['SUPER_ADMIN', '/__test/users', 200],
    ];
    for (const [role, path, status] of expected) {
      const res = await get(path, cookies[role]);
      expect(res.status, `${role} ${path}`).toBe(status);
      if (status === 403) expect(ApiError.parse(res.body)).toBeDefined();
    }

    // The app main.ts builds has no test router.
    const absent = await request(production.app)
      .get('/__test/users')
      .set('Cookie', cookies.SUPER_ADMIN);
    expect(absent.status).toBe(404);
  });
});
