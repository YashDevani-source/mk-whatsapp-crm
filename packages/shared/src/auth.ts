// FND contracts: roles, permissions, login and session shapes (FND-07 to FND-14).
import { z } from 'zod';

// Kept in sync by hand with the Prisma `Role` enum (Architecture decision 3).
export const Role = z.enum(['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE']);
export type Role = z.infer<typeof Role>;

// FND set (Decision 7), plus MSG's `inbox.read` and `messages.send` (Super Admin and Managers
// until INB scopes them for Employees, MSG Decision 8). Later specs add permissions here.
export const Permission = z.enum([
  'auth.session',
  'users.manage',
  'wa.manage',
  'inbox.read',
  'messages.send',
]);
export type Permission = z.infer<typeof Permission>;

// Every route declares exactly one of these (FND-13).
export type RouteAccess = 'public' | Permission;

export type PermissionMap = Readonly<Record<Role, readonly Permission[]>>;

// The single role→permission map (FND-12). Checked on the server only (route guard, socket rooms).
export const PERMISSION_MAP: PermissionMap = {
  SUPER_ADMIN: ['auth.session', 'users.manage', 'wa.manage', 'inbox.read', 'messages.send'],
  MANAGER: ['auth.session', 'users.manage', 'inbox.read', 'messages.send'],
  EMPLOYEE: ['auth.session'],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSION_MAP[role].includes(permission);
}

export const LoginRequest = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

// Returned by POST /auth/login and GET /auth/me, and nothing else about the user (FND-07).
export const SessionUser = z.object({
  id: z.uuid(),
  name: z.string(),
  role: Role,
});
export type SessionUser = z.infer<typeof SessionUser>;

// Stored in Redis under `sess:<id>` (Decision 10).
export const SessionRecord = z.object({
  userId: z.uuid(),
  role: Role,
  createdAt: z.number().int(),
});
export type SessionRecord = z.infer<typeof SessionRecord>;

// Body of every API error response, e.g. `{ error: 'invalid_credentials' }`.
export const ApiError = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
