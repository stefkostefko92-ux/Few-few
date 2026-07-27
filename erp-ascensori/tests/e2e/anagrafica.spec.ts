// Създаване на запис през формата — потокът, който операторът прави всеки ден.

import { test, expect } from "@playwright/test";
import { entra, UTENTI, unico } from "./_aiuto";

test("създаване на кондоминиум и намирането му в списъка", async ({ page }) => {
  await entra(page, UTENTI.OPERATORE);
  // По ПЪТ, не по надпис: „Condomìni" носи ударение и точното изписване е
  // въпрос на съдържание, не на поток. Самата навигация се проверява отделно.
  await page.goto("/condomini");
  await expect(page).toHaveURL(/\/condomini/);

  const nome = unico("Condominio");
  await page
    .getByRole("button", { name: /Nuov[oa]/i })
    .first()
    .click();
  await page.getByLabel(/^Nome/).fill(nome);
  await page.getByLabel(/^Indirizzo/).fill("Via E2E 1");
  await page.getByLabel(/^Citt/).fill("Milano");
  await page.getByRole("button", { name: "Salva", exact: true }).click();

  await expect(page.getByText(nome)).toBeVisible({ timeout: 15_000 });
});

test("грешката от сървъра се ПОКАЗВА, не се преглъща", async ({ page }) => {
  await entra(page, UTENTI.OPERATORE);
  await page.goto("/condomini");
  await page
    .getByRole("button", { name: /Nuov[oa]/i })
    .first()
    .click();
  // Празно задължително поле: формата не бива да праща и да мълчи.
  await page.getByLabel(/^Indirizzo/).fill("Via Senza Nome");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  // Браузърната валидация или съобщението от сървъра — важното е формата да
  // остане отворена, вместо да се затвори, все едно е записано.
  await expect(page.getByLabel(/^Nome/)).toBeVisible();
});
