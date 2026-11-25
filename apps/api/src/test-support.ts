// Test-only helpers for the api tests (BOOT-10: crm_test only). Never imported by app code.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDb, type Db } from '@crm/db';
import type { Role, RouteAccess } from '@crm/shared';
import argon2 from 'argon2';
import type { Express } from 'express';
import type { Redis } from 'ioredis';
import type request from 'supertest';
import { vi } from 'vitest';
import { ACCESS, type AccessGuard } from './access.ts';
import { createApp, type AppOptions } from './app.ts';
import { createOutboundQueue, type OutboundQueue } from './queue.ts';
import { SESSION_COOKIE, type AuthConfig } from './config.ts';
import { startEventRelay } from './events.ts';
import { createRedis } from './redis.ts';
import { createSockets, type CrmServer } from './sockets.ts';

const PG_PORT = process.env['POSTGRES_PORT'] ?? '5433';
const REDIS_PORT = process.env['REDIS_PORT'] ?? '6379';
export const TEST_DATABASE_URL = `postgresql://crm:crm@localhost:${PG_PORT}/crm_test`;
// Redis db 1, so test sessions and counters never land in the dev db 0.
export const TEST_REDIS_URL = `redis://localhost:${REDIS_PORT}/1`;
export const TEST_PASSWORD = 'fnd-test-password-7f3c';
export const TEST_ORIGIN = 'http://localhost:5173';

export function testConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    sessionSecret: 'fnd-test-session-secret-0123456789abcdef',
    sessionTtlSeconds: 600,
    loginMaxAttempts: 5,
    loginWindowSeconds: 60,
    secureCookie: false,
    allowedOrigins: [TEST_ORIGIN],
    ...overrides,
  };
}

export interface TestContext {
  app: Express;
  db: Db;
  redis: Redis;
  // Not attached to a server until `listen` (socket tests).
  io: CrmServer;
  // Resolves once the event relay is subscribed to `crm:events` (WA tests).
  relayReady: Promise<unknown>;
  // MSG: the real queue on Redis db 1, unless the test passed its own.
  outbound: OutboundQueue;
  close: () => Promise<void>;
}

export function testApp(
  config: Partial<AuthConfig> = {},
  options: AppOptions & { outbound?: OutboundQueue } = {},
): TestContext {
  const db = createDb(TEST_DATABASE_URL);
  const redis = createRedis(TEST_REDIS_URL);
  const outbound = options.outbound ?? createOutboundQueue(redis);
  const deps = { db, redis, config: testConfig(config) };
  const subscriber = createRedis(TEST_REDIS_URL);
  const { io, control } = createSockets(deps);
  // Most test files never wait for the relay and may close before it has subscribed. The handler
  // keeps that from becoming an unhandled rejection; `relayReady` still rejects for those that wait.
  const relayReady = startEventRelay(subscriber, io);
  relayReady.catch(() => undefined);
  return {
    app: createApp({ ...deps, sockets: control, outbound }, options),
    db,
    redis,
    io,
    relayReady,
    outbound,
    close: async () => {
      await outbound.close();
      await db.$disconnect();
      redis.disconnect();
      subscriber.disconnect();
    },
  };
}

// Serves the app and its socket server on a free local port. `close` also closes the server.
export async function listen(
  ctx: TestContext,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(ctx.app);
  ctx.io.attach(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => ctx.io.close() };
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  password: string;
  passwordHash: string;
}

// A fresh user with a random email: tests never rely on the seed, which the db tests truncate.
export async function createUser(
  db: Db,
  { role, active = true }: { role: Role; active?: boolean },
): Promise<TestUser> {
  const email = `fnd-${randomUUID()}@crm.test`;
  const name = `Test ${role}`;
  const passwordHash = await argon2.hash(TEST_PASSWORD);
  const { id } = await db.user.create({ data: { email, name, role, passwordHash, active } });
  return { id, email, name, role, password: TEST_PASSWORD, passwordHash };
}

export async function deleteUsers(db: Db, users: readonly TestUser[]): Promise<void> {
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

// The raw `Set-Cookie` line for the session cookie, if the response set one.
export function sessionSetCookie(res: request.Response): string | undefined {
  const header: unknown = res.headers['set-cookie'];
  const lines = Array.isArray(header) ? header.map(String) : [];
  return lines.find((line) => line.startsWith(`${SESSION_COOKIE}=`));
}

// `crm_sid=<value>`, ready for a `Cookie` request header.
export function sessionCookie(res: request.Response): string {
  const line = sessionSetCookie(res);
  if (line === undefined) throw new Error(`no ${SESSION_COOKIE} cookie (status ${res.status})`);
  return line.split(';')[0] ?? '';
}

// The session id inside a `crm_sid=<id>.<sig>` cookie.
export function sessionIdOf(cookie: string): string {
  return cookie.slice(`${SESSION_COOKIE}=`.length).split('.')[0] ?? '';
}

export interface RouteInfo {
  method: string;
  path: string;
  access: RouteAccess | undefined;
}

interface LayerLike {
  route?: { path: unknown; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
  handle: unknown;
  rawPath?: unknown;
}

function stackOf(handle: unknown): LayerLike[] | undefined {
  if (typeof handle !== 'function') return undefined;
  const stack: unknown = (handle as { stack?: unknown }).stack;
  return Array.isArray(stack) ? (stack as LayerLike[]) : undefined;
}

function accessOf(handle: unknown): RouteAccess | undefined {
  return typeof handle === 'function' ? (handle as Partial<AccessGuard>)[ACCESS] : undefined;
}

// Every route on the app, including routes on mounted routers, with the access its first handler
// declares (FND-13). Reads Express 5 internals: `app.router` and the router 2.x `rawPath`.
export function listRoutes(app: Express): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const walk = (stack: readonly LayerLike[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({
            method: method.toUpperCase(),
            path: `${prefix}${String(layer.route.path)}`,
            access: accessOf(layer.route.stack[0]?.handle),
          });
        }
        continue;
      }
      const nested = stackOf(layer.handle);
      if (nested) {
        const mount =
          typeof layer.rawPath === 'string' && layer.rawPath !== '/' ? layer.rawPath : '';
        walk(nested, `${prefix}${mount}`);
      }
    }
  };
  const root = stackOf((app as unknown as { router: unknown }).router);
  if (!root) throw new Error('app.router has no stack: Express internals changed');
  walk(root, '');
  return routes;
}

// Collects everything written to the console or stdout/stderr until `restore` (FND-18).
export function captureOutput(): { text: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spies = [
    ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        chunks.push(args.map(String).join(' '));
      }),
    ),
    ...[process.stdout, process.stderr].map((stream) => {
      const original = stream.write.bind(stream);
      return vi.spyOn(stream, 'write').mockImplementation((chunk: unknown, ...rest: unknown[]) => {
        chunks.push(String(chunk));
        return (original as (...a: unknown[]) => boolean)(chunk, ...rest);
      });
    }),
  ];
  return {
    text: () => chunks.join('\n'),
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}
