// FND contracts: env schemas (FND-01, FND-02, FND-19). Loading and error reporting arrive in FND phase 2.
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

// Seed only. The default is a documented dev password; seed refuses to run in production (FND-06).
export const SEED_PASSWORD_DEV_DEFAULT = 'crm-dev-password';
export const SeedEnv = z.object({
  NODE_ENV: NodeEnv,
  DATABASE_URL: PostgresUrl,
  SEED_PASSWORD: z.string().min(8).default(SEED_PASSWORD_DEV_DEFAULT),
});
export type SeedEnv = z.infer<typeof SeedEnv>;
