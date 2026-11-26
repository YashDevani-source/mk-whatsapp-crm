import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@crm/worker', () => {
  it('BOOT-08 @crm/worker has a working test runner', () => {
    expect(packageName).toBe('@crm/worker');
  });
});
