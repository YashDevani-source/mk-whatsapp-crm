import { ROOMS, userRoom, type Room, type SessionUser } from '@crm/shared';
import { Server, type DefaultEventsMap } from 'socket.io';
import {
  authenticate,
  checkSession,
  type AccessDeps,
  type Authenticated,
  type CoreDeps,
} from './access.ts';

// Kept on each socket by the handshake (FND-15).
export type SocketData = Authenticated;

// Room events are added by later specs (INB, WA); FND defines none.
export type CrmServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export interface SocketControl {
  // Disconnects the sockets opened with this session (logout).
  endSession(userId: string, sessionId: string): Promise<void>;
  // Disconnects every socket of this user (deactivation).
  endUser(userId: string): Promise<void>;
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

function logFailure(what: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`api: ${what} failed (${name})`);
}

// The Socket.io server, not yet attached to an HTTP server (`io.attach`). The handshake uses the
// same session cookie as HTTP (FND Decision 16).
export function createSockets(core: CoreDeps): Sockets {
  const io: CrmServer = new Server({ serveClient: false });

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

  io.on('connection', (socket) => {
    void socket.join(roomsFor(socket.data.user));

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
