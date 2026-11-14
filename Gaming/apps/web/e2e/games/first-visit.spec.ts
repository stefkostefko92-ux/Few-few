import { test, expect } from "@playwright/test";
import { newPlayer, probe } from "./helpers";

/**
 * Първо влизане в игра в чист браузър. Service worker-ът се инсталира и поема
 * страницата (skipWaiting + clients.claim) → идва `controllerchange`. Преди
 * поправката pwa.ts презареждаше страницата и на ПЪРВОТО поемане: секунда след
 * влизане тя се презареждаше сама — прозорецът с правилата изчезваше (вече
 * отбелязан като видян; тестовете на дамата падаха на „няма диалог“), а ако
 * мачът беше почнал, новото влизане в опашката го предаваше.
 */
test("първо влизане: service worker-ът поема страницата без презареждане — правилата остават", async ({
  browser,
  baseURL,
}) => {
  const storageState = await newPlayer(baseURL!);
  const ctx = await browser.newContext({ storageState, baseURL });
  // Брояч на зарежданията на този таб (sessionStorage оцелява при презареждане).
  await ctx.addInitScript(() => {
    sessionStorage.setItem("e2eLoads", String(Number(sessionStorage.getItem("e2eLoads") ?? "0") + 1));
  });
  const page = await ctx.newPage();
  await page.goto("play/draughts");
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });

  // Service worker-ът вече контролира страницата …
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 30_000 });
  // … и тя не се е презаредила (презареждането идваше веднага след поемането).
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => sessionStorage.getItem("e2eLoads")), "страницата се презареди сама").toBe("1");
  await expect(page.getByRole("dialog"), "прозорецът с правилата изчезна").toBeVisible();

  // Затварянето на правилата и мачът след това вървят нормално.
  await page.getByRole("dialog").getByRole("button", { name: /Разбрах/ }).click();
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
  expect(await page.evaluate(() => sessionStorage.getItem("e2eLoads"))).toBe("1");
  await ctx.close();
});
