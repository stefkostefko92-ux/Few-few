import { defineConfig } from "@playwright/test";
import fs from "node:fs";

/**
 * E2E against the full running stack (Postgres, Redis, api, realtime, web).
 *
 *  - `rooms`     — the lobby/room flow (two users registered in global-setup).
 *  - `games-2d`  — every game played through real clicks against bots, with
 *                  WebGL off so the 3D tables fall back to their DOM boards.
 *  - `games-3d`  — the WebGL tables themselves (canvas picking).
 *
 * Bring a stack up with `bash infra/e2e-games.sh up <N>` and point
 * E2E_BASE_URL at it (the script prints it); the default is the dev server.
 */
const chromium =
  process.env.PW_CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4502",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "bg-BG",
  },
  projects: [
    {
      name: "rooms",
      testMatch: /room-flow\.spec\.ts/,
      use: { browserName: "chromium", launchOptions: { executablePath: chromium } },
    },
    {
      name: "games-2d",
      testMatch: /games\/.*\.spec\.ts/,
      testIgnore: /\.3d\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 1366, height: 768 },
        launchOptions: { executablePath: chromium, args: ["--disable-webgl", "--disable-3d-apis"] },
      },
    },
    {
      name: "games-3d",
      testMatch: /games\/.*\.3d\.spec\.ts/,
      use: {
        browserName: "chromium",
        viewport: { width: 1366, height: 768 },
        launchOptions: { executablePath: chromium, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
  ],
});
