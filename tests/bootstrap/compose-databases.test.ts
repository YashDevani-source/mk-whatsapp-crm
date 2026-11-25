import { describe, expect, it } from 'vitest';
import { COMPOSE } from '../../scripts/contracts.ts';
import { readText, run } from './helpers.ts';

describe('compose databases', () => {
  it('BOOT-10 docker-compose.yml defines postgres, redis and both databases', () => {
    const yml = readText('docker-compose.yml');
    expect(yml).toContain(COMPOSE.postgresService);
    expect(yml).toContain(COMPOSE.redisService);
    expect(yml).toContain(COMPOSE.devDb);
    expect(yml).toContain(COMPOSE.testDb);
  });

  it('BOOT-10 the dev and test databases both exist in the running Postgres', () => {
    const r = run('docker', [
      'compose',
      'exec',
      '-T',
      COMPOSE.postgresService,
      'psql',
      '-U',
      COMPOSE.postgresUser,
      '-d',
      'postgres',
      '-tAc',
      'SELECT datname FROM pg_database',
    ]);
    expect(r.status, r.output).toBe(0);
    const names = r.output.split('\n').map((s) => s.trim());
    expect(names).toContain(COMPOSE.devDb);
    expect(names).toContain(COMPOSE.testDb);
  });
});
