// „Modello dei documenti" през интерфейса: смяна на заглавие и цвят, запис,
// преглед. Правилата (фиксирано заглавие, лого без метаданни) са в
// `modello-documenti.int.test.ts`; тук — че човек стига до тях.

import { test, expect } from "@playwright/test";
import { entra, UTENTI } from "./_aiuto";

test("администраторът сменя шаблона и получава преглед в PDF", async ({
  page,
}) => {
  await entra(page, UTENTI.ADMIN);
  await page.goto("/impostazioni/documenti");
  await expect(
    page.getByRole("heading", { name: "Modello dei documenti", level: 1 }),
  ).toBeVisible();

  // Заглавието на фактурата е заключено и казва защо.
  await page.getByRole("tab", { name: "Documento contabile" }).click();
  await expect(page.getByLabel("Titolo stampato")).toBeDisabled();
  await expect(page.getByText(/Titolo fisso/)).toBeVisible();

  await page.getByRole("tab", { name: "Preventivo" }).click();
  await page.getByLabel("Titolo stampato").fill("Offerta");
  await page.getByLabel("Testo dopo i totali").fill("Validità 30 giorni.");

  // Преглед: POST към сървъра с незаписания шаблон → PDF.
  const [risposta] = await Promise.all([
    page.waitForResponse((r) =>
      r.url().endsWith("/api/dati-azienda/modello/anteprima"),
    ),
    page.getByRole("button", { name: /Anteprima/ }).click(),
  ]);
  expect(risposta.status()).toBe(200);
  expect(risposta.headers()["content-type"]).toBe("application/pdf");

  await page.getByRole("button", { name: "Salva modello" }).click();
  await expect(page.getByRole("status")).toContainText("Modello salvato");

  // Връщаме по подразбиране — демо данните се ползват и от други тестове.
  await page.getByLabel("Titolo stampato").fill("Preventivo");
  await page.getByLabel("Testo dopo i totali").fill("");
  await page.getByRole("button", { name: "Salva modello" }).click();
  await expect(page.getByRole("status")).toContainText("Modello salvato");
});
