import { defineConfig } from "@playwright/test";

/**
 * E2E for the lobby/room flow. Assumes the full stack is already running
 * (Postgres, Redis, api :4500, realtime :4501, web :4502) — bring it up with
 * `infra/e2e-stack.sh` (or docker compose + `pnpm dev`). Two real users are
 * registered in global-setup; the spec drives two browser contexts through
 * create → join → start.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4502",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
