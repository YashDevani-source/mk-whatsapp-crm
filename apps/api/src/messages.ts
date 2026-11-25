// MSG routes, mounted at /conversations: list conversations and messages (MSG-08) and send a text
// (MSG-09 to MSG-13). Super Admin and Managers only until INB scopes Employees (MSG Decision 8).
// The api never talks to WhatsApp: it stores the message, queues it and the worker sends it.
import {
  conversationInclude,
  conversationSummary,
  messageInclude,
  messageView,
  type Db,
} from '@crm/db';
import {
  RouteId,
  SendMessageRequest,
  type ApiError,
  type ConversationList,
  type MessageList,
} from '@crm/shared';
import { Router, type Response } from 'express';
import { sessionOf, type Access, type AccessDeps } from './access.ts';
import type { OutboundQueue } from './queue.ts';
import type { SocketControl } from './sockets.ts';
import { readWaState } from './wa.ts';

export interface MessagesDeps extends AccessDeps {
  outbound: OutboundQueue;
}

// MSG Decision 32: the conversation list is capped; INB adds paging.
const CONVERSATION_LIMIT = 200;
const MESSAGE_LIMIT = 100;

function fail(res: Response, status: number, error: string): void {
  const body: ApiError = { error };
  res.status(status).json(body);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function findMessage(db: Db, id: string): Promise<ReturnType<typeof messageView>> {
  return messageView(
    await db.message.findUniqueOrThrow({ where: { id }, include: messageInclude }),
  );
}

async function pushConversation(db: Db, sockets: SocketControl, id: string): Promise<void> {
  const row = await db.conversation.findUniqueOrThrow({
    where: { id },
    include: conversationInclude,
  });
  sockets.push({ event: 'conversation.updated', data: conversationSummary(row) });
}

export function messagesRouter(
  { db, redis, sockets, outbound }: MessagesDeps,
  access: Access,
): Router {
  const router = Router();

  router.get('/', access('inbox.read'), async (_req, res) => {
    const rows = await db.conversation.findMany({
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: conversationInclude,
      take: CONVERSATION_LIMIT,
    });
    const body: ConversationList = { conversations: rows.map(conversationSummary) };
    res.json(body);
  });

  router.get('/:id/messages', access('inbox.read'), async (req, res) => {
    const id = RouteId.safeParse(req.params['id']);
    if (!id.success) return fail(res, 404, 'not_found');
    const conversation = await db.conversation.findUnique({
      where: { id: id.data },
      select: { id: true },
    });
    if (!conversation) return fail(res, 404, 'not_found');
    const rows = await db.message.findMany({
      where: { conversationId: id.data },
      orderBy: [{ at: 'desc' }, { createdAt: 'desc' }],
      take: MESSAGE_LIMIT,
      include: messageInclude,
    });
    const body: MessageList = { messages: rows.reverse().map(messageView) };
    res.json(body);
  });

  router.post('/:id/messages', access('messages.send'), async (req, res) => {
    const parsed = SendMessageRequest.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_request');
    const id = RouteId.safeParse(req.params['id']);
    if (!id.success) return fail(res, 404, 'not_found');
    const conversationId = id.data;
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) return fail(res, 404, 'not_found');
    const { text, clientId } = parsed.data;

    // MSG-13: a repeated send (a retried request, a double click) returns the first message.
    const existing = async (): Promise<string | undefined> =>
      clientId === undefined
        ? undefined
        : (
            await db.message.findUnique({
              where: { conversationId_clientId: { conversationId, clientId } },
              select: { id: true },
            })
          )?.id;
    const repeated = await existing();
    if (repeated !== undefined) return void res.status(200).json(await findMessage(db, repeated));

    // MSG-11: never queue a message while WhatsApp is not connected.
    if ((await readWaState(redis)).state !== 'connected') {
      return fail(res, 503, 'wa_not_connected');
    }

    const { user } = sessionOf(req);
    const now = new Date();
    let messageId: string;
    try {
      messageId = await db.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            conversationId,
            direction: 'OUTBOUND',
            type: 'TEXT',
            body: text,
            status: 'QUEUED',
            statusAt: now,
            sentById: user.id,
            clientId: clientId ?? null,
            at: now,
          },
          select: { id: true },
        });
        await tx.conversation.updateMany({
          where: {
            id: conversationId,
            OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: now } }],
          },
          data: { lastMessageAt: now },
        });
        return message.id;
      });
    } catch (error) {
      // The same clientId sent twice at the same moment: the other request stored it.
      const winner = isUniqueViolation(error) ? await existing() : undefined;
      if (winner === undefined) throw error;
      return void res.status(200).json(await findMessage(db, winner));
    }

    // Pushed before the job is added, so no status can reach a browser before its message.
    const view = await findMessage(db, messageId);
    sockets.push({ event: 'message.created', data: view });
    await pushConversation(db, sockets, conversationId);

    try {
      await outbound.add(messageId);
    } catch (error) {
      // MSG Decision 31: no `queued` message is left without a job.
      console.error(
        `api: queueing a message failed (${error instanceof Error ? error.name : typeof error})`,
      );
      const failedAt = new Date();
      await db.message.update({
        where: { id: messageId },
        data: { status: 'FAILED', failureReason: 'PROVIDER_ERROR', statusAt: failedAt },
      });
      sockets.push({
        event: 'message.status',
        data: {
          v: 1,
          messageId,
          conversationId,
          status: 'failed',
          failureReason: 'provider_error',
          at: failedAt.toISOString(),
        },
      });
      return fail(res, 503, 'queue_unavailable');
    }
    res.status(202).json(view);
  });

  return router;
}
