import type { Db } from '@crm/db';
import type { DependencyStatus, HealthResponse } from '@crm/shared';
import { Router } from 'express';
import type { Redis } from 'ioredis';
import type { Access } from './access.ts';

// Upper bound for each dependency check, so a hung dependency still yields a 503.
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export interface HealthDeps {
  db: Db;
  redis: Redis;
}

async function probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), HEALTH_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth({ db, redis }: HealthDeps): Promise<HealthResponse> {
  const [postgres, redisStatus] = await Promise.all([
    probe(() => db.$queryRaw`SELECT 1`),
    probe(() => redis.ping()),
  ]);
  return { api: 'ok', postgres, redis: redisStatus };
}

// GET /health (FND-03): 200 when every dependency is ok, otherwise 503 naming the down ones.
// Public (FND-13).
export function healthRouter(deps: HealthDeps, access: Access): Router {
  const router = Router();
  router.get('/health', access('public'), async (_req, res) => {
    const body = await checkHealth(deps);
    const allOk = body.postgres === 'ok' && body.redis === 'ok';
    res.status(allOk ? 200 : 503).json(body);
  });
  return router;
}
