// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor code from app code so returning visitors keep
        // the cached vendor chunk and the landing-page chunk stays small
        // (Core Web Vitals / LCP). Function form — Vite 8 / Rollup 4 dropped
        // the object form of manualChunks.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("lucide-react")) return "icons";
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@tanstack[\\/]react-query|axios)[\\/]/.test(id)) {
            return "vendor";
          }
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
