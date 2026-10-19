// Системните табове се ПОЛЗВАТ, не само отварят: нов потребител и смяна на
// паролата му, API ключ, запис на фирмените данни, търсене по чл. 15,
// пратка за conservazione, навигация в календара, групиране на рентабилността.

import { test, expect, type Page } from "@playwright/test";
import { entra, UTENTI, unico } from "./_aiuto";

function sentinella(page: Page) {
  const problemi: string[] = [];
  page.on("pageerror", (e) => problemi.push(`JS: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500)
      problemi.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on("dialog", (d) => {
    if (d.type() === "alert") problemi.push(`alert: ${d.message()}`);
    void d.accept();
  });
  return problemi;
}

test("утенти: нов потребител, после нова парола", async ({ page }) => {
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);
  await page.goto("/utenti");
  await page.getByRole("button", { name: "Nuovo utente" }).click();
  const dialogo = page.getByRole("dialog");
  const email = `${unico("u").toLowerCase()}@test.it`;
  await dialogo.getByLabel(/^Nome/).fill("Giulia");
  await dialogo.getByLabel(/^Cognome/).fill("Verdi");
  await dialogo.getByLabel(/^E-?mail/i).fill(email);
  await dialogo.getByLabel(/^Password/).fill("scala mobile al quinto piano");
  await dialogo.getByRole("button", { name: /Crea|Salva/ }).click();
  await expect(dialogo).toBeHidden();
  const riga = page.locator("tr", { hasText: email });
  await expect(riga).toBeVisible();
  await riga.getByRole("button", { name: "Password" }).click();
  const d2 = page.getByRole("dialog");
  await d2
    .getByLabel(/password/i)
    .first()
    .fill("ascensore panoramico 2026");
  await d2.getByRole("button", { name: "Reimposta" }).click();
  await expect(d2).toBeHidden();
  expect(problemi, problemi.join("\n")).toEqual([]);
});

test("интеграции: API ключ се показва веднъж", async ({ page }) => {
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);
  await page.goto("/integrazioni");
  await page.getByLabel("Etichetta (a cosa serve)").fill(unico("Gestionale"));
  await page.getByRole("checkbox", { name: "impianti:read" }).check();
  await page.getByRole("button", { name: "Crea chiave" }).click();
  await expect(
    page.getByText(/ea_[A-Za-z0-9_-]{10,}|erp_[A-Za-z0-9_-]{10,}/).first(),
  ).toBeVisible();
  expect(problemi, problemi.join("\n")).toEqual([]);
});

test("фирмени данни: запис и потвърждение", async ({ page }) => {
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);
  await page.goto("/impostazioni");
  await page.getByLabel("Sito web").fill("https://www.ascensoridemo.it");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(
    page
      .getByRole("status")
      .or(page.getByText(/salvat/i))
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Sito web")).toHaveValue(
    "https://www.ascensoridemo.it",
  );
  expect(problemi, problemi.join("\n")).toEqual([]);
});

test("поверителност, conservazione, календар, рентабилност", async ({
  page,
}) => {
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);

  await page.goto("/privacy");
  await page
    .getByLabel("Nome, cognome, ragione sociale o e-mail")
    .fill("Rossi");
  await page.getByRole("button", { name: "Cerca" }).click();
  await expect(page.getByText("Mario Rossi").first()).toBeVisible();

  await page.goto("/conservazione");
  const scarica = page.waitForEvent("download");
  await page.getByRole("button", { name: "Scarica il pacchetto" }).click();
  expect((await scarica).suggestedFilename()).toMatch(/\.zip$/);

  await page.goto("/calendario");
  const mese = await page.locator("main").innerText();
  await page.getByRole("button", { name: "Mese successivo" }).click();
  await expect
    .poll(async () => (await page.locator("main").innerText()) !== mese)
    .toBe(true);
  await page.getByRole("button", { name: "Oggi" }).click();

  await page.goto("/redditivita");
  await page.getByLabel("Raggruppa per").selectOption({ index: 1 });
  await expect(page.locator("table, p").first()).toBeVisible();

  expect(problemi, problemi.join("\n")).toEqual([]);
});
