import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    // Run files sequentially: the WebSocket tests' event loop must not be
    // starved by CPU-bound suites (200k+ RNG/gacha loops) in sibling workers.
    fileParallelism: false,
  },
});
