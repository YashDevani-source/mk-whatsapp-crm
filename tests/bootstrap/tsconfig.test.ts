import { describe, expect, it } from 'vitest';
import { PACKAGES } from '../../scripts/contracts.ts';
import { readJson } from './helpers.ts';

interface TsConfig {
  extends?: string;
  compilerOptions?: { strict?: boolean };
}

describe('tsconfig', () => {
  it('BOOT-04 the base config has strict true', () => {
    const base = readJson('tsconfig.base.json') as TsConfig;
    expect(base.compilerOptions?.strict).toBe(true);
  });

  for (const pkg of PACKAGES) {
    it(`BOOT-04 ${pkg.name} extends the base and does not disable strict`, () => {
      const cfg = readJson(`${pkg.dir}/tsconfig.json`) as TsConfig;
      expect(cfg.extends).toMatch(/tsconfig\.base\.json$/);
      expect(cfg.compilerOptions?.strict).not.toBe(false);
    });
  }
});
