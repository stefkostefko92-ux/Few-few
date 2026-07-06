// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor code from app code so returning visitors keep the
        // cached vendor chunk and the landing-page chunk stays small (CWV/LCP).
        // Vite 8 bundles with Rolldown (not Rollup): the object form of
        // manualChunks is removed and the function form is deprecated, so we use
        // Rolldown's advancedChunks.groups (test-based) — the forward-compatible API.
        advancedChunks: {
          groups: [
            { name: "icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
            { name: "vendor", test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@tanstack[\\/]react-query|axios)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/archive": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/public": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
