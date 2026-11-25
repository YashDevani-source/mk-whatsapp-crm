// WA-21, WA-22: the browser origins allowed to talk to the api. No CORS headers are sent: the web
// app reaches the api through the Vite proxy (or a reverse proxy), so it is the same origin.
import type { ApiError } from '@crm/shared';
import type { RequestHandler } from 'express';

// A missing Origin passes: browsers always send one on a WebSocket handshake and on a
// cross-origin POST, so only non-browser clients (tests, curl) omit it. They still need the cookie.
export function originAllowed(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin === undefined || allowed.includes(origin);
}

// Refuses state-changing requests from a foreign origin before anything else runs.
export function originGuard(allowed: readonly string[]): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (originAllowed(req.headers.origin, allowed)) return next();
    const body: ApiError = { error: 'forbidden_origin' };
    res.status(403).json(body);
  };
}
