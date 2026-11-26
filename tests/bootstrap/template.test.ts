import { describe, expect, it } from 'vitest';
import { TEMPLATE_CRITERIA_COLUMNS, TEMPLATE_HEADINGS } from '../../scripts/contracts.ts';
import { readText } from './helpers.ts';

describe('spec template', () => {
  const text = (): string => readText('docs/specs/_template.md');

  it('BOOT-11 the template starts with a Status line', () => {
    expect(text().split('\n')[0]).toMatch(/^Status:/);
  });

  for (const heading of TEMPLATE_HEADINGS) {
    it(`BOOT-11 the template has a "${heading}" heading`, () => {
      expect(text()).toMatch(new RegExp(`^#{1,3}\\s+${heading}\\b`, 'm'));
    });
  }

  it('BOOT-11 the criteria table has the ID, Criterion, Priority, Test level columns', () => {
    expect(text()).toContain(TEMPLATE_CRITERIA_COLUMNS);
  });
});
