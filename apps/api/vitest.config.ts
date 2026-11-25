import { defineConfig } from 'vitest/config';

// The global setup migrates crm_test. argon2 hashing and the login round trips are slower than
// the default 5 s budget on a cold run. Files run one at a time: the WA and MSG tests share the
// `wa:state` key and the queue on Redis db 1 (MSG Decision 35).
export default defineConfig({
  test: {
    name: '@crm/api',
    globalSetup: ['./src/test-global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
