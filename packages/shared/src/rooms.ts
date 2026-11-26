// FND contracts: Socket.io rooms (FND-16, FND-17). Joined only by the server, never on client request.
export const ROOMS = {
  inboxAll: 'inbox:all',
  admin: 'admin',
  global: 'global',
} as const;

export type Room = (typeof ROOMS)[keyof typeof ROOMS] | `user:${string}`;

// The personal room of one user (FND-17).
export function userRoom(userId: string): Room {
  return `user:${userId}`;
}
