import { describe, expect, it } from 'vitest';
import { COMPOSE } from '../../scripts/contracts.ts';
import { pnpm, readJson, ROOT } from './helpers.ts';

// Needs `docker compose up -d --wait` first (BOOT-09). Tests use crm_test only (BOOT-10), and every
// seed variable is set here so the developer's `.env` cannot change the result (FND Decision 17).
const PG_PORT = process.env['POSTGRES_PORT'] ?? '5433';
const TEST_ENV = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: `postgresql://${COMPOSE.postgresUser}:crm@localhost:${PG_PORT}/${COMPOSE.testDb}`,
  SEED_PASSWORD: 'boot-15-test-password',
};

describe('migrate and seed on the test database', () => {
  for (const name of ['migrate', 'seed']) {
    it(`BOOT-15 pnpm ${name} exits 0 against the Compose crm_test database`, () => {
      const scripts = readJson('package.json')['scripts'] as Record<string, string>;
      expect(scripts[name], `script ${name}`).toBeDefined();
      const r = pnpm([name], ROOT, TEST_ENV);
      expect(r.status, r.output).toBe(0);
    });
  }
});
