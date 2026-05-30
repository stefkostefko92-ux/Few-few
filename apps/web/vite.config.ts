import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// АСО web shell (S1). Dev/preview on 4502 to match the S18 port plan; the API
// CORS whitelist already includes this origin.
export default defineConfig({
  plugins: [react()],
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
});
