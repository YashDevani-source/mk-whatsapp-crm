// FND contracts: env schemas (FND-01, FND-02, FND-19) and the pure parser each app calls at boot.
import { z } from 'zod';

const NodeEnv = z.enum(['development', 'test', 'production']).default('development');
const PostgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const RedisUrl = z.url({ protocol: /^rediss?$/ });
const PositiveInt = z.coerce.number().int().positive();

// Comma-separated list of browser origins allowed by CORS and the socket server.
const OriginList = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
  )
  .pipe(z.array(z.url()).min(1));

export const ApiEnv = z.object({
  NODE_ENV: NodeEnv,
  PORT: PositiveInt.default(4000),
  DATABASE_URL: PostgresUrl,
  REDIS_URL: RedisUrl,
  SESSION_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: OriginList,
  SESSION_TTL_SECONDS: PositiveInt.default(43_200),
  LOGIN_MAX_ATTEMPTS: PositiveInt.default(5),
  LOGIN_WINDOW_SECONDS: PositiveInt.default(900),
});
export type ApiEnv = z.infer<typeof ApiEnv>;

export const WorkerEnv = z.object({
  NODE_ENV: NodeEnv,
  DATABASE_URL: PostgresUrl,
  REDIS_URL: RedisUrl,
  // 32 bytes as 64 hex characters (AES-256-GCM key for the WhatsApp session, used by WA).
  SESSION_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters'),
});
export type WorkerEnv = z.infer<typeof WorkerEnv>;

// `pnpm migrate` only: Prisma reads the URL through prisma.config.ts (FND-04).
export const MigrateEnv = z.object({
  DATABASE_URL: PostgresUrl,
});
export type MigrateEnv = z.infer<typeof MigrateEnv>;

// Seed only. The default is a documented dev password; seed refuses to run in production (FND-06).
export const SEED_PASSWORD_DEV_DEFAULT = 'crm-dev-password';
export const SeedEnv = z.object({
  NODE_ENV: NodeEnv,
  DATABASE_URL: PostgresUrl,
  SEED_PASSWORD: z.string().min(8).default(SEED_PASSWORD_DEV_DEFAULT),
});
export type SeedEnv = z.infer<typeof SeedEnv>;

export interface EnvProblem {
  name: string;
  reason: string;
}

export type EnvResult<T> = { ok: true; env: T } | { ok: false; problems: EnvProblem[] };

// Reads only the schema's keys from `source`, and treats an empty string as missing (FND-01).
// A problem names the variable and never carries its value.
export function parseEnv<S extends z.ZodObject>(
  schema: S,
  source: Readonly<Record<string, string | undefined>>,
): EnvResult<z.output<S>> {
  const picked: Record<string, string | undefined> = {};
  for (const name of Object.keys(schema.shape)) {
    const value = source[name];
    picked[name] = value === '' ? undefined : value;
  }

  const result = schema.safeParse(picked);
  if (result.success) return { ok: true, env: result.data };

  const problems: EnvProblem[] = [];
  for (const issue of result.error.issues) {
    const name = String(issue.path[0]);
    if (problems.some((p) => p.name === name)) continue;
    const value = picked[name];
    // Zod's messages do not echo the input; the check guards against one that ever does.
    const reason =
      value === undefined ? 'missing' : issue.message.includes(value) ? 'invalid' : issue.message;
    problems.push({ name, reason });
  }
  return { ok: false, problems };
}

export function formatEnvProblems(app: string, problems: readonly EnvProblem[]): string {
  const lines = problems.map((p) => `  ${p.name}: ${p.reason}`);
  return [`${app}: invalid environment, refusing to start`, ...lines].join('\n');
}
