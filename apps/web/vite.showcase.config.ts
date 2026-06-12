import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/** Dev-only config for the game showcase: swaps the real socket for the fake,
 *  engine-driven one so every game view renders a faithful table offline. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /(^|.*\/)lib\/socket$/, replacement: path.resolve(__dirname, "src/lib/socket.demo.ts") },
    ],
  },
  server: { port: 5199, strictPort: true },
});
