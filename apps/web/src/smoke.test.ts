import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@crm/web', () => {
  it('BOOT-08 @crm/web has a working test runner', () => {
    expect(packageName).toBe('@crm/web');
  });
});
