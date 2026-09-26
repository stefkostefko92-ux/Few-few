// E2E през реален браузър.
//
// Слоят отговаря на въпрос, който другите два не могат: „работи ли това, което
// ЧОВЕКЪТ прави". Интеграционните тестове бият по HTTP и биха минали и при
// напълно счупен интерфейс — точно това стана с полето за втория фактор, което
// липсваше на страницата за вход, докато API-то си работеше.
//
// Затова тук няма проверки на бизнес логика (те са по-евтини на другия слой), а
// само ПОТОЦИ: влизане, навигация, попълване, потвърждение.

import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const PORT = Number(process.env.E2E_PORT ?? 3022);
const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Браузърът, ако средата вече носи такъв.
 *
 * Playwright търси точна версия на изтегления браузър и отказва при разминаване
 * („Executable doesn't exist"), дори когато на машината има напълно работещ
 * Chromium. В контейнер с предварително сложен браузър това значи или излишно
 * теглене на 150 MB, или изобщо непускащ пакет. Затова: ако намерим готов
 * binary, ползваме него; иначе оставяме Playwright да си избере.
 */
function chromiumPreinstallato(): string | undefined {
  for (const p of [
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ])
    if (p && existsSync(p)) return p;
  return undefined;
}

const eseguibile = chromiumPreinstallato();

export default defineConfig({
  testDir: "tests/e2e",
  // Потоците пипат обща база — паралелизъм между файловете дава фалшиви
  // провали, които после се гонят с часове.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE,
    // Следата се пази САМО при повторен провал: пълните следи тежат стотици
    // мегабайта и никой не ги гледа, когато всичко е зелено.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: eseguibile } },
      // Мобилният поток НЕ се дублира тук: същият тест на бюро е друг тест,
      // който минава по други причини и не доказва нищо за телефона.
      testIgnore: /mobile\.spec\.ts/,
    },
    // Техникът работи от телефон — потокът му се проверява на телефон.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath: eseguibile } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
