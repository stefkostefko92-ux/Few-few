// Панелът „Amministrazione" и действията над акаунти — ПРЕЗ ИНТЕРФЕЙСА.
//
// HTTP тестовете (`amministrazione.int.test.ts`) доказват правилата; тук се
// доказва, че човек стига до тях: избира фирма и вижда лентата, отключва
// заключен колега от диалога „Sicurezza".

import { test, expect } from "@playwright/test";
import { entra, UTENTI, PASSWORD, unico } from "./_aiuto";

test("MASTER влиза във фирма от панела и лентата го казва на всяка страница", async ({
  page,
}) => {
  await entra(page, UTENTI.MASTER);
  const slug = unico("e2e-az")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const ragione = `Ascensori ${slug}`;
  const stato = await page.evaluate(
    async ({ slug, ragione }) =>
      (
        await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            ragioneSociale: ragione,
            email: `${slug}@test.local`,
          }),
        })
      ).status,
    { slug, ragione },
  );
  expect(stato).toBe(201);

  await page.goto("/amministrazione");
  await expect(
    page.getByRole("heading", { name: "Amministrazione", level: 1 }),
  ).toBeVisible();
  await page.getByLabel("Azienda", { exact: true }).selectOption({
    label: ragione,
  });
  await page.getByRole("button", { name: "Entra nell'azienda" }).click();

  const banner = page.getByTestId("banner-contesto");
  await expect(banner).toContainText(ragione);
  await page.goto("/impianti");
  await expect(banner).toContainText(ragione);

  await banner.getByRole("button", { name: "Esci dall'azienda" }).click();
  await expect(banner).toHaveCount(0);
});

test("заключен колега се отключва от диалога „Sicurezza“", async ({ page }) => {
  await entra(page, UTENTI.ADMIN);
  const email = `${unico("blocco").toLowerCase()}@test.local`;
  const cognome = unico("Rossi");
  const creato = await page.evaluate(
    async ({ email, password, cognome }) => {
      const r = await fetch("/api/utenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          nome: "Luca",
          cognome,
          ruolo: "OPERATORE",
        }),
      });
      // пет грешни опита — акаунтът се заключва
      for (let i = 0; i < 5; i++)
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "Sbagliata!2026x" }),
          credentials: "omit",
        });
      return r.status;
    },
    { email, password: PASSWORD, cognome },
  );
  expect(creato).toBe(201);

  await page.goto("/utenti");
  await page.getByLabel("Cerca utente").fill(cognome);
  const riga = page.getByRole("row", { name: new RegExp(cognome) });
  await expect(riga.getByText("Bloccato", { exact: true })).toBeVisible();
  await riga.getByRole("button", { name: "Sicurezza" }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Sblocca" }).click();
  await expect(dialogo.getByRole("status")).toHaveText("Accesso sbloccato.");
  await dialogo.getByRole("button", { name: "Chiudi" }).click();
  await expect(riga.getByText("Attivo", { exact: true })).toBeVisible();
});
