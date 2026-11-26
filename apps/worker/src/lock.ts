// The single-session lock (WA-02 to WA-05): `wa:lock` holds the owner's worker id with a TTL.
// Refresh and release check the owner first, in one Lua script each, so a worker never extends
// or deletes a lock another worker has taken over.
import { WA_REDIS } from '@crm/shared';
import type { Redis } from 'ioredis';

// Extends the lock and the state key together: the state key expiring means the worker is gone.
const REFRESH = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('pexpire', KEYS[1], ARGV[2])
  redis.call('pexpire', KEYS[2], ARGV[2])
  return 1
end
return 0`;

const RELEASE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export interface WaLock {
  acquire(): Promise<boolean>;
  // False when the lock is gone or owned by another worker.
  refresh(): Promise<boolean>;
  release(): Promise<void>;
}

export function createLock(redis: Redis, workerId: string, ttlMs: number): WaLock {
  return {
    acquire: async () => (await redis.set(WA_REDIS.lock, workerId, 'PX', ttlMs, 'NX')) === 'OK',
    refresh: async () =>
      (await redis.eval(REFRESH, 2, WA_REDIS.lock, WA_REDIS.state, workerId, ttlMs)) === 1,
    release: async () => {
      await redis.eval(RELEASE, 1, WA_REDIS.lock, workerId);
    },
  };
}
