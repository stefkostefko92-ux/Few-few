// Документалният цикъл — там, където грешката струва пари.

import { test, expect } from "@playwright/test";
import { entra, UTENTI, unico } from "./_aiuto";

test("фактура: редовете дават тотала, а SDI проверката е ВИДИМА", async ({ page }) => {
  await entra(page, UTENTI.DIREZIONE);
  await page.goto("/fatture");

  const oggetto = unico("Fattura");
  await page.getByRole("button", { name: /Nuov[oa]/i }).first().click();
  await page.getByLabel(/^Oggetto/).fill(oggetto);
  await page.getByRole("button", { name: "Salva", exact: true }).click();

  // Списъкът не показва „oggetto" като колона — чакаме формата да се затвори и
  // отваряме най-новата фактура. През ВРЪЗКАТА в първата клетка: същият път, по
  // който минава и човек с клавиатура.
  await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0, {
    timeout: 15_000,
  });
  // По ПОЗИЦИЯ, не по формат на номера: „FT-2026-0001" е решение на домейна и
  // може да се смени; проверяваме потока, не номерацията (тя си има тестове).
  await page.locator("tbody a").first().click();
  await expect(page).toHaveURL(/\/fatture\/[0-9a-f-]{36}/);
  await expect(page.getByText(oggetto)).toBeVisible();

  await page.getByLabel(/^Descrizione/).fill("Canone trimestrale");
  await page.getByLabel(/^Qt/).fill("1");
  await page.getByLabel(/^Prezzo/).fill("300,00");
  await page.getByRole("button", { name: /Aggiungi/i }).first().click();

  // 300,00 + 22 % = 366,00 — тоталът се смята от сървъра, не се пише на ръка.
  await expect(page.getByText("366,00", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });

  // Проверката за SDI трябва да се вижда БЕЗ да се натиска нищо: фактура извън
  // SDI се третира като неиздадена.
  await expect(page.getByRole("status")).toBeVisible();
});

test("рентабилността показва бележката, че не е печалба", async ({ page }) => {
  await entra(page, UTENTI.DIREZIONE);
  await page.getByRole("link", { name: "Redditività" }).click();
  await expect(page).toHaveURL(/\/redditivita/);
  // Числото служи за сравнение, не за деклариране — и това трябва да е на екрана.
  await expect(page.getByText(/costi indiretti/i)).toBeVisible({ timeout: 15_000 });
});

test("регистърът на операциите се проверява като цял", async ({ page }) => {
  await entra(page, UTENTI.ADMIN);
  await page.getByRole("link", { name: "Registro operazioni" }).click();
  await expect(page).toHaveURL(/\/audit/);
  await expect(page.locator("table")).toBeVisible();
});
