import { createDb } from '@crm/db';
import { HealthResponse } from '@crm/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createRedis } from './redis.ts';

// Compose services (BOOT-10: tests use crm_test only). Nothing listens on port 1.
const PG_PORT = process.env['POSTGRES_PORT'] ?? '5433';
const REDIS_PORT = process.env['REDIS_PORT'] ?? '6379';
const UP_DATABASE_URL = `postgresql://crm:crm@localhost:${PG_PORT}/crm_test`;
const UP_REDIS_URL = `redis://localhost:${REDIS_PORT}`;
const DOWN_DATABASE_URL = 'postgresql://crm:crm@127.0.0.1:1/crm_test';
const DOWN_REDIS_URL = 'redis://127.0.0.1:1';

const cleanups: Array<() => Promise<void> | void> = [];

function appWith(databaseUrl: string, redisUrl: string): ReturnType<typeof createApp> {
  const db = createDb(databaseUrl);
  const redis = createRedis(redisUrl);
  cleanups.push(
    () => db.$disconnect(),
    () => redis.disconnect(),
  );
  return createApp({ db, redis });
}

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describe('GET /health', () => {
  it('FND-03 health is 200 with api, postgres and redis ok when all are reachable', async () => {
    const res = await request(appWith(UP_DATABASE_URL, UP_REDIS_URL)).get('/health');
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(res.body)).toEqual({ api: 'ok', postgres: 'ok', redis: 'ok' });
  });

  it('FND-03 health is 503 naming redis when Redis is unreachable', async () => {
    const res = await request(appWith(UP_DATABASE_URL, DOWN_REDIS_URL)).get('/health');
    expect(res.status).toBe(503);
    expect(HealthResponse.parse(res.body)).toEqual({ api: 'ok', postgres: 'ok', redis: 'down' });
  });

  it('FND-03 health is 503 naming postgres when Postgres is unreachable', async () => {
    const res = await request(appWith(DOWN_DATABASE_URL, UP_REDIS_URL)).get('/health');
    expect(res.status).toBe(503);
    expect(HealthResponse.parse(res.body)).toEqual({ api: 'ok', postgres: 'down', redis: 'ok' });
  });

  it('FND-03 health is 503 naming both when Postgres and Redis are unreachable', async () => {
    const res = await request(appWith(DOWN_DATABASE_URL, DOWN_REDIS_URL)).get('/health');
    expect(res.status).toBe(503);
    expect(HealthResponse.parse(res.body)).toEqual({
      api: 'ok',
      postgres: 'down',
      redis: 'down',
    });
  });
});
