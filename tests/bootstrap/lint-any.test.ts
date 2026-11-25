import { describe, expect, it } from 'vitest';
import { lintErrors } from './helpers.ts';

const FILE = 'apps/api/src/example.ts';

describe('lint: explicit any', () => {
  const forms: Array<[string, string]> = [
    ['annotation', 'export const x: any = 1;\n'],
    ['as any', 'export const y = (1 as any);\n'],
    ['generic argument', 'export const z: Array<any> = [];\n'],
  ];

  for (const [label, code] of forms) {
    it(`BOOT-05 explicit any (${label}) is a lint error`, async () => {
      const errors = await lintErrors(code, FILE);
      expect(
        errors.some((e) => e.includes('no-explicit-any')),
        errors.join('\n'),
      ).toBe(true);
    });
  }

  it('BOOT-05 the same code without any is clean', async () => {
    const errors = await lintErrors('export const x: unknown = 1;\n', FILE);
    expect(errors).toEqual([]);
  });
});
