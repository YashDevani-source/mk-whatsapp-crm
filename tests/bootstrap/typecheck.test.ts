import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGES } from '../../scripts/contracts.ts';
import { ROOT, expectFile, pnpm, readJson } from './helpers.ts';

describe('typecheck', () => {
  it('BOOT-03 pnpm typecheck exits 0 on the skeleton', () => {
    const scripts = readJson('package.json')['scripts'] as Record<string, string>;
    expect(scripts['typecheck'], 'root typecheck script').toBeDefined();
    const r = pnpm(['typecheck']);
    expect(r.status, r.output).toBe(0);
  });

  for (const pkg of PACKAGES) {
    it(`BOOT-03 a type error in ${pkg.name} fails typecheck and names it`, () => {
      expectFile(`${pkg.dir}/tsconfig.json`);
      const file = join(ROOT, pkg.dir, 'src', '__boot03_type_error.ts');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'export const broken: number = "not a number";\n');
      try {
        const r = pnpm(['typecheck']);
        expect(r.status).not.toBe(0);
        expect(r.output).toContain(pkg.name);
      } finally {
        rmSync(file, { force: true });
      }
    });
  }
});
