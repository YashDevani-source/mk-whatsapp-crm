import { WorkerEnv, formatEnvProblems, parseEnv } from '@crm/shared';
import { packageName } from './index.ts';

// FND-01: refuse to start on bad config, naming each bad variable and never its value.
const parsed = parseEnv(WorkerEnv, process.env);
if (!parsed.ok) {
  console.error(formatEnvProblems(packageName, parsed.problems));
  process.exit(1);
}

console.log(`${packageName} started`);
// Keeps the process alive until WA adds the provider and the session lock.
setInterval(() => undefined, 60_000);
