// BOOT-12: lists criterion IDs in non-draft specs that no test title starts with.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TRACEABILITY_EXIT, type UncoveredCriterion } from './contracts.ts';

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}

function walk(dir: string, accept: (name: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, accept, out);
    else if (accept(name)) out.push(path);
  }
  return out;
}

const specsDir = resolve(argValue('--specs', 'docs/specs'));
const testsDir = resolve(argValue('--tests', '.'));

// A test title "starts with" an ID when the first string after it( / test( / it.todo( begins with it.
const TITLE = /\b(?:it|test)(?:\.(?:todo|skip|only))?\(\s*['"`]([A-Z]{2,5}-\d{2})\b/g;
const covered = new Set<string>();
for (const file of walk(testsDir, (n) => n.endsWith('.test.ts'))) {
  for (const match of readFileSync(file, 'utf8').matchAll(TITLE)) {
    if (match[1]) covered.add(match[1]);
  }
}

const uncovered: UncoveredCriterion[] = [];
for (const name of readdirSync(specsDir).sort()) {
  if (!name.endsWith('.md') || name.startsWith('_')) continue;
  const text = readFileSync(join(specsDir, name), 'utf8');
  const status = /^Status:\s*(\w+)/i.exec(text.split('\n')[0] ?? '')?.[1]?.toLowerCase();
  if (status === 'draft') continue;
  for (const row of text.matchAll(/^\|\s*([A-Z]{2,5}-\d{2})\s*\|/gm)) {
    const id = row[1];
    if (id && !covered.has(id)) uncovered.push({ id, spec: name });
  }
}

for (const { id, spec } of uncovered) console.log(`${id}\t${spec}`);
process.exit(uncovered.length > 0 ? TRACEABILITY_EXIT.uncovered : TRACEABILITY_EXIT.allCovered);
