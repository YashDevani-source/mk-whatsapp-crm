// FND contracts: roles, permissions, login and session shapes (FND-07 to FND-14).
import { z } from 'zod';

// Kept in sync by hand with the Prisma `Role` enum (Architecture decision 3).
export const Role = z.enum(['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE']);
export type Role = z.infer<typeof Role>;

// FND set (Decision 7). Later specs add permissions here.
export const Permission = z.enum(['auth.session', 'users.manage', 'wa.manage']);
export type Permission = z.infer<typeof Permission>;

// Every route declares exactly one of these (FND-13).
export type RouteAccess = 'public' | Permission;

// Values are filled in FND phase 4 (FND-12).
export type PermissionMap = Readonly<Record<Role, readonly Permission[]>>;

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
