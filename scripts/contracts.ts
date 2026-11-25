// Contracts for Spec 0 (BOOT): shared constants and types that the BOOT tests assert against.
// Types and constants only, no behaviour. Source of truth: docs/specs/000-bootstrap.md.

export const PACKAGES = [
  { name: '@crm/web', dir: 'apps/web' },
  { name: '@crm/api', dir: 'apps/api' },
  { name: '@crm/worker', dir: 'apps/worker' },
  { name: '@crm/shared', dir: 'packages/shared' },
  { name: '@crm/db', dir: 'packages/db' },
] as const;

export type PackageName = (typeof PACKAGES)[number]['name'];

// BOOT-02: [dependent, dependency]. Source: docs/plan/Architure-plan.md section 2.
export const ALLOWED_INTERNAL_EDGES: ReadonlyArray<readonly [PackageName, PackageName]> = [
  ['@crm/web', '@crm/shared'],
  ['@crm/api', '@crm/shared'],
  ['@crm/api', '@crm/db'],
  ['@crm/worker', '@crm/shared'],
  ['@crm/worker', '@crm/db'],
  ['@crm/db', '@crm/shared'],
];

// BOOT-14 and BOOT-17. `install` is plain `pnpm install`, so it is not a script.
export const ROOT_SCRIPTS = [
  'dev',
  'test',
  'typecheck',
  'lint',
  'migrate',
  'seed',
  'traceability',
  'format',
  'format:check',
] as const;

// BOOT-06
export const BANNED_BAILEYS_PACKAGES = [
  '@whiskeysockets/baileys',
  'baileys',
  '@adiwajshing/baileys',
] as const;
export const BAILEYS_ADAPTER_DIR = 'apps/worker/src/providers/baileys';

// BOOT-09, BOOT-10, BOOT-15
export const COMPOSE = {
  postgresService: 'postgres',
  redisService: 'redis',
  postgresUser: 'crm',
  devDb: 'crm_dev',
  testDb: 'crm_test',
} as const;

// BOOT-11
export const TEMPLATE_HEADINGS = [
  'Goal',
  'Scope',
  'Out of scope',
  'Acceptance criteria',
  'Contracts touched',
  'Edge cases',
  'Manual check',
] as const;
export const TEMPLATE_CRITERIA_COLUMNS = '| ID | Criterion | Priority | Test level |';

// BOOT-13: CI step order. Each step's `run` must contain the matching command.
export const CI_STEPS = [
  { name: 'install', command: 'pnpm install' },
  { name: 'typecheck', command: 'pnpm typecheck' },
  { name: 'lint', command: 'pnpm lint' },
  { name: 'test', command: 'pnpm test' },
  { name: 'traceability', command: 'pnpm traceability' },
] as const;

// BOOT-12: `node scripts/traceability.ts [--specs <dir>] [--tests <dir>]`
// Defaults: docs/specs and the repo root. Prints one line per uncovered ID: "<ID>\t<spec file name>".
export interface UncoveredCriterion {
  id: string;
  spec: string;
}
export const TRACEABILITY_EXIT = { allCovered: 0, uncovered: 1 } as const;

// BOOT-02: `node scripts/check-dependency-graph.ts --root <dir>`
// Reads <dir>/{apps,packages}/*/package.json. For each disallowed edge it prints
// "disallowed: <dependent> -> <dependency>" and exits 1; otherwise exits 0.
export const DEP_GRAPH_EXIT = { ok: 0, disallowedEdge: 1 } as const;
