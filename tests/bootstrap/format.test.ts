import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, pnpm, readJson } from './helpers.ts';

describe('format check', () => {
  const requireScript = (): void => {
    const scripts = readJson('package.json')['scripts'] as Record<string, string>;
    expect(scripts['format:check'], 'script format:check').toBeDefined();
  };

  it('BOOT-17 format:check fails when a file is not Prettier-formatted', () => {
    requireScript();
    const file = join(ROOT, 'boot17-unformatted.ts');
    writeFileSync(file, 'export const   x   =   {a:1,b:2}\n');
    try {
      const r = pnpm(['format:check']);
      expect(r.status).not.toBe(0);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('BOOT-17 format:check exits 0 on the formatted repo', () => {
    requireScript();
    const r = pnpm(['format:check']);
    expect(r.status, r.output).toBe(0);
  });
});
