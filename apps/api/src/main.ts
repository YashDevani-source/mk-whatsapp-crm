import { createDb } from '@crm/db';
import { ApiEnv, formatEnvProblems, parseEnv } from '@crm/shared';
import { createApp } from './app.ts';
import { authConfigFrom } from './config.ts';
import { packageName } from './index.ts';
import { createRedis } from './redis.ts';

// FND-01: refuse to start on bad config, naming each bad variable and never its value.
const parsed = parseEnv(ApiEnv, process.env);
if (!parsed.ok) {
  console.error(formatEnvProblems(packageName, parsed.problems));
  process.exit(1);
}
const env = parsed.env;

// Startup does not wait for Postgres or Redis; /health reports them (FND-03).
const app = createApp({
  db: createDb(env.DATABASE_URL),
  redis: createRedis(env.REDIS_URL),
  config: authConfigFrom(env),
});
app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`${packageName}: cannot listen on port ${env.PORT} (${error.message})`);
    process.exit(1);
  }
  console.log(`${packageName} listening on port ${env.PORT}`);
});
