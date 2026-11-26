// The WhatsApp connection manager: takes the single-session lock, drives the provider through the
// connection states, publishes `wa.state` and `wa.qr`, reconnects with backoff and acts on admin
// commands. Only the lock holder ever connects or publishes (WA-02 to WA-05). MSG: it hands the
// current connection's messages to the message handler (MSG-07).
import { randomUUID } from 'node:crypto';
import type { Db } from '@crm/db';
import {
  WA_REDIS,
  WaCommand,
  waChannels,
  workerOfflineState,
  type CrmEvent,
  type ProviderCloseReason,
  type ProviderEvent,
  type WaConnectionState,
  type WaReason,
  type WaState,
  type WhatsAppProvider,
} from '@crm/shared';
import type { Redis } from 'ioredis';
import { reconnectDelay } from './backoff.ts';
import { packageName } from './index.ts';
import { createLock } from './lock.ts';
import { createMessageHandler } from './messages.ts';
import { createSender } from './send.ts';
import { SessionUnreadable, type SessionStore } from './session-store.ts';

export interface WorkerConfig {
  lockTtlMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
}

export interface WorkerDeps {
  db: Db;
  redis: Redis;
  // A separate connection: a subscribed ioredis client cannot run other commands.
  subscriber: Redis;
  provider: WhatsAppProvider;
  store: SessionStore;
  config: WorkerConfig;
  log?: (line: string) => void;
  random?: () => number;
}

export interface WaWorker {
  // Graceful shutdown (WA-05): close without logging out, release the lock, report offline.
  stop(): Promise<void>;
}

// How long a QR stays readable for a Super Admin who opens the page late (WA-16).
const QR_TTL_MS = 60_000;

function failure(what: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`${packageName}: ${what} failed (${name})`);
}

export function startWaWorker(deps: WorkerDeps): WaWorker {
  const { db, redis, subscriber, provider, store, config } = deps;
  const log = deps.log ?? ((line: string) => console.log(line));
  const random = deps.random ?? Math.random;
  const workerId = randomUUID();
  // WA-28: the channels of this worker's Redis database, so it never hears another database's
  // api (for example the tests while the dev stack runs).
  const channels = waChannels(redis.options.db ?? 0);
  const lock = createLock(redis, workerId, config.lockTtlMs);
  const heartbeatMs = Math.max(50, Math.floor(config.lockTtlMs / 3));
  const retryMs = Math.max(50, Math.floor(config.lockTtlMs / 6));
  const messages = createMessageHandler({ db, redis, channels, log });

  let stopped = false;
  let holding = false;
  let standbyLogged = false;
  // Bumped on every connect and every deliberate end, so events from an old connection are
  // ignored.
  let generation = 0;
  let current: WaState | undefined;
  let attempt = 0;
  let lockTimer: NodeJS.Timeout | undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;

  // Provider events, commands and reconnects run one at a time, in order.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task).catch((error: unknown) => failure('connection task', error));
  };

  // MSG Decision 37: a send runs in the same queue, so events WhatsApp reports during the send are
  // handled after it. `ready` is false unless this worker holds the lock and is connected.
  const exclusive = <T>(task: (ready: boolean) => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      enqueue(async () => {
        try {
          resolve(await task(holding && current?.state === 'connected'));
        } catch (error) {
          reject(error);
        }
      });
    });
  const sender = createSender({ db, redis, channels, provider, exclusive });

  const publish = (event: CrmEvent): string => JSON.stringify(event);

  async function setState(state: WaConnectionState, reason?: WaReason): Promise<void> {
    if (!holding) return;
    const next: WaState = {
      v: 1,
      state,
      provider: provider.name,
      ...(reason ? { reason } : {}),
      at: new Date().toISOString(),
    };
    current = next;
    const tx = redis
      .multi()
      .set(WA_REDIS.state, JSON.stringify(next), 'PX', config.lockTtlMs)
      .publish(channels.events, publish({ event: 'wa.state', data: next }));
    if (state !== 'qr_required') tx.del(WA_REDIS.qr);
    await tx.exec();
  }

  async function publishQr(qr: string): Promise<void> {
    if (!holding) return;
    const data = { v: 1 as const, qr, at: new Date().toISOString() };
    await redis
      .multi()
      .set(WA_REDIS.qr, JSON.stringify(data), 'PX', QR_TTL_MS)
      .publish(channels.events, publish({ event: 'wa.qr', data }))
      .exec();
  }

  // WA-20. Meta holds the provider and the reason only, never a QR or credentials.
  async function audit(action: string, reason?: WaReason): Promise<void> {
    try {
      await db.auditLog.create({
        data: { action, meta: { provider: provider.name, ...(reason ? { reason } : {}) } },
      });
    } catch (error) {
      failure('audit write', error);
    }
  }

  function clearTimer(timer: NodeJS.Timeout | undefined): undefined {
    if (timer) clearTimeout(timer);
    return undefined;
  }

  async function scheduleReconnect(): Promise<void> {
    await setState('disconnected', 'network');
    const delay = reconnectDelay(attempt, config.reconnectBaseMs, config.reconnectMaxMs, random);
    attempt += 1;
    reconnectTimer = setTimeout(() => enqueue(connect), delay);
  }

  async function connect(): Promise<void> {
    reconnectTimer = clearTimer(reconnectTimer);
    if (!holding) return;
    const gen = ++generation;
    await setState('connecting');
    try {
      await provider.connect(store, (event) => enqueue(() => onEvent(gen, event)));
    } catch (error) {
      if (gen !== generation || !holding) return;
      failure('provider connect', error);
      generation += 1;
      // WA-14: an unreadable session is not retried; it needs a fresh pairing.
      if (error instanceof SessionUnreadable)
        return setState('reconnect_required', 'session_unreadable');
      await scheduleReconnect();
    }
  }

  async function onEvent(gen: number, event: ProviderEvent): Promise<void> {
    if (gen !== generation || !holding) return;
    if (event.type === 'qr') {
      if (current?.state !== 'qr_required') await setState('qr_required');
      await publishQr(event.qr);
    } else if (event.type === 'open') {
      attempt = 0;
      await setState('connected');
      // MSG-18: send jobs are taken from the first connection after the lock is acquired.
      sender.start();
      await audit('wa.connected');
      if (event.number)
        await store.recordNumber(event.number).catch((e: unknown) => failure('record number', e));
    } else if (event.type === 'close') {
      await onClose(event.reason);
    } else if (event.type === 'message') {
      await messages.onMessage(event.message).catch((e: unknown) => failure('message store', e));
    } else if (event.type === 'skipped') {
      messages.onSkipped(event.reason);
    } else {
      await messages.onStatus(event).catch((e: unknown) => failure('status update', e));
    }
  }

  async function onClose(reason: ProviderCloseReason): Promise<void> {
    const wasConnected = current?.state === 'connected';
    generation += 1;
    if (reason === 'restart') return connect();
    if (reason === 'network') {
      if (wasConnected) await audit('wa.disconnected', 'network');
      return scheduleReconnect();
    }
    if (reason === 'logged_out') {
      // WA-12: the phone unlinked this device; the stored session is useless now.
      await store.clear();
      await setState('reconnect_required', 'logged_out_from_phone');
      return audit('wa.logged_out', 'logged_out_from_phone');
    }
    if (reason === 'qr_timeout') return setState('reconnect_required', 'qr_timeout');
    // `replaced`: another client holds these credentials; reconnecting would fight it.
    await setState('reconnect_required', 'other');
    if (wasConnected) await audit('wa.disconnected', 'other');
  }

  // WA-18, WA-19. The api checked the state, but it may have changed since: check it again here.
  async function onCommand(command: WaCommand): Promise<void> {
    if (!holding) return;
    if (command.command === 'new_qr') {
      if (current?.state !== 'reconnect_required') return;
      await store.clear();
      attempt = 0;
      return connect();
    }
    if (current?.state !== 'connected') return;
    generation += 1;
    await provider.logout().catch((e: unknown) => failure('provider logout', e));
    await store.clear();
    await setState('reconnect_required', 'logged_out_by_admin');
    await audit('wa.logged_out', 'logged_out_by_admin');
  }

  async function heartbeat(): Promise<void> {
    let owned = false;
    try {
      owned = await lock.refresh();
    } catch (error) {
      failure('lock refresh', error);
    }
    if (!owned && holding) await loseLock();
  }

  // WA-04: stop publishing first, then close WhatsApp, then wait as a standby.
  async function loseLock(): Promise<void> {
    holding = false;
    generation += 1;
    heartbeatTimer = clearTimer(heartbeatTimer);
    reconnectTimer = clearTimer(reconnectTimer);
    log(`${packageName}: lost the WhatsApp lock, closing the connection`);
    // MSG-18: stop taking send jobs before WhatsApp closes.
    await sender.stop();
    await provider.close().catch((e: unknown) => failure('provider close', e));
    current = undefined;
    if (!stopped) lockTimer = setTimeout(() => void tryAcquire(), retryMs);
  }

  async function tryAcquire(): Promise<void> {
    lockTimer = undefined;
    if (stopped) return;
    let acquired = false;
    try {
      acquired = await lock.acquire();
    } catch (error) {
      failure('lock acquire', error);
    }
    if (stopped) {
      if (acquired) await lock.release();
      return;
    }
    if (!acquired) {
      if (!standbyLogged) log(`${packageName}: standby, another worker holds the WhatsApp lock`);
      standbyLogged = true;
      lockTimer = setTimeout(() => void tryAcquire(), retryMs);
      return;
    }
    standbyLogged = false;
    holding = true;
    attempt = 0;
    log(`${packageName}: WhatsApp lock acquired (provider ${provider.name})`);
    heartbeatTimer = setInterval(() => void heartbeat(), heartbeatMs);
    enqueue(connect);
  }

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== channels.commands) return;
    let parsed: ReturnType<typeof WaCommand.safeParse>;
    try {
      parsed = WaCommand.safeParse(JSON.parse(message));
    } catch (error) {
      return failure('command parse', error);
    }
    if (!parsed.success) return failure('command parse', parsed.error);
    const command = parsed.data;
    enqueue(() => onCommand(command));
  });
  const subscribed = subscriber
    .subscribe(channels.commands)
    .catch((error: unknown) => failure('command subscribe', error));

  void subscribed.then(() => tryAcquire());

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      lockTimer = clearTimer(lockTimer);
      heartbeatTimer = clearTimer(heartbeatTimer);
      reconnectTimer = clearTimer(reconnectTimer);
      await subscribed;
      await sender.stop();
      await queue;
      if (holding) {
        holding = false;
        generation += 1;
        await provider.close().catch((e: unknown) => failure('provider close', e));
        // The banner shows the worker as offline at once, instead of after the state key's TTL.
        await redis
          .multi()
          .del(WA_REDIS.state, WA_REDIS.qr)
          .publish(channels.events, publish({ event: 'wa.state', data: workerOfflineState() }))
          .exec()
          .catch((e: unknown) => failure('offline state', e));
        await lock.release().catch((e: unknown) => failure('lock release', e));
      }
      await subscriber.unsubscribe(channels.commands).catch(() => undefined);
    },
  };
}
