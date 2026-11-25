import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@crm/db', () => {
  it('BOOT-08 @crm/db has a working test runner', () => {
    expect(packageName).toBe('@crm/db');
  });
});
