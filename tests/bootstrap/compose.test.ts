import { describe, it } from 'vitest';

describe('docker compose', () => {
  // Manual check (spec Manual check, step 2) plus a CI service check once the pipeline exists.
  it.todo('BOOT-09 docker compose up -d --wait leaves Postgres 16 and Redis 7 healthy');
});

describe('dev command', () => {
  // Manual check (spec Manual check, step 7).
  it.todo('BOOT-16 pnpm dev starts web, api and worker together and stopping it stops all three');
});
