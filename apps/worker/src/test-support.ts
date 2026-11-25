// Test-only helpers for the WA worker tests (BOOT-10: crm_test only). Never imported by app code.
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createDb, type Db } from '@crm/db';
import { CrmEvent, waChannels, type WaCommand, type WaState } from '@crm/shared';
import type { Redis } from 'ioredis';
import { startWaWorker, type WaWorker, type WorkerConfig } from './connection.ts';
import { keyFromHex } from './crypto.ts';
import { FakeProvider } from './providers/fake/fake.ts';
import { createRedis } from './redis.ts';
import { createSessionStore, type SessionStore } from './session-store.ts';

const PG_PORT = process.env['POSTGRES_PORT'] ?? '5433';
const REDIS_PORT = process.env['REDIS_PORT'] ?? '6379';
export const TEST_DATABASE_URL = `postgresql://crm:crm@localhost:${PG_PORT}/crm_test`;
// Redis db 2: the worker tests never share the lock with dev (db 0) or the api tests (db 1).
export const TEST_REDIS_URL = `redis://localhost:${REDIS_PORT}/2`;
export const TEST_KEY_HEX = 'ab'.repeat(32);
export const TEST_KEY = keyFromHex(TEST_KEY_HEX);
// WA-28: the channels of Redis db 2.
export const TEST_CHANNELS = waChannels(2);

// Short timings so lock and backoff tests run in well under a second per step.
export const TEST_CONFIG: WorkerConfig = {
  lockTtlMs: 600,
  reconnectBaseMs: 50,
  reconnectMaxMs: 200,
};

export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Polls until `check` returns true, or fails after `ms`.
export async function waitFor(check: () => boolean | Promise<boolean>, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await pause(20);
  }
  throw new Error(`condition not met within ${ms} ms`);
}

export interface Recorded {
  event: CrmEvent;
  at: number;
}

// Records every valid event on the `crm:events` channel, as the api would receive it.
export async function recordEvents(): Promise<{
  events: Recorded[];
  states: () => WaState[];
  qrs: () => string[];
  clear: () => void;
  close: () => void;
}> {
  const sub = createRedis(TEST_REDIS_URL);
  const events: Recorded[] = [];
  sub.on('message', (_channel: string, message: string) => {
    const parsed = CrmEvent.safeParse(JSON.parse(message));
    if (parsed.success) events.push({ event: parsed.data, at: Date.now() });
  });
  await sub.subscribe(TEST_CHANNELS.events);
  return {
    events,
    states: () => events.flatMap((r) => (r.event.event === 'wa.state' ? [r.event.data] : [])),
    qrs: () => events.flatMap((r) => (r.event.event === 'wa.qr' ? [r.event.data.qr] : [])),
    clear: () => events.splice(0),
    close: () => sub.disconnect(),
  };
}

export interface TestWorker {
  worker: WaWorker;
  fake: FakeProvider;
  store: SessionStore;
  logs: string[];
  stop: () => Promise<void>;
}

// One in-process worker on the Fake provider, with its own Redis connections.
export function startTestWorker(
  db: Db,
  options: { fake?: FakeProvider; config?: Partial<WorkerConfig>; random?: () => number } = {},
): TestWorker {
  const fake = options.fake ?? new FakeProvider();
  const redis = createRedis(TEST_REDIS_URL);
  const subscriber = createRedis(TEST_REDIS_URL);
  const store = createSessionStore(db, TEST_KEY, 'fake');
  const logs: string[] = [];
  const worker = startWaWorker({
    db,
    redis,
    subscriber,
    provider: fake,
    store,
    config: { ...TEST_CONFIG, ...options.config },
    log: (line) => logs.push(line),
    ...(options.random ? { random: options.random } : {}),
  });
  return {
    worker,
    fake,
    store,
    logs,
    stop: async () => {
      await worker.stop();
      redis.disconnect();
      subscriber.disconnect();
    },
  };
}

export function lastState(rec: { states: () => WaState[] }): WaState | undefined {
  return rec.states().at(-1);
}

export async function sendCommand(
  redis: Redis,
  command: WaCommand['command'],
  channel = TEST_CHANNELS.commands,
): Promise<void> {
  const body: WaCommand = { v: 1, command, actorId: '00000000-0000-4000-8000-000000000001' };
  await redis.publish(channel, JSON.stringify(body));
}

export function testDb(): Db {
  return createDb(TEST_DATABASE_URL);
}

// Leaves Redis db 2 empty and no session rows or WA audit rows in crm_test.
export async function resetWa(db: Db, redis: Redis): Promise<void> {
  await redis.flushdb();
  await db.whatsAppSession.deleteMany();
  await db.auditLog.deleteMany({ where: { action: { startsWith: 'wa.' }, actorId: null } });
}

// --- spawned workers (main.ts), for the lock tests that need a real process ---

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

export function workerEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    SESSION_ENCRYPTION_KEY: TEST_KEY_HEX,
    ...overrides,
  };
}

export interface Spawned {
  child: ChildProcess;
  output: () => string;
  // Resolves once `text` has appeared in the output, counting from `from`.
  waitForOutput: (text: string, ms?: number, from?: number) => Promise<void>;
  exited: Promise<[number | null, NodeJS.Signals | null]>;
}

export function spawnWorker(env: Record<string, string>): Spawned {
  const child = spawn(process.execPath, [MAIN], { env });
  let output = '';
  const onData = (chunk: Buffer): void => {
    output += chunk.toString();
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const exited = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  return {
    child,
    output: () => output,
    waitForOutput: async (text, ms = 10_000, from = 0) => {
      try {
        await waitFor(() => output.indexOf(text, from) >= 0, ms);
      } catch {
        throw new Error(`"${text}" not printed within ${ms} ms. Output:\n${output}`);
      }
    },
    exited,
  };
}

export async function killAll(workers: readonly Spawned[]): Promise<void> {
  for (const w of workers) {
    if (w.child.exitCode === null && w.child.signalCode === null) {
      w.child.kill('SIGKILL');
      await w.exited;
    }
  }
}
