import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Sourcemaps stay on for dev/preview but are stripped from the
    // production bundle so we don't ship a 4.7 MB readable copy of the
    // app to every visitor (and don't expose internal file paths).
    sourcemap: process.env.NODE_ENV !== 'production',
  },
});
