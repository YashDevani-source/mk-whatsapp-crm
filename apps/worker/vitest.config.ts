import { defineConfig } from 'vitest/config';

// The WA tests share one Redis db and the single-session lock, so files run one at a time.
// The global setup migrates crm_test. Spawned workers make some tests slower than 5 s.
export default defineConfig({
  test: {
    name: '@crm/worker',
    globalSetup: ['./src/test-global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
