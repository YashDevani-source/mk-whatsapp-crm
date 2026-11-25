// Test-only helpers for the crm_test database (BOOT-10). Not exported from index.ts.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const PG_PORT = process.env['POSTGRES_PORT'] ?? '5433';
export const TEST_DATABASE_URL = `postgresql://crm:crm@localhost:${PG_PORT}/crm_test`;
export const TEST_SEED_PASSWORD = 'fnd-test-seed-password';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url));

export const TABLES = [
  'audit_logs',
  'contacts',
  'conversations',
  'messages',
  'users',
  'whatsapp_sessions',
] as const;

export interface ScriptResult {
  status: number | null;
  output: string;
}

// Runs a root script the way a developer does. Every migrate and seed variable is set, so the
// root `.env` (loaded by the scripts) cannot change the result (FND Decision 17).
export function runScript(
  script: 'migrate' | 'seed',
  overrides: Readonly<Record<string, string>> = {},
): ScriptResult {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    SEED_PASSWORD: TEST_SEED_PASSWORD,
    ...overrides,
  };
  const r = spawnSync('pnpm', [script], { cwd: REPO_ROOT, env, encoding: 'utf8', timeout: 55_000 });
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// Opens a fresh connection per call, so no client is left open between tests.
export async function query<R extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
): Promise<R[]> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<R>(sql)).rows;
  } finally {
    await client.end();
  }
}

export async function count(table: string, where = 'true'): Promise<number> {
  const [row] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
  );
  return row?.n ?? 0;
}

// Leaves crm_test with no tables, types or migration history.
export async function resetDatabase(): Promise<void> {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

export async function truncateAll(): Promise<void> {
  await query(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
}

export function migrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}
