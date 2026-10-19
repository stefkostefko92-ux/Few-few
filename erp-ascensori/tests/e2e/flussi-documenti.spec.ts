// Веригата на документите през браузъра, както я минава офисът:
// оферта → редове → изпратена → приета → ордин → издаден → фактура → издадена
// → плащане → печат. Всяка стъпка е бутон на екрана, не заявка отстрани.

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

async function aggiungiRiga(page: Page, descrizione: string, prezzo: string) {
  await page.getByLabel("Descrizione", { exact: true }).fill(descrizione);
  await page.getByLabel("Prezzo (€)").fill(prezzo);
  await page.getByRole("button", { name: "Aggiungi riga" }).click();
  await expect(page.getByRole("cell", { name: descrizione })).toBeVisible();
}

async function cambiaStato(page: Page, etichetta: string) {
  await page.getByLabel("Cambia stato").selectOption({ label: etichetta });
}

test("оферта → ордин → фактура → плащане, всичко от екрана", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problemi = sentinella(page);
  await entra(page, UTENTI.DIREZIONE);

  // 1. Оферта.
  await page.goto("/preventivi");
  await page.getByRole("button", { name: "Nuovo preventivo" }).click();
  const oggetto = unico("Sostituzione quadro");
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(/^Oggetto/).fill(oggetto);
  // Получателят от сийда — с пълни реквизити за SdI.
  const dest = dialogo.getByLabel(/^Destinatario/);
  await expect(dest.locator("option", { hasText: "Bianchi" })).toHaveCount(1);
  await dest.selectOption({
    label: (await dest
      .locator("option", { hasText: "Bianchi" })
      .textContent())!.trim(),
  });
  await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await page.getByLabel(/^Cerca/).fill(oggetto);
  await expect(page.getByText(/^1 risultato$/)).toBeVisible();
  await page.locator("tbody a").first().click();
  await expect(page).toHaveURL(/\/preventivi\/[0-9a-f-]{36}$/);

  await aggiungiRiga(page, "Quadro di manovra", "1200");
  await aggiungiRiga(page, "Manodopera", "360");
  await cambiaStato(page, "Inviato");
  await expect(page.getByText("Inviato").first()).toBeVisible();
  await cambiaStato(page, "Approvato");
  // Приета: редовете замръзват, появяват се действията.
  await expect(page.getByTestId("voci-bloccate")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aggiungi riga" })).toHaveCount(
    0,
  );

  // 2. Ордин от офертата.
  await page.getByRole("button", { name: "Crea ordine di lavoro" }).click();
  await expect(page).toHaveURL(/\/ordini\/[0-9a-f-]{36}$/);
  await expect(page.getByText(oggetto)).toBeVisible();
  await page.getByRole("button", { name: /Emesso/ }).click();
  await expect(page.getByRole("button", { name: /Confermato/ })).toBeVisible();

  // 3. Фактура от ордина.
  await page.getByRole("button", { name: "Crea fattura" }).click();
  await expect(page).toHaveURL(/\/fatture\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("cell", { name: "Quadro di manovra" }),
  ).toBeVisible();
  // 1200 + 360 = 1560 + 22 % = 1903,20
  await expect(page.getByText("1.903,20").first()).toBeVisible();
  await cambiaStato(page, "Emessa");
  await expect(page.getByTestId("voci-bloccate")).toBeVisible();

  // 4. Плащане и печат.
  await page.getByLabel("Importo").fill("500");
  await page.getByRole("button", { name: "Registra" }).click();
  await expect(page.getByText("Parzialmente pagata").first()).toBeVisible();
  const pdf = await page.evaluate(async () => {
    const a = document.querySelector<HTMLAnchorElement>('a[href$="/pdf"]');
    const r = await fetch(a!.href);
    return { status: r.status, tipo: r.headers.get("content-type") };
  });
  expect(pdf).toEqual({ status: 200, tipo: "application/pdf" });

  expect(problemi, problemi.join("\n")).toEqual([]);
});
