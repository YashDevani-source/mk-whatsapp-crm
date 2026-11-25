import tseslint from 'typescript-eslint';

const BAILEYS_ADAPTER_DIR = 'apps/worker/src/providers/baileys';
const BAILEYS = String.raw`^(@whiskeysockets/baileys|baileys|@adiwajshing/baileys)(/|$)`;
const DB = [String.raw`^@crm/db(/|$)`, String.raw`(^|/)packages/db(/|$)`];

const baileysMessage = `Baileys may only be imported inside ${BAILEYS_ADAPTER_DIR}.`;
const dbMessage = 'apps/web must not import the db package.';

// Flags any module specifier matching a forbidden pattern: static import, `import type`,
// `export ... from`, dynamic `import()` and `require()`.
const restrictImport = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          forbid: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] ?? { forbid: [], message: '' };
    const patterns = options.forbid.map((p) => new RegExp(p));
    const check = (node, source) => {
      if (source && source.type === 'Literal' && typeof source.value === 'string') {
        const value = source.value;
        if (patterns.some((re) => re.test(value))) {
          context.report({ node, message: `${options.message} (imports "${value}")` });
        }
      }
    };
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          check(node, node.arguments[0]);
        }
      },
    };
  },
};

const boundaries = { rules: { 'restrict-import': restrictImport } };

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'packages/db/src/generated/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  {
    // BOOT-06: Baileys only inside the worker's adapter folder.
    files: ['**/*.{ts,tsx,js}'],
    ignores: [`${BAILEYS_ADAPTER_DIR}/**`],
    plugins: { boundaries },
    rules: {
      'boundaries/restrict-import': ['error', { forbid: [BAILEYS], message: baileysMessage }],
    },
  },
  {
    // BOOT-07: web must not import db. Also keeps the Baileys rule, since this replaces the rule above.
    files: ['apps/web/**/*.{ts,tsx,js}'],
    plugins: { boundaries },
    rules: {
      'boundaries/restrict-import': [
        'error',
        { forbid: [BAILEYS, ...DB], message: `${dbMessage} ${baileysMessage}` },
      ],
    },
  },
];
