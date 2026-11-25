import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spawned with only the variables below, so the developer's `.env` and shell env do not leak in.
const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

const VALID_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://crm:crm@localhost:5433/crm_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_ENCRYPTION_KEY: 'ab'.repeat(32),
};

// Starts main.ts, resolves with its output once `line` appears, then stops it.
async function startUntil(env: Record<string, string>, line: string): Promise<string> {
  const child = spawn(process.execPath, [MAIN], { env });
  let output = '';
  const exited = once(child, 'exit');
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out. Output:\n${output}`)), 15_000);
      const onData = (chunk: Buffer): void => {
        output += chunk.toString();
        if (output.includes(line)) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`exited with ${code}. Output:\n${output}`));
      });
    });
  } finally {
    child.kill();
    await exited;
  }
  return output;
}

describe('worker boot', () => {
  it('FND-01 worker exits non-zero and names each missing or invalid env variable', () => {
    // 63 hex characters: one short of a 32-byte key.
    const shortKey = 'deadbeef'.repeat(8).slice(1);
    const r = spawnSync(process.execPath, [MAIN], {
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'mysql://crm:SENTINEL-pw@localhost/crm',
        REDIS_URL: '',
        SESSION_ENCRYPTION_KEY: shortKey,
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    const output = `${r.stdout}${r.stderr}`;
    expect(r.status, output).not.toBeNull();
    expect(r.status, output).not.toBe(0);
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'SESSION_ENCRYPTION_KEY']) {
      expect(r.stderr).toContain(name);
    }
    expect(output).not.toContain('SENTINEL');
    expect(output).not.toContain(shortKey);
  }, 20_000);

  it('FND-02 worker starts and prints its startup line with a valid env', async () => {
    const output = await startUntil(VALID_ENV, '@crm/worker started');
    expect(output).not.toContain(VALID_ENV.SESSION_ENCRYPTION_KEY);
  }, 20_000);
});
