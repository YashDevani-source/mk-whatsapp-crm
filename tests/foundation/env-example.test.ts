import { describe, expect, it } from 'vitest';
import { ApiEnv, WorkerEnv } from '../../packages/shared/src/env.ts';
import { readText } from '../bootstrap/helpers.ts';

describe('.env.example', () => {
  it('FND-19 .env.example lists every variable the api and worker env schemas require', () => {
    const listed = new Set(
      [...readText('.env.example').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
    );
    const required = new Set([...Object.keys(ApiEnv.shape), ...Object.keys(WorkerEnv.shape)]);
    const missing = [...required].filter((name) => !listed.has(name));
    expect(missing).toEqual([]);
  });
});
