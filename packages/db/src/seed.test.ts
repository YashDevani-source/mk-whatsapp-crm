import argon2 from 'argon2';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  TABLES,
  TEST_SEED_PASSWORD,
  count,
  query,
  runScript,
  truncateAll,
} from './test-support.ts';

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) counts[table] = await count(table);
  return counts;
}

// Needs `docker compose up -d --wait`. Uses crm_test only (BOOT-10).
describe('pnpm seed', () => {
  beforeAll(async () => {
    const r = runScript('migrate');
    expect(r.status, r.output).toBe(0);
    await truncateAll();
  });

  it('FND-06 seed creates one active user per role and at least two test contacts', async () => {
    const r = runScript('seed');
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toContain(TEST_SEED_PASSWORD);

    const roles = await query<{ role: string; n: number }>(
      'SELECT role::text, count(*)::int AS n FROM users WHERE active GROUP BY role ORDER BY role',
    );
    expect(roles).toEqual([
      { role: 'EMPLOYEE', n: 1 },
      { role: 'MANAGER', n: 1 },
      { role: 'SUPER_ADMIN', n: 1 },
    ]);
    expect(await count('users')).toBe(3);
    expect(await count('contacts', 'is_test')).toBeGreaterThanOrEqual(2);

    const [user] = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users LIMIT 1',
    );
    const hash = user?.password_hash ?? '';
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(hash, TEST_SEED_PASSWORD)).toBe(true);
  });

  it('FND-06 a second seed run leaves the row counts unchanged', async () => {
    const before = await rowCounts();
    expect(before['users']).toBe(3);
    const r = runScript('seed');
    expect(r.status, r.output).toBe(0);
    expect(await rowCounts()).toEqual(before);
  });

  it('FND-06 seed refuses to run when NODE_ENV is production', async () => {
    await truncateAll();
    const r = runScript('seed', { NODE_ENV: 'production' });
    expect(r.status, r.output).not.toBe(0);
    expect(r.output).toContain('production');
    expect(await count('users')).toBe(0);
  });
});
