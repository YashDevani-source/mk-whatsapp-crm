// Migrates crm_test once before the api tests (idempotent), so they also run on their own with
// `pnpm --filter @crm/api test`. The auth tests create their own users in it.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Same URL as test-support.ts, which is not imported here because it loads the app and vitest.
const PG_PORT = process.env['POSTGRES_PORT'] ?? '5433';
const TEST_DATABASE_URL = `postgresql://crm:crm@localhost:${PG_PORT}/crm_test`;
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export default function setup(): void {
  const r = spawnSync('pnpm', ['migrate'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    encoding: 'utf8',
    timeout: 55_000,
  });
  if (r.status !== 0) {
    throw new Error(`pnpm migrate on crm_test failed:\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  }
}
