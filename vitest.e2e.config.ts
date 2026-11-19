import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests: starts the real game server and the Vite client once
 * (e2e/setup.ts), then runs headless multiplayer and browser tests against them.
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    globalSetup: ['e2e/setup.ts'],
    // All files share one server and one zone room, so run them one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
