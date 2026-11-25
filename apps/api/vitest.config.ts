import { defineConfig } from 'vitest/config';

// The global setup migrates crm_test. argon2 hashing and the login round trips are slower than
// the default 5 s budget on a cold run.
export default defineConfig({
  test: {
    name: '@crm/api',
    globalSetup: ['./src/test-global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
