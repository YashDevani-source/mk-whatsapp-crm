import {
  ROOMS,
  userRoom,
  type ConversationSummary,
  type CrmEvent,
  type MessageStatusUpdate,
  type MessageView,
  type Room,
  type SessionUser,
  type WaQr,
  type WaState,
} from '@crm/shared';
import { Server, type DefaultEventsMap, type Socket } from 'socket.io';
import {
  authenticate,
  checkSession,
  type AccessDeps,
  type Authenticated,
  type CoreDeps,
} from './access.ts';
import { originAllowed } from './origin.ts';
import { readWaQr, readWaState } from './wa.ts';

// Kept on each socket by the handshake (FND-15).
export type SocketData = Authenticated;

// Server-to-client room events. WA: `wa.state` to `global`, `wa.qr` to `admin` only (WA-15).
// MSG: the message events to `inbox:all` only (MSG-23).
export interface ServerEvents {
  'wa.state': (state: WaState) => void;
  'wa.qr': (qr: WaQr) => void;
  'message.created': (message: MessageView) => void;
  'message.status': (update: MessageStatusUpdate) => void;
  'conversation.updated': (conversation: ConversationSummary) => void;
}

export type CrmServer = Server<DefaultEventsMap, ServerEvents, DefaultEventsMap, SocketData>;
type CrmSocket = Socket<DefaultEventsMap, ServerEvents, DefaultEventsMap, SocketData>;

export interface SocketControl {
  // Disconnects the sockets opened with this session (logout).
  endSession(userId: string, sessionId: string): Promise<void>;
  // Disconnects every socket of this user (deactivation).
  endUser(userId: string): Promise<void>;
  // MSG: pushes an event the api produced itself (a CRM send) to the rooms `pushEvent` picks.
  push(event: CrmEvent): void;
}

export interface Sockets {
  io: CrmServer;
  control: SocketControl;
}

// The rooms a user is put in on connect, chosen by the server from the role (FND-17).
export function roomsFor(user: SessionUser): Room[] {
  const rooms: Room[] = [userRoom(user.id), ROOMS.global];
  if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER') rooms.push(ROOMS.inboxAll);
  if (user.role === 'SUPER_ADMIN') rooms.push(ROOMS.admin);
  return rooms;
}

// The one place that picks the rooms for an event, for the worker relay and the api's own pushes
// (MSG Decision 6). The publisher never chooses them. MSG events go to `inbox:all` only until INB
// adds the assignee rooms (MSG-23).
export function pushEvent(io: CrmServer, event: CrmEvent): void {
  switch (event.event) {
    case 'wa.state':
      io.to(ROOMS.global).emit('wa.state', event.data);
      break;
    // The QR pairs a phone with the company number: Super Admin only.
    case 'wa.qr':
      io.to(ROOMS.admin).emit('wa.qr', event.data);
      break;
    case 'message.created':
      io.to(ROOMS.inboxAll).emit('message.created', event.data);
      break;
    case 'message.status':
      io.to(ROOMS.inboxAll).emit('message.status', event.data);
      break;
    case 'conversation.updated':
      io.to(ROOMS.inboxAll).emit('conversation.updated', event.data);
      break;
  }
}

function logFailure(what: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`api: ${what} failed (${name})`);
}

// The Socket.io server, not yet attached to an HTTP server (`io.attach`). The handshake uses the
// same session cookie as HTTP (FND Decision 16).
export function createSockets(core: CoreDeps): Sockets {
  // WA-21: a handshake from a foreign origin is refused before the session is looked at.
  const io: CrmServer = new Server({
    serveClient: false,
    allowRequest: (req, callback) => {
      callback(null, originAllowed(req.headers.origin, core.config.allowedOrigins));
    },
  });

  const control: SocketControl = {
    endSession: async (userId, sessionId) => {
      for (const socket of await io.in(userRoom(userId)).fetchSockets()) {
        if (socket.data.sessionId === sessionId) socket.disconnect(true);
      }
    },
    endUser: (userId) => {
      io.in(userRoom(userId)).disconnectSockets(true);
      return Promise.resolve();
    },
    push: (event) => pushEvent(io, event),
  };
  const deps: AccessDeps = { ...core, sockets: control };

  // FND-15: no valid session, no connection.
  io.use(async (socket, next) => {
    try {
      const session = await authenticate(deps, socket.request.headers.cookie);
      if (session === undefined) return next(new Error('unauthenticated'));
      socket.data = session;
      next();
    } catch (error) {
      logFailure('socket handshake', error);
      next(new Error('internal'));
    }
  });

  // WA-16: a new socket gets the current connection state, and a Super Admin the current QR.
  async function sendWaState(socket: CrmSocket, rooms: readonly Room[]): Promise<void> {
    try {
      const state = await readWaState(core.redis);
      socket.emit('wa.state', state);
      if (state.state !== 'qr_required' || !rooms.includes(ROOMS.admin)) return;
      const qr = await readWaQr(core.redis);
      if (qr) socket.emit('wa.qr', qr);
    } catch (error) {
      logFailure('initial WhatsApp state', error);
    }
  }

  io.on('connection', (socket) => {
    const rooms = roomsFor(socket.data.user);
    void socket.join(rooms);
    void sendWaState(socket, rooms);

    // FND-20: every incoming event re-checks the session and the user first, so a logged-out,
    // expired or deactivated session is disconnected on its next event. No event joins a room:
    // the server registers no such handler, so a client's join request is ignored (FND-16).
    socket.use(async (_event, next) => {
      try {
        if (await checkSession(deps, socket.data.sessionId)) return next();
      } catch (error) {
        logFailure('socket session check', error);
      }
      socket.disconnect(true);
    });
  });

  return { io, control };
}
