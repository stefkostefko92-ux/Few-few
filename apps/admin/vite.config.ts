import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// В разработка проксираме API заявките към backend-а, така че сесийната
// бисквитка остава same-origin. Целта се конфигурира чрез env, не твърдо.
const apiProxyTarget = process.env.VITE_DEV_API_PROXY ?? 'http://localhost:4400';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/admin': { target: apiProxyTarget, changeOrigin: true },
      '/reports': { target: apiProxyTarget, changeOrigin: true },
    },
  },
});
