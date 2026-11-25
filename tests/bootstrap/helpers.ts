import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface RunResult {
  status: number | null;
  output: string;
}

export function run(cmd: string, args: string[], cwd: string = ROOT): RunResult {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 110_000 });
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

export const pnpm = (args: string[], cwd: string = ROOT): RunResult => run('pnpm', args, cwd);

export function runScript(script: string, args: string[]): RunResult {
  expectFile(script);
  return run(process.execPath, [join(ROOT, script), ...args]);
}

export function expectFile(rel: string): void {
  if (!existsSync(join(ROOT, rel))) {
    throw new Error(`Missing file: ${rel}`);
  }
}

export function readText(rel: string): string {
  expectFile(rel);
  return readFileSync(join(ROOT, rel), 'utf8');
}

export function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readText(rel)) as Record<string, unknown>;
}

export function makeTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

export function writeIn(base: string, rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// Lints a snippet as if it lived at `relPath` in the repo; returns only error-level messages.
export async function lintErrors(code: string, relPath: string): Promise<string[]> {
  expectFile('eslint.config.js');
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, relPath) });
  return (result?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => `${m.ruleId ?? 'parse'}: ${m.message}`);
}
