import { describe, expect, it } from 'vitest';
import { pnpm, readJson } from './helpers.ts';

// Needs `docker compose up -d --wait` first (BOOT-09).
describe('migrate and seed on an empty schema', () => {
  for (const name of ['migrate', 'seed']) {
    it(`BOOT-15 pnpm ${name} exits 0 against the Compose Postgres`, () => {
      const scripts = readJson('package.json')['scripts'] as Record<string, string>;
      expect(scripts[name], `script ${name}`).toBeDefined();
      const r = pnpm([name]);
      expect(r.status, r.output).toBe(0);
    });
  }
});
