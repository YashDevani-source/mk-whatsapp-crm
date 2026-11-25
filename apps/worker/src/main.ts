import { createDb } from '@crm/db';
import { WorkerEnv, formatEnvProblems, parseEnv } from '@crm/shared';
import { startWaWorker } from './connection.ts';
import { keyFromHex } from './crypto.ts';
import { packageName } from './index.ts';
import { createProvider } from './providers/index.ts';
import { createRedis } from './redis.ts';
import { createSessionStore } from './session-store.ts';

// FND-01: refuse to start on bad config, naming each bad variable and never its value.
const parsed = parseEnv(WorkerEnv, process.env);
if (!parsed.ok) {
  console.error(formatEnvProblems(packageName, parsed.problems));
  process.exit(1);
}
const env = parsed.env;

console.log(`${packageName} started`);

const db = createDb(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);
const subscriber = createRedis(env.REDIS_URL);
const provider = await createProvider(env.WHATSAPP_PROVIDER);
const worker = startWaWorker({
  db,
  redis,
  subscriber,
  provider,
  store: createSessionStore(db, keyFromHex(env.SESSION_ENCRYPTION_KEY), provider.name),
  config: {
    lockTtlMs: env.WA_LOCK_TTL_MS,
    reconnectBaseMs: env.WA_RECONNECT_BASE_MS,
    reconnectMaxMs: env.WA_RECONNECT_MAX_MS,
  },
});

// WA-05: close WhatsApp without logging out and hand the lock over at once.
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await worker.stop();
  await db.$disconnect();
  redis.disconnect();
  subscriber.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
