// frontend/vitest.config.js
// Тестовете тук са СЪДЪРЖАТЕЛНИ гейтове, не рендер тестове: четат данни и
// изходен код (преводи, позиционни масиви), затова няма нужда от jsdom/RTL и
// бандълът остава лек. Ако някога тестваме компоненти, тогава се добавя
// environment: "jsdom" + @testing-library.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{js,jsx}"],
  },
});
