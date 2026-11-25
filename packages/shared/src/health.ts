// FND contracts: GET /health body (FND-03). 200 when every dependency is ok, 503 otherwise.
import { z } from 'zod';

export const DependencyStatus = z.enum(['ok', 'down']);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

export const HealthResponse = z.object({
  api: z.literal('ok'),
  postgres: DependencyStatus,
  redis: DependencyStatus,
});
export type HealthResponse = z.infer<typeof HealthResponse>;
