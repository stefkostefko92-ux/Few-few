// bot/vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    // Модули, които се import-ват транзитивно от тестове (напр. utils/api.js),
    // fail-fast-ват без API_SECRET/BOT_TOKEN. Даваме им фиктивни стойности за
    // тестовата среда — не докосват реален Discord/backend.
    env: {
      API_SECRET: "test-secret",
      BOT_TOKEN: "test-token",
      API_URL: "http://localhost:3000/api",
    },
  },
});
