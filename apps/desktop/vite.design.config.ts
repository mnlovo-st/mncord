import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone browser preview of the renderer (design system + app UI, no Electron). Run: npm run design
export default defineConfig({
  root: 'src/renderer',
  envDir: '../..', // relative to root, i.e. apps/desktop
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
  build: { assetsInlineLimit: 0, rollupOptions: { input: 'src/renderer/design.html' } },
});
