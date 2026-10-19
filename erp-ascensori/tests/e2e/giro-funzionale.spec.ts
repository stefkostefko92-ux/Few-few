// Функционален обход: всеки списъчен таб се ПОЛЗВА през формата — създаване,
// промяна без промяна, изтриване — както човек би го направил.
//
// Защо отделен слой: HTTP тестовете минават и когато формата праща нещо, което
// маршрутът не приема (празно поле като `null`, дата като низ, отметка, която
// няма). Тук формата се попълва автоматично по вида на полетата, а провал е
// всяко съобщение за грешка в диалога, всеки 5xx и всяка грешка в конзолата.

import { test, expect, type Page } from "@playwright/test";
import { entra, UTENTI, unico } from "./_aiuto";

/** Стойност по името на полето — валидна за италианските проверки. */
function valorePer(nome: string, tipo: string, n: string): string {
  const giorno = (d: number) =>
    new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
  // Крайната дата след началната: „fine", „scadenza" — година напред.
  if (tipo === "date")
    return /fine|scadenza/i.test(nome) ? giorno(365) : giorno(0);
  if (tipo === "datetime-local") return new Date().toISOString().slice(0, 16);
  if (/^anno/i.test(nome)) return "2020";
  if (/velocita/i.test(nome)) return "1.000";
  if (/slug/i.test(nome)) return n.toLowerCase();
  if (tipo === "number") return "10";
  if (tipo === "email" || /email|pec/i.test(nome))
    return `${n}@test.it`.toLowerCase();
  if (/partitaIva|piva/i.test(nome)) return "12345678903";
  if (/codiceFiscale/i.test(nome)) return "RSSMRA80A01H501U";
  if (/^cap$/i.test(nome)) return "20100";
  if (/provincia/i.test(nome)) return "MI";
  if (/telefono|cellulare/i.test(nome)) return "+39 02 1234567";
  if (/iban/i.test(nome)) return "IT60X0542811101000000123456";
  if (/codiceDestinatario|codiceSdi/i.test(nome)) return "ABC1234";
  if (/targa/i.test(nome))
    return `AB${Math.floor(Math.random() * 900 + 100)}CD`;
  if (/canone|prezzo|importo|costo|capitale/i.test(nome)) return "100,00";
  if (/aliquota/i.test(nome)) return "22";
  if (/anno/i.test(nome)) return "2020";
  if (/tags|specializzazioni/i.test(nome)) return "funi, quadri";
  return n;
}

async function compila(page: Page, dialogo: ReturnType<Page["getByRole"]>) {
  const n = unico("GF");
  const controlli = dialogo.locator('[id^="f-"]');
  const quanti = await controlli.count();
  for (let i = 0; i < quanti; i++) {
    const c = controlli.nth(i);
    const id = (await c.getAttribute("id"))!.slice(2);
    const tag = await c.evaluate((e) => e.tagName.toLowerCase());
    if (tag === "select") {
      const opzioni = await c
        .locator("option")
        .evaluateAll((o) =>
          (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean),
        );
      // Шофьорът е уникален за автомобил — оставяме го празен.
      if (opzioni.length && !/conducente/i.test(id))
        await c.selectOption(opzioni[0]);
      continue;
    }
    if (tag === "div") {
      const prima = c.locator('input[type="checkbox"]').first();
      if (await prima.count()) await prima.check();
      continue;
    }
    const tipo = (await c.getAttribute("type")) ?? "text";
    if (tipo === "checkbox" || tipo === "file") continue;
    if (!(await c.isEditable())) continue;
    // Незадължителни кодове с точен формат (CIG/CUP) остават празни.
    if (/^(cig|cup)$/i.test(id)) continue;
    await c.fill(valorePer(id, tipo, n));
  }
  return n;
}

const TABS = [
  "/condomini",
  "/amministratori",
  "/dipendenti",
  "/automezzi",
  "/cottimisti",
  "/squadre",
  "/impianti",
  "/scadenze",
  "/magazzino",
  "/contratti",
  "/preventivi",
  "/ordini",
  "/fatture",
  "/ddt",
  "/documenti",
  "/aziende",
];

for (const tab of TABS) {
  test(`таб ${tab}: създаване, промяна и изтриване през формата`, async ({
    page,
  }) => {
    const problemi: string[] = [];
    page.on("pageerror", (e) => problemi.push(`JS: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
        problemi.push(`console: ${m.text()}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500)
        problemi.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    });
    page.on("dialog", (d) => {
      if (d.type() === "alert") problemi.push(`alert: ${d.message()}`);
      void d.accept();
    });

    await entra(page, UTENTI.MASTER);
    await page.goto(tab);
    await expect(page.locator("h1").first()).toBeVisible();

    // Създаване.
    await page
      .getByRole("button", { name: /^\s*Nuov[oa]/ })
      .first()
      .click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    const n = await compila(page, dialogo);
    await dialogo.getByRole("button", { name: "Salva", exact: true }).click();
    const errore = dialogo.getByRole("alert");
    await expect(dialogo.or(errore).first()).toBeVisible();
    await page.waitForTimeout(800);
    if (await errore.isVisible().catch(() => false))
      problemi.push(`създаване: ${await errore.innerText()}`);
    await expect
      .soft(dialogo, `създаването не затваря формата: ${problemi.join(" | ")}`)
      .toBeHidden({ timeout: 10_000 });

    if (!(await dialogo.isVisible())) {
      // Промяна без промяна — формата трябва да приеме собствените си данни.
      await page.getByLabel(/^Cerca/).fill(n);
      // Търсенето е по уникалната стойност: един резултат е нашият, дори
      // колоната с нея да не се показва (предметът на фактурата).
      await expect(page.getByText(/^1 risultato$/)).toBeVisible({
        timeout: 10_000,
      });
      const riga = page.locator("tbody tr").first();
      const trovata = await riga
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (trovata) {
        await riga.getByRole("button", { name: "Modifica" }).click();
        await expect(dialogo).toBeVisible();
        await dialogo
          .getByRole("button", { name: "Salva", exact: true })
          .click();
        await page.waitForTimeout(800);
        if (await errore.isVisible().catch(() => false))
          problemi.push(`промяна: ${await errore.innerText()}`);
        await expect.soft(dialogo).toBeHidden({ timeout: 10_000 });
        const elimina = riga.getByRole("button", { name: "Elimina" });
        if (await elimina.isVisible().catch(() => false)) {
          await elimina.click();
          await page.waitForTimeout(800);
        }
      } else problemi.push("новият запис не се намира с търсенето");
    }

    expect(problemi, problemi.join("\n")).toEqual([]);
  });
}
