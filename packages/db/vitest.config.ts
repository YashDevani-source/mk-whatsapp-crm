import { defineConfig } from 'vitest/config';

// The schema and seed tests share crm_test and reset it, so files run one at a time. Spawning
// pnpm and Prisma is slower than the default 5 s timeout.
export default defineConfig({
  test: { name: '@crm/db', fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
