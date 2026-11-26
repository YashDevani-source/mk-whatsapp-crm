// WA routes, mounted at /wa (Super Admin only): ask the worker for a new QR (WA-18) or to log out
// (WA-19). The api never talks to WhatsApp: it checks the worker's last state and publishes a
// command; the worker checks the state again before acting.
import type { Db } from '@crm/db';
import {
  WA_REDIS,
  WaQr,
  WaState,
  waChannels,
  workerOfflineState,
  type ApiError,
  type WaCommand,
  type WaConnectionState,
} from '@crm/shared';
import { Router, type RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { sessionOf, type Access, type AccessDeps } from './access.ts';

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// The worker's last published state. A missing key means no worker holds the lock (WA-16).
export async function readWaState(redis: Redis): Promise<WaState> {
  const result = WaState.safeParse(parseJson(await redis.get(WA_REDIS.state)));
  return result.success ? result.data : workerOfflineState();
}

export async function readWaQr(redis: Redis): Promise<WaQr | undefined> {
  const result = WaQr.safeParse(parseJson(await redis.get(WA_REDIS.qr)));
  return result.success ? result.data : undefined;
}

interface CommandRoute {
  command: WaCommand['command'];
  // The only state in which the command is accepted; any other gives 409.
  when: WaConnectionState;
  // WA-20: written with the admin as actor before the command is sent.
  audit: string;
}

function commandHandler(db: Db, redis: Redis, route: CommandRoute): RequestHandler {
  return async (req, res) => {
    const state = await readWaState(redis);
    if (state.state !== route.when) {
      const body: ApiError = { error: 'invalid_state' };
      return void res.status(409).json(body);
    }
    const { user } = sessionOf(req);
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: route.audit,
        ip: req.ip ?? null,
        meta: { provider: state.provider },
      },
    });
    const command: WaCommand = { v: 1, command: route.command, actorId: user.id };
    // WA-28: the commands channel of this api's Redis database.
    await redis.publish(waChannels(redis.options.db ?? 0).commands, JSON.stringify(command));
    res.status(202).end();
  };
}

export function waRouter({ db, redis }: AccessDeps, access: Access): Router {
  const router = Router();
  router.post(
    '/qr',
    access('wa.manage'),
    commandHandler(db, redis, {
      command: 'new_qr',
      when: 'reconnect_required',
      audit: 'wa.qr_requested',
    }),
  );
  router.post(
    '/logout',
    access('wa.manage'),
    commandHandler(db, redis, {
      command: 'logout',
      when: 'connected',
      audit: 'wa.logout_requested',
    }),
  );
  return router;
}
