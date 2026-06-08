import { defineConfig } from 'vite';

// Опълченците · 1877 — Vite конфигурация.
// base: './' е задължително за Capacitor (активите се зареждат с относителни пътища).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 5173,
  },
});
