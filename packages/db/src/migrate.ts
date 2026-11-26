import { MigrateEnv, formatEnvProblems, parseEnv } from '@crm/shared';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// FND-04: `prisma migrate deploy` applies pending migrations without prompting, and a second run
// applies nothing. The env is checked first, so a bad URL is named but never printed (FND-01).
const parsed = parseEnv(MigrateEnv, process.env);
if (!parsed.ok) {
  console.error(formatEnvProblems('migrate', parsed.problems));
  process.exit(1);
}

// Runs under `pnpm migrate`, which puts this package's `prisma` bin on PATH. prisma.config.ts
// reads DATABASE_URL from the inherited environment.
const r = spawnSync('prisma', ['migrate', 'deploy'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
});
if (r.error) {
  console.error(`migrate: cannot run prisma (${r.error.message})`);
  process.exit(1);
}
process.exit(r.status ?? 1);
