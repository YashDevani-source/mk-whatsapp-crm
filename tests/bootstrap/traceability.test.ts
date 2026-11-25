import { describe, expect, it } from 'vitest';
import { TRACEABILITY_EXIT } from '../../scripts/contracts.ts';
import { makeTmp, runScript, writeIn } from './helpers.ts';

const SCRIPT = 'scripts/traceability.ts';

function spec(status: string, ids: string[]): string {
  const rows = ids.map((id) => `| ${id} | something observable | Must | Test |`).join('\n');
  return `Status: ${status}\n\n# Spec\n\n| ID | Criterion | Priority | Test level |\n|---|---|---|---|\n${rows}\n`;
}

function trace(specs: Record<string, string>, tests: Record<string, string>) {
  const dir = makeTmp('boot12');
  for (const [name, body] of Object.entries(specs)) writeIn(dir, `specs/${name}`, body);
  for (const [name, body] of Object.entries(tests)) writeIn(dir, `tests/${name}`, body);
  return runScript(SCRIPT, ['--specs', `${dir}/specs`, '--tests', `${dir}/tests`]);
}

describe('traceability', () => {
  it('BOOT-12 an approved spec ID with no test is listed and exits 1', () => {
    const r = trace(
      { 'a.md': spec('approved', ['AAA-01', 'AAA-02']) },
      { 'a.test.ts': "it('AAA-01 works', () => {});" },
    );
    expect(r.status).toBe(TRACEABILITY_EXIT.uncovered);
    expect(r.output).toContain('AAA-02\ta.md');
    expect(r.output).not.toContain('AAA-01');
  });

  it('BOOT-12 a spec with Status: draft is ignored', () => {
    const r = trace({ 'a.md': spec('draft', ['AAA-01']) }, { 'a.test.ts': '' });
    expect(r.status, r.output).toBe(TRACEABILITY_EXIT.allCovered);
    expect(r.output).not.toContain('AAA-01');
  });

  it('BOOT-12 an ID that appears only mid-title does not count as covered', () => {
    const r = trace(
      { 'a.md': spec('approved', ['AAA-01']) },
      { 'a.test.ts': "it('checks AAA-01 later', () => {});" },
    );
    expect(r.status).toBe(TRACEABILITY_EXIT.uncovered);
    expect(r.output).toContain('AAA-01\ta.md');
  });

  it('BOOT-12 an it.todo title that starts with the ID counts as covered', () => {
    const r = trace(
      { 'a.md': spec('approved', ['AAA-01']) },
      { 'a.test.ts': "it.todo('AAA-01 manual check');" },
    );
    expect(r.status, r.output).toBe(TRACEABILITY_EXIT.allCovered);
  });

  it('BOOT-12 matching is anchored and exact: AAA-1 does not cover AAA-01', () => {
    const r = trace(
      { 'a.md': spec('approved', ['AAA-01']) },
      { 'a.test.ts': "it('AAA-1 wrong id', () => {});" },
    );
    expect(r.status).toBe(TRACEABILITY_EXIT.uncovered);
  });

  it('BOOT-12 a spec with no Status line is checked, not ignored', () => {
    const body =
      '# Spec\n\n| ID | Criterion | Priority | Test level |\n|---|---|---|---|\n| AAA-01 | x | Must | Test |\n';
    const r = trace({ 'a.md': body }, { 'a.test.ts': '' });
    expect(r.status).toBe(TRACEABILITY_EXIT.uncovered);
    expect(r.output).toContain('AAA-01\ta.md');
  });
});
