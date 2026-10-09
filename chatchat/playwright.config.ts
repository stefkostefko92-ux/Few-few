import { defineConfig, devices } from '@playwright/test';
import { E2E_ORIGIN, E2E_READY_PORT } from './tests/e2e/support/constants.js';

/**
 * E2E (§17.2): истински браузър срещу истинското приложение (фалшив модел и антивирус — виж
 * tests/e2e/server.ts). Иска жива PostgreSQL: DATABASE_URL=postgresql://…/chatchat_test_ac.
 * Не е в `npm run gate`. Браузърът — от PLAYWRIGHT_BROWSERS_PATH; или E2E_CHROMIUM=/път/до/chrome.
 */
const executablePath = process.env.E2E_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['junit', { outputFile: 'test-results/e2e.xml' }]] : 'list',
  use: {
    baseURL: E2E_ORIGIN,
    locale: 'it-IT',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npx tsx tests/e2e/server.ts',
    url: `http://127.0.0.1:${E2E_READY_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
