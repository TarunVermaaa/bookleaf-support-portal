import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Each test file gets its own in-memory PGlite database (DATABASE_URL is unset in tests).
    env: { NODE_ENV: 'test', DATABASE_URL: '', ANTHROPIC_API_KEY: '', SEED_ON_BOOT: 'false' },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
