import { Redis } from 'ioredis';

// Fails a command after one retry instead of queueing it forever, so /health can report
// `down` (FND-03). Errors are logged by code only: the URL may hold a password.
export function createRedis(url: string): Redis {
  const redis = new Redis(url, { connectTimeout: 2_000, maxRetriesPerRequest: 1 });
  let reported = false;
  redis.on('error', (error: NodeJS.ErrnoException) => {
    if (reported) return;
    reported = true;
    console.error(`redis: connection error (${error.code ?? error.name})`);
  });
  redis.on('ready', () => {
    reported = false;
  });
  return redis;
}
