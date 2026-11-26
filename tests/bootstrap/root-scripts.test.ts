import { describe, expect, it } from 'vitest';
import { ROOT_SCRIPTS } from '../../scripts/contracts.ts';
import { readJson } from './helpers.ts';

describe('root scripts', () => {
  const scripts = (): Record<string, string> =>
    readJson('package.json')['scripts'] as Record<string, string>;

  for (const name of ROOT_SCRIPTS) {
    it(`BOOT-14 root package.json defines a real "${name}" script`, () => {
      const cmd = scripts()[name];
      expect(cmd, `script ${name}`).toBeDefined();
      expect(cmd).not.toContain('no test specified');
    });
  }
});
