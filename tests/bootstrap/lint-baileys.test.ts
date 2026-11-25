import { describe, expect, it } from 'vitest';
import { BAILEYS_ADAPTER_DIR, BANNED_BAILEYS_PACKAGES } from '../../scripts/contracts.ts';
import { lintErrors } from './helpers.ts';

const OUTSIDE = 'apps/api/src/example.ts';
const INSIDE = `${BAILEYS_ADAPTER_DIR}/adapter.ts`;

function forms(pkg: string): Array<[string, string]> {
  return [
    ['static import', `import { makeWASocket } from '${pkg}';\nexport const s = makeWASocket;\n`],
    ['type-only import', `import type { WASocket } from '${pkg}';\nexport type S = WASocket;\n`],
    ['dynamic import', `export const load = () => import('${pkg}');\n`],
    ['require', `const b = require('${pkg}');\nexport const s = b;\n`],
    ['re-export', `export * from '${pkg}';\n`],
  ];
}

describe('lint: Baileys boundary', () => {
  for (const pkg of BANNED_BAILEYS_PACKAGES) {
    for (const [label, code] of forms(pkg)) {
      it(`BOOT-06 ${label} of ${pkg} outside the adapter folder is a lint error`, async () => {
        const errors = await lintErrors(code, OUTSIDE);
        expect(
          errors.some((e) => /baileys/i.test(e)),
          errors.join('\n'),
        ).toBe(true);
      });
    }
  }

  it('BOOT-06 a static import inside the adapter folder is clean', async () => {
    const errors = await lintErrors(
      "import { makeWASocket } from '@whiskeysockets/baileys';\nexport const s = makeWASocket;\n",
      INSIDE,
    );
    expect(errors).toEqual([]);
  });
});
