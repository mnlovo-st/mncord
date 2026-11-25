import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // sandboxed preloads must be a single CommonJS file
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    envDir: resolve(__dirname),
    plugins: [react(), tailwindcss()],
    server: { port: 5198, strictPort: true },
    build: {
      // never inline assets as data: URLs, the CSP only allows 'self' (worklets, wasm, fonts)
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          spike: resolve(__dirname, 'src/renderer/spike.html'),
          design: resolve(__dirname, 'src/renderer/design.html'),
        },
      },
    },
  },
});
