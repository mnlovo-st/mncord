import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global.ts'], // fake Cloudflare Realtime API + the real Worker in wrangler dev
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
