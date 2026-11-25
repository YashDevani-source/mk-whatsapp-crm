import { createDb } from '@crm/db';
import { ApiEnv, formatEnvProblems, parseEnv } from '@crm/shared';
import { createApp } from './app.ts';
import { authConfigFrom } from './config.ts';
import { startEventRelay } from './events.ts';
import { packageName } from './index.ts';
import { createOutboundQueue } from './queue.ts';
import { createRedis } from './redis.ts';
import { createSockets } from './sockets.ts';

// FND-01: refuse to start on bad config, naming each bad variable and never its value.
const parsed = parseEnv(ApiEnv, process.env);
if (!parsed.ok) {
  console.error(formatEnvProblems(packageName, parsed.problems));
  process.exit(1);
}
const env = parsed.env;

// Startup does not wait for Postgres or Redis; /health reports them (FND-03).
const deps = {
  db: createDb(env.DATABASE_URL),
  redis: createRedis(env.REDIS_URL),
  config: authConfigFrom(env),
};
const { io, control } = createSockets(deps);
const app = createApp({ ...deps, sockets: control, outbound: createOutboundQueue(deps.redis) });
const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`${packageName}: cannot listen on port ${env.PORT} (${error.message})`);
    process.exit(1);
  }
  console.log(`${packageName} listening on port ${env.PORT}`);
});
io.attach(server);

// WA-15: worker events from Redis to the rooms the api chooses. A dedicated connection, because a
// subscribed client cannot run other commands.
startEventRelay(createRedis(env.REDIS_URL), io).catch((error: unknown) => {
  console.error(
    `${packageName}: event relay failed (${error instanceof Error ? error.name : typeof error})`,
  );
});
