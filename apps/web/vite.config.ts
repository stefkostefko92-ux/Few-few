import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// АСО web shell (S1). Dev/preview on 4502 to match the S18 port plan; the API
// CORS whitelist already includes this origin.
export default defineConfig({
  plugins: [react()],
  // The play app is served under /app/ in production (marketing SSG owns the
  // root for SEO); dev serves at root for convenience.
  base: process.env.NODE_ENV === "production" ? "/app/" : "/",
  server: {
    port: 4502,
    proxy: {
      // Proxy API + websocket to the backend in dev so cookies are same-origin.
      "/api": { target: "http://localhost:4500", changeOrigin: true },
      "/socket.io": { target: "http://localhost:4501", ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4502 },
  build: { sourcemap: true },
  // Playwright drives the e2e/ specs (they need the running stack); keep them
  // out of the vitest unit run.
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
