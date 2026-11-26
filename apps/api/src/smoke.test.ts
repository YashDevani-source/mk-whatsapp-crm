import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@crm/api', () => {
  it('BOOT-08 @crm/api has a working test runner', () => {
    expect(packageName).toBe('@crm/api');
  });
});
