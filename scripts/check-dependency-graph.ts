// BOOT-02: fails when a workspace package depends on another internal package it must not depend on.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ALLOWED_INTERNAL_EDGES, DEP_GRAPH_EXIT } from './contracts.ts';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}

const root = resolve(argValue('--root', '.'));
const allowed = new Set(ALLOWED_INTERNAL_EDGES.map(([from, to]) => `${from} -> ${to}`));
let failed = false;

for (const group of ['apps', 'packages']) {
  const groupDir = join(root, group);
  if (!existsSync(groupDir)) continue;
  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    const file = join(groupDir, entry.name, 'package.json');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
    if (!pkg.name) continue;
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    };
    for (const dep of Object.keys(deps)) {
      if (dep.startsWith('@crm/') && !allowed.has(`${pkg.name} -> ${dep}`)) {
        console.log(`disallowed: ${pkg.name} -> ${dep}`);
        failed = true;
      }
    }
  }
}

process.exit(failed ? DEP_GRAPH_EXIT.disallowedEdge : DEP_GRAPH_EXIT.ok);
