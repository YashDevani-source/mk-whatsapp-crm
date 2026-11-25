import { describe, expect, it } from 'vitest';
import { PACKAGES } from '../../scripts/contracts.ts';
import { pnpm, readText } from './helpers.ts';

describe('workspace', () => {
  it('BOOT-01 pnpm-workspace.yaml declares apps/* and packages/*', () => {
    const yaml = readText('pnpm-workspace.yaml');
    expect(yaml).toContain('apps/*');
    expect(yaml).toContain('packages/*');
  });

  it('BOOT-01 the workspace lists exactly the five packages', () => {
    const r = pnpm(['-r', 'list', '--depth', '-1', '--json']);
    expect(r.status, r.output).toBe(0);
    const listed = (JSON.parse(r.output) as Array<{ name: string }>)
      .map((p) => p.name)
      .filter((n) => n !== 'mk-whatsapp-crm')
      .sort();
    expect(listed).toEqual(PACKAGES.map((p) => p.name).sort());
  });
});
