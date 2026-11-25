import express, { type Express } from 'express';
import { healthRouter, type HealthDeps } from './health.ts';

export type AppDeps = HealthDeps;

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(healthRouter(deps));
  return app;
}
