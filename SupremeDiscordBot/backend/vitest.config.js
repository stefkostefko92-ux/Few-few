// backend/vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Интеграционните искат ЖИВ Postgres и имат свой конфиг
    // (`npm run test:integration`). Тук биха падали от липсваща база и щяха да
    // изглеждат като счупен код.
    exclude: ["**/node_modules/**", "src/__tests__/integration/**"],
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
