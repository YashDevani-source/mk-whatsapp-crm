import { describe, expect, it } from 'vitest';
import {
  ALLOWED_INTERNAL_EDGES,
  DEP_GRAPH_EXIT,
  PACKAGES,
  type PackageName,
} from '../../scripts/contracts.ts';
import { makeTmp, runScript, writeIn } from './helpers.ts';

function workspaceWith(edges: ReadonlyArray<readonly [PackageName, PackageName]>): string {
  const root = makeTmp('boot02');
  for (const pkg of PACKAGES) {
    const deps: Record<string, string> = {};
    for (const [from, to] of edges) {
      if (from === pkg.name) deps[to] = 'workspace:*';
    }
    writeIn(
      root,
      `${pkg.dir}/package.json`,
      JSON.stringify({ name: pkg.name, dependencies: deps }),
    );
  }
  return root;
}

const SCRIPT = 'scripts/check-dependency-graph.ts';

describe('dependency graph', () => {
  it('BOOT-02 the allowed edges pass the check', () => {
    const r = runScript(SCRIPT, ['--root', workspaceWith(ALLOWED_INTERNAL_EDGES)]);
    expect(r.status, r.output).toBe(DEP_GRAPH_EXIT.ok);
  });

  it('BOOT-02 shared depending on db fails and names the edge', () => {
    const root = workspaceWith([...ALLOWED_INTERNAL_EDGES, ['@crm/shared', '@crm/db']]);
    const r = runScript(SCRIPT, ['--root', root]);
    expect(r.status).toBe(DEP_GRAPH_EXIT.disallowedEdge);
    expect(r.output).toContain('disallowed: @crm/shared -> @crm/db');
  });

  it('BOOT-02 web depending on api fails and names the edge', () => {
    const root = workspaceWith([...ALLOWED_INTERNAL_EDGES, ['@crm/web', '@crm/api']]);
    const r = runScript(SCRIPT, ['--root', root]);
    expect(r.status).toBe(DEP_GRAPH_EXIT.disallowedEdge);
    expect(r.output).toContain('disallowed: @crm/web -> @crm/api');
  });
});
