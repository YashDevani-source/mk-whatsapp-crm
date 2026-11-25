import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@crm/shared', () => {
  it('BOOT-08 @crm/shared has a working test runner', () => {
    expect(packageName).toBe('@crm/shared');
  });
});
