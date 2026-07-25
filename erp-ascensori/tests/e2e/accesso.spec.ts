// Влизане, излизане и правата — през самата форма.

import { test, expect } from "@playwright/test";
import { entra, UTENTI, PASSWORD } from "./_aiuto";

test("влизане с валидни данни отваря таблото", async ({ page }) => {
  await entra(page, UTENTI.ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("грешна парола дава ЧЕТИМО съобщение, не празна страница", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(UTENTI.ADMIN);
  await page.getByLabel("Password").fill("sbagliata-non-valida-2026");
  await page.getByRole("button", { name: "Accedi" }).click();

  const avviso = page.getByRole("alert");
  await expect(avviso).toBeVisible();
  // Съобщението е на италиански и НЕ казва дали адресът съществува.
  await expect(avviso).not.toContainText(/utente non trovato|user not found/i);
});

test("непознат адрес пренасочва към входа и ПАЗИ целта", async ({ page }) => {
  await page.goto("/impianti");
  await expect(page).toHaveURL(/\/login\?da=/);
  // Целта се пази, за да не се започва отначало след изтекла сесия.
  expect(decodeURIComponent(page.url())).toContain("/impianti");

  await page.getByLabel("Email").fill(UTENTI.OPERATORE);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/impianti/);
});

test("подхвърлен външен адрес НЕ отвежда навън", async ({ page }) => {
  await page.goto("/login?da=https://esempio-malevolo.test/phishing");
  await page.getByLabel("Email").fill(UTENTI.OPERATORE);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  // Отвореното пренасочване е класиката: линк „влез тук" изхвърля служителя на
  // чужд сайт веднага след като е написал паролата си.
  await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
  await expect(page).not.toHaveURL(/esempio-malevolo/);
});

test("икономическият модул е скрит за оператора", async ({ page }) => {
  await entra(page, UTENTI.OPERATORE);
  // Скриването не е защитата (сървърът е), но интерфейсът не бива да предлага
  // невъзможното.
  await expect(page.getByRole("link", { name: "Fatture" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Redditività" })).toHaveCount(0);
});

test("администраторът вижда системните модули", async ({ page }) => {
  await entra(page, UTENTI.ADMIN);
  for (const nome of ["Registro operazioni", "Integrazioni", "Diritti privacy"])
    await expect(page.getByRole("link", { name: nome })).toBeVisible();
});
