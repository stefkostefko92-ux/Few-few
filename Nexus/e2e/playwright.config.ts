import { defineConfig, devices } from '@playwright/test';

/**
 * E2E срещу РЕАЛНИЯ билд (Nexus/server сервира client/dist статично на
 * същия origin — виж server/src/server.ts `app.use(express.static(...))`).
 * Не срещу vite dev server, не мокнат свят.
 *
 * Локално:
 *   1. cd Nexus/server && npm run seed        # веднъж, ако data/e2e.db липсва
 *   2. NEXUS_E2E_PORT=4100 DB_PATH=./data/e2e.db npm run dev --workspace server
 *   3. cd Nexus && npm run build --workspace client   # ако client/src се е менял
 *   4. cd Nexus/e2e && npm test
 *
 * PLAYWRIGHT_CHROMIUM_PATH override за средата с предварително свален браузър
 * (виж задачата): /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
 */
const PORT = process.env.NEXUS_E2E_PORT || '4100';
const BASE_URL = process.env.NEXUS_E2E_BASE_URL || `http://localhost:${PORT}`;
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: './tests',
  // Вдига login_rate_max_per_min в тестовата БД ПРЕДИ първата заявка (виж
  // global-setup.ts) — работи само ако сървърът е рестартиран ПРЕСЕН преди
  // `npm test` (иначе in-memory кеша на настройката вече е прочетен със
  // старата стойност). Виж e2e/README.md.
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // споделена сървърна БД между тестове — сериен, за детерминизъм
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['junit', { outputFile: 'results/junit.xml' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: CHROMIUM_PATH,
          // 3D боят (Three.js CombatScene) иска софтуерен GL рендерер в
          // headless среда без GPU (виж задачата).
          args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
        },
      },
    },
  ],
});
