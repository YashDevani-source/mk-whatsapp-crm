import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAILEYS_ADAPTER_DIR, BANNED_BAILEYS_PACKAGES } from '../../scripts/contracts.ts';
import { ROOT, readJson, readText } from '../bootstrap/helpers.ts';

// WA Decision 6: the version the adapter was written and checked against.
const PINNED = '7.0.0-rc14';
const WORKSPACE_PACKAGES = [
  'apps/web',
  'apps/api',
  'apps/worker',
  'packages/shared',
  'packages/db',
];

function dependencies(pkgDir: string): Record<string, string> {
  const pkg = readJson(`${pkgDir}/package.json`);
  return {
    ...(pkg['dependencies'] as Record<string, string> | undefined),
    ...(pkg['devDependencies'] as Record<string, string> | undefined),
  };
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|js)$/.test(name)) out.push(path);
  }
  return out;
}

// Module specifiers in static imports, re-exports, dynamic imports and require calls.
function specifiers(code: string): string[] {
  const found = code.matchAll(
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g,
  );
  return [...found].map((m) => m[1] ?? '');
}

const isBaileys = (spec: string): boolean =>
  BANNED_BAILEYS_PACKAGES.some((name) => spec === name || spec.startsWith(`${name}/`));

describe('Baileys adapter', () => {
  it('WA-26 baileys is pinned to an exact version in the worker, and nowhere else', () => {
    expect(dependencies('apps/worker')['baileys']).toBe(PINNED);
    for (const dir of WORKSPACE_PACKAGES.filter((d) => d !== 'apps/worker')) {
      const declared = Object.keys(dependencies(dir)).filter(isBaileys);
      expect(declared, dir).toEqual([]);
    }
    // The lockfile resolves the same exact version.
    expect(readText('pnpm-lock.yaml')).toContain(`baileys@${PINNED}:`);
  });

  it('WA-26 baileys is imported only inside the adapter folder, and the adapter does import it', () => {
    const offenders: string[] = [];
    let adapterImports = 0;
    for (const dir of WORKSPACE_PACKAGES) {
      for (const file of sourceFiles(join(ROOT, dir, 'src'))) {
        const rel = relative(ROOT, file);
        const hits = specifiers(readFileSync(file, 'utf8')).filter(isBaileys);
        if (hits.length === 0) continue;
        if (rel.startsWith(`${BAILEYS_ADAPTER_DIR}/`)) adapterImports += hits.length;
        else offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
    expect(adapterImports).toBeGreaterThan(0);
  });

  it('WA-26 the adapter implements the provider interface', async () => {
    const { BaileysProvider } = await import('../../apps/worker/src/providers/baileys/index.ts');
    const provider = new BaileysProvider();
    expect(provider.name).toBe('baileys');
    for (const method of ['connect', 'logout', 'close'] as const) {
      expect(typeof provider[method]).toBe('function');
    }
    // `implements WhatsAppProvider` in the adapter is checked by `pnpm typecheck`.
    expect(readText(`${BAILEYS_ADAPTER_DIR}/index.ts`)).toMatch(
      /class BaileysProvider implements WhatsAppProvider/,
    );
  });
});
