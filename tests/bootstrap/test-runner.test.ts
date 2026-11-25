import { describe, expect, it } from 'vitest';
import { PACKAGES } from '../../scripts/contracts.ts';
import { pnpm, readJson } from './helpers.ts';

describe('test runner', () => {
  it('BOOT-08 the root test script runs the packages recursively', () => {
    const scripts = readJson('package.json')['scripts'] as Record<string, string>;
    expect(scripts['test']).toMatch(/pnpm -r|--recursive/);
  });

  it('BOOT-08 running the package tests names all five packages and exits 0', () => {
    // Calls `pnpm -r test` directly: the root `pnpm test` contains this very test, so calling it would recurse.
    // One package at a time, as the root script does (WA Decision 27): the packages share crm_test.
    const r = pnpm(['-r', '--workspace-concurrency=1', 'test']);
    expect(r.status, r.output).toBe(0);
    for (const pkg of PACKAGES) {
      expect(r.output, pkg.name).toContain(pkg.name);
    }
  });
});
