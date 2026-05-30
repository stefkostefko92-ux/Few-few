import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Random full-game playouts across 18 engines can be CPU-heavy.
    testTimeout: 30_000,
  },
});
