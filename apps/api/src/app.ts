import type { ApiError } from '@crm/shared';
import express, { type ErrorRequestHandler, type Express, type Router } from 'express';
import { createAccess, type Access, type AccessDeps } from './access.ts';
import { authRouter } from './auth.ts';
import { healthRouter } from './health.ts';

export type AppDeps = AccessDeps;

export interface AppOptions {
  // Test-only routers (FND-14). main.ts never passes any.
  extraRouters?: ReadonlyArray<(access: Access) => Router>;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

// 4xx from the body parser (bad JSON, too large) or 500. Never logs the request body or the
// error message, which can quote it (FND-18).
const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status = statusOf(error) ?? 500;
  const clientError = status >= 400 && status < 500;
  if (!clientError) {
    const name = error instanceof Error ? error.name : typeof error;
    console.error(`api: request failed (${name})`);
  }
  const body: ApiError = { error: clientError ? 'invalid_request' : 'internal' };
  res.status(clientError ? status : 500).json(body);
};

export function createApp(deps: AppDeps, options: AppOptions = {}): Express {
  const app = express();
  const access = createAccess(deps);
  app.use(express.json({ limit: '16kb' }));
  app.use(healthRouter(deps, access));
  app.use('/auth', authRouter(deps, access));
  for (const build of options.extraRouters ?? []) app.use(build(access));
  app.use((_req, res) => {
    const body: ApiError = { error: 'not_found' };
    res.status(404).json(body);
  });
  app.use(errorHandler);
  return app;
}
