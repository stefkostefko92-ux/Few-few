import { test, expect } from "@playwright/test";
import { newPlayer } from "./helpers";

/**
 * Първо посещение на масата: service worker-ът се инсталира и поема
 * страницата (clients.claim → controllerchange). Старият pwa.ts презареждаше
 * при ВСЯКА смяна на контролера — и при първата инсталация: страницата се
 * зареждаше втори път миг след първия, повторното влизане в опашката
 * предаваше току-що започнатия мач, а автоматично отворените правила (вече
 * отбелязани като видени) изчезваха. Презареждане има само след „Обнови“.
 */
test("първо посещение: страницата не се презарежда сама, правилата остават отворени", async ({ browser, baseURL }) => {
  const storageState = await newPlayer(baseURL!);
  const ctx = await browser.newContext({ storageState, baseURL });
  const page = await ctx.newPage();
  let loads = 0;
  page.on("load", () => loads++);

  await page.goto("play/war");
  const rules = page.getByRole("dialog");
  await expect(rules).toBeVisible();
  // Service worker-ът поема страницата (в production билда)…
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  // …и след това нищо не я презарежда.
  await page.waitForTimeout(2_000);
  expect(loads, "страницата се презареди сама след инсталирането на service worker-а").toBe(1);
  await expect(rules).toBeVisible();
  await ctx.close();
});
