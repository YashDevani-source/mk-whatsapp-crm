import { describe, expect, it } from 'vitest';
import { CI_STEPS } from '../../scripts/contracts.ts';
import { readText } from './helpers.ts';

const WORKFLOW = '.github/workflows/ci.yml';

describe('CI workflow', () => {
  it('BOOT-13 the workflow triggers on push and pull_request', () => {
    const yml = readText(WORKFLOW);
    expect(yml).toMatch(/^\s*push:/m);
    expect(yml).toMatch(/^\s*pull_request:/m);
  });

  it('BOOT-13 the steps run install, typecheck, lint, test, traceability in that order', () => {
    const yml = readText(WORKFLOW);
    const positions = CI_STEPS.map((s) => {
      const nameAt = yml.search(new RegExp(`-\\s+name:\\s*${s.name}\\b`, 'i'));
      expect(nameAt, `step named "${s.name}"`).toBeGreaterThanOrEqual(0);
      const runAt = yml.indexOf(s.command, nameAt);
      expect(runAt, `command "${s.command}" after step "${s.name}"`).toBeGreaterThan(nameAt);
      return nameAt;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('BOOT-13 no step is marked continue-on-error', () => {
    expect(readText(WORKFLOW)).not.toMatch(/continue-on-error:\s*true/);
  });
});
