import { describe, expect, it } from 'vitest';
import { lintErrors } from './helpers.ts';

const WEB_FILE = 'apps/web/src/example.ts';

describe('lint: web must not import db', () => {
  it('BOOT-07 importing @crm/db from apps/web is a lint error', async () => {
    const errors = await lintErrors(
      "import { db } from '@crm/db';\nexport const d = db;\n",
      WEB_FILE,
    );
    expect(
      errors.some((e) => /db/i.test(e)),
      errors.join('\n'),
    ).toBe(true);
  });

  it('BOOT-07 importing packages/db by relative path from apps/web is a lint error', async () => {
    const errors = await lintErrors(
      "import { db } from '../../../packages/db/src/index';\nexport const d = db;\n",
      WEB_FILE,
    );
    expect(
      errors.some((e) => /db/i.test(e)),
      errors.join('\n'),
    ).toBe(true);
  });

  it('BOOT-07 importing @crm/shared from apps/web is clean', async () => {
    const errors = await lintErrors(
      "import { schema } from '@crm/shared';\nexport const s = schema;\n",
      WEB_FILE,
    );
    expect(errors).toEqual([]);
  });
});
