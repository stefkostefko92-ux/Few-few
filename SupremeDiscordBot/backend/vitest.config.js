// backend/vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Allow top-level await (needed for ESM dynamic imports in tests)
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.js"],
      exclude: ["src/__tests__/**", "src/index.js"],
    },
  },
});
