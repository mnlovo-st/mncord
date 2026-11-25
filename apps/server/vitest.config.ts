import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { RATE_LIMIT_SCALE: '100' },
    setupFiles: ['./test/setup.ts'], // fake Cloudflare Realtime API
    testTimeout: 30_000,
  },
});
