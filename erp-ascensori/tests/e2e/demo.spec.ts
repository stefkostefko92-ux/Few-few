// Демо стендът, пуснат с DEMO=1 (сървърът чете средата при заявката):
//   DEMO=1 npm run test:e2e -- tests/e2e/demo.spec.ts
// Без DEMO=1 тестът се пропуска — останалите E2E вървят с обикновения режим.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip(process.env.DEMO !== "1", "само с DEMO=1");

test("входът показва демо профилите и влиза с едно натискане", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Prova la demo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Direzione/ }).click();
  await page.waitForURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("Master влиза без втори фактор", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Master/ }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.goto("/utenti");
  await expect(page.getByRole("heading", { name: "Utenti" })).toBeVisible();
});

test("общите акаунти не се заключват и не се сменят", async ({ page }) => {
  // Пет грешни пароли не блокират демо акаунт (паролата е публична).
  for (let i = 0; i < 6; i++) {
    const r = await page.request.post("/api/auth/login", {
      data: { email: "tecnico@erp-ascensori.local", password: "sbagliata" },
    });
    expect(r.status()).toBe(401);
  }
  await page.goto("/login");
  await page.getByRole("button", { name: /^Tecnico/ }).click();
  await page.waitForURL(/\/(dashboard|ordini)/);

  // Смяна на паролата от „Sicurezza" — отказ с обяснение.
  await page.goto("/sicurezza");
  await page.getByLabel("Password attuale").first().fill("Ascensori!2026");
  await page
    .getByLabel("Nuova password", { exact: true })
    .fill("una frase molto lunga 2026");
  await page
    .getByLabel("Ripeti la nuova password")
    .fill("una frase molto lunga 2026");
  await page.getByRole("button", { name: "Cambia password" }).click();
  await expect(page.getByText(/disattivata nella demo/)).toBeVisible();
});

test("панелът с демо профилите е достъпен (WCAG 2.1 AA)", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Prova la demo" }),
  ).toBeVisible();
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
