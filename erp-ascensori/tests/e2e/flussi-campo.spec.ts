// Работата на терен и в склада през браузъра: рапортино с чеклист и
// материали → DDT на материалите; проверка и възлагане на импиант; движение в
// склада; жизнен цикъл на договор. Всяка стъпка — бутон на екрана.

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

async function primoDettaglio(page: Page, base: string) {
  await page.goto(base);
  await page.locator(`tbody a[href^="${base}/"]`).first().click();
  await page.waitForURL(new RegExp(`${base}/[0-9a-f-]{36}$`));
}

async function scegliPrima(select: ReturnType<Page["getByLabel"]>) {
  // Опциите идват от отделна заявка — изчакваме поне една реална.
  await expect.poll(() => select.locator("option").count()).toBeGreaterThan(1);
  const v = await select
    .locator("option")
    .evaluateAll((o) =>
      (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean),
    );
  await select.selectOption(v[0]);
}

test("ордин: рапортино с чеклист и материал, после DDT на материалите", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);

  // Артикул с наличност, за да има какво да се вложи.
  const codice = unico("PUL");
  await page.goto("/magazzino");
  await page.getByRole("button", { name: /Nuovo articolo/ }).click();
  let dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(/^Codice/).fill(codice);
  await dialogo.getByLabel(/^Nome/).fill("Pulsante di piano");
  await dialogo.getByLabel(/^Prezzo vendita/).fill("18,50");
  await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await page.goto("/movimenti");
  await page.getByRole("button", { name: "Nuovo movimento" }).click();
  dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  const articolo = dialogo.getByLabel(/^Articolo/);
  await expect(articolo.locator("option", { hasText: codice })).toHaveCount(1);
  await articolo.selectOption({
    label: (await articolo
      .locator("option", { hasText: codice })
      .textContent())!.trim(),
  });
  await dialogo.getByLabel(/^Tipo/).selectOption("ENTRATA");
  await dialogo.getByLabel(/^Quantit/).fill("10");
  await dialogo.getByRole("button", { name: /Registra|Salva/ }).click();
  await expect(dialogo).toBeHidden();

  // Нов ордин.
  const oggetto = unico("Guasto pulsantiera");
  await page.goto("/ordini");
  await page.getByRole("button", { name: /Nuovo ordine/ }).click();
  dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(/^Oggetto/).fill(oggetto);
  await scegliPrima(dialogo.getByLabel(/^Impianto/));
  await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await page.getByLabel(/^Cerca/).fill(oggetto);
  await expect(page.getByText(/^1 risultato$/)).toBeVisible();
  await page.locator("tbody a").first().click();
  await page.waitForURL(/\/ordini\/[0-9a-f-]{36}$/);

  // Рапортино с чеклист.
  await page.getByRole("button", { name: "Nuovo rapportino" }).first().click();
  dialogo = page.getByRole("dialog");
  await dialogo
    .getByLabel(/^Descrizione dell'intervento/)
    .fill("Sostituito pulsante di piano, prova di funzionamento.");
  await dialogo
    .getByRole("radiogroup", { name: "Porte di piano e serrature" })
    .getByRole("radio", { name: "Conforme", exact: true })
    // Входът е `sr-only` зад етикета си — човек натиска етикета.
    .check({ force: true });
  await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText("Sostituito pulsante di piano")).toBeVisible();

  // Материал от склада в рапортиното.
  const mat = page.getByLabel(/^Articolo/).first();
  await expect(mat.locator("option", { hasText: codice })).toHaveCount(1);
  await mat.selectOption({
    label: (await mat
      .locator("option", { hasText: codice })
      .textContent())!.trim(),
  });
  await page
    .getByLabel(/^Quantit/)
    .first()
    .fill("2");
  await page.getByRole("button", { name: "Preleva" }).first().click();
  await expect(page.getByText(codice).first()).toBeVisible();

  // DDT на материалите.
  await page.getByRole("button", { name: "Crea DDT dei materiali" }).click();
  await page.waitForURL(/\/ddt\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("cell", { name: new RegExp(codice) }),
  ).toBeVisible();
  const pdf = await page.evaluate(async () => {
    const a = document.querySelector<HTMLAnchorElement>('a[href$="/pdf"]');
    const r = await fetch(a!.href);
    return r.status;
  });
  expect(pdf).toBe(200);
  expect(problemi, problemi.join("\n")).toEqual([]);
});

test("импиант: проверка и възлагане на техник", async ({ page }) => {
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);
  await primoDettaglio(page, "/impianti");

  await page.getByRole("button", { name: "Registra verifica" }).click();
  let dialogo = page.getByRole("dialog");
  const verbale = unico("VP");
  await dialogo.getByLabel(/^Esito/).selectOption("POSITIVO");
  await dialogo.getByLabel(/^Organismo/).fill("ASL di prova");
  await dialogo.getByLabel(/^Numero verbale/).fill(verbale);
  await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText(verbale)).toBeVisible();

  await page.getByRole("button", { name: "Assegna" }).click();
  dialogo = page.getByRole("dialog");
  await scegliPrima(dialogo.getByLabel(/^Tecnico/));
  await dialogo.getByRole("button", { name: "Assegna" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText("Nessun tecnico assegnato")).toHaveCount(0);
  expect(problemi, problemi.join("\n")).toEqual([]);
});

test("договор: от чернова до активен, после спрян", async ({ page }) => {
  const problemi = sentinella(page);
  await entra(page, UTENTI.MASTER);
  const oggetto = unico("Contratto");
  await page.goto("/contratti");
  await page.getByRole("button", { name: "Nuovo contratto" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(/^Oggetto/).fill(oggetto);
  await dialogo.getByLabel(/^Canone/).fill("300");
  const oggi = new Date();
  await dialogo
    .getByLabel(/^Data di inizio/)
    .fill(oggi.toISOString().slice(0, 10));
  await dialogo
    .getByLabel(/^Data di fine/)
    .fill(new Date(oggi.getTime() + 365 * 864e5).toISOString().slice(0, 10));
  await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await page.getByLabel(/^Cerca/).fill(oggetto);
  await expect(page.getByText(/^1 risultato$/)).toBeVisible();
  await page.locator("tbody a").first().click();
  await page.waitForURL(/\/contratti\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Attivo" }).click();
  await expect(page.getByRole("button", { name: "Sospeso" })).toBeVisible();
  await page.getByRole("button", { name: "Sospeso" }).click();
  await expect(page.getByRole("button", { name: "Attivo" })).toBeVisible();
  expect(problemi, problemi.join("\n")).toEqual([]);
});
