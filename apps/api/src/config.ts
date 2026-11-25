import type { ApiEnv } from '@crm/shared';

// Session cookie: `<id>.<HMAC-SHA256 of id with SESSION_SECRET>` (FND-07).
export const SESSION_COOKIE = 'crm_sid';

// Auth settings the routes need, taken from ApiEnv at boot (tests build their own).
export interface AuthConfig {
  sessionSecret: string;
  sessionTtlSeconds: number;
  loginMaxAttempts: number;
  loginWindowSeconds: number;
  // Secure cookie flag: on in production, off on http://localhost.
  secureCookie: boolean;
  // Browser origins allowed to open sockets and send non-GET requests (WA-21, WA-22).
  allowedOrigins: readonly string[];
}

export function authConfigFrom(env: ApiEnv): AuthConfig {
  return {
    sessionSecret: env.SESSION_SECRET,
    sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    loginMaxAttempts: env.LOGIN_MAX_ATTEMPTS,
    loginWindowSeconds: env.LOGIN_WINDOW_SECONDS,
    secureCookie: env.NODE_ENV === 'production',
    // As browsers send them in the Origin header: scheme, host and port, no path or slash.
    allowedOrigins: env.ALLOWED_ORIGINS.map((o) => new URL(o).origin),
  };
}
