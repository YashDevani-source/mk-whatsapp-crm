import { describe, expect, it } from 'vitest';
import { ApiEnv, WorkerEnv, formatEnvProblems, parseEnv } from './env.ts';

const API_VALID = {
  DATABASE_URL: 'postgresql://crm:crm@localhost:5433/crm_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOWED_ORIGINS: 'http://localhost:5173, http://localhost:4173',
};

const WORKER_VALID = {
  DATABASE_URL: 'postgresql://crm:crm@localhost:5433/crm_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_ENCRYPTION_KEY: 'ab'.repeat(32),
};

const names = (r: ReturnType<typeof parseEnv>): string[] =>
  r.ok ? [] : r.problems.map((p) => p.name).sort();

describe('parseEnv', () => {
  it('FND-01 a valid api env parses, fills the defaults and ignores other variables', () => {
    const r = parseEnv(ApiEnv, { ...API_VALID, UNRELATED: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.env.NODE_ENV).toBe('development');
    expect(r.env.PORT).toBe(4000);
    expect(r.env.ALLOWED_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:4173']);
    expect(r.env).not.toHaveProperty('UNRELATED');
  });

  it('FND-01 every missing or invalid variable is named', () => {
    const r = parseEnv(ApiEnv, {
      REDIS_URL: 'http://localhost:6379',
      SESSION_SECRET: 'too-short',
      ALLOWED_ORIGINS: 'not a url',
      PORT: 'eighty',
    });
    expect(r.ok).toBe(false);
    expect(names(r)).toEqual([
      'ALLOWED_ORIGINS',
      'DATABASE_URL',
      'PORT',
      'REDIS_URL',
      'SESSION_SECRET',
    ]);
  });

  it('FND-01 an empty string counts as missing', () => {
    const r = parseEnv(ApiEnv, { ...API_VALID, DATABASE_URL: '', SESSION_SECRET: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual([
      { name: 'DATABASE_URL', reason: 'missing' },
      { name: 'SESSION_SECRET', reason: 'missing' },
    ]);
  });

  it('FND-01 SESSION_ENCRYPTION_KEY must be exactly 64 hex characters', () => {
    expect(parseEnv(WorkerEnv, WORKER_VALID).ok).toBe(true);
    for (const key of ['ab'.repeat(32).slice(1), `${'ab'.repeat(32)}a`, 'zz'.repeat(32)]) {
      const r = parseEnv(WorkerEnv, { ...WORKER_VALID, SESSION_ENCRYPTION_KEY: key });
      expect(names(r), key).toEqual(['SESSION_ENCRYPTION_KEY']);
    }
  });

  it('FND-01 the formatted message names each bad variable and never contains a value', () => {
    const secrets = {
      DATABASE_URL: 'mysql://crm:SENTINEL-pw@localhost/crm',
      REDIS_URL: 'SENTINEL-redis',
      SESSION_ENCRYPTION_KEY: 'SENTINEL-key',
    };
    const r = parseEnv(WorkerEnv, secrets);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const message = formatEnvProblems('@crm/worker', r.problems);
    expect(message).toContain('@crm/worker');
    for (const name of Object.keys(secrets)) expect(message).toContain(name);
    expect(message).not.toContain('SENTINEL');
  });
});
