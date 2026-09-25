// „Sicurezza dell'account" — вторият фактор се включва ПРЕЗ ИНТЕРФЕЙСА.
//
// До тази страница API-то съществуваше, а екран нямаше: задължителният за
// MASTER/ADMIN втори фактор не можеше да бъде включен от никого. Тестът минава
// пътя на човек: сканира (тук — чете ключа), пише кода, вижда резервните кодове
// веднъж, и следващият вход иска код.

import { test, expect } from "@playwright/test";
import { entra, UTENTI, PASSWORD, unico } from "./_aiuto";
import { codice } from "../../src/lib/totp";

test("вторият фактор се включва от страницата и входът започва да го иска", async ({
  browser,
}) => {
  // Нов потребител — включеният втори фактор не бива да засяга демо акаунтите.
  const admin = await browser.newPage();
  await entra(admin, UTENTI.MASTER);
  const email = `${unico("mfa").toLowerCase()}@test.local`;
  const stato = await admin.evaluate(
    async ({ email, password }) =>
      (
        await fetch("/api/utenti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            nome: "Paola",
            cognome: "Sicura",
            ruolo: "OPERATORE",
          }),
        })
      ).status,
    { email, password: PASSWORD },
  );
  expect(stato).toBe(201);
  await admin.close();

  const page = await browser.newPage();
  await entra(page, email);
  await page.goto("/sicurezza");
  await expect(
    page.getByRole("heading", { name: "Sicurezza dell'account" }),
  ).toBeVisible();
  // Текущото устройство е отбелязано — иначе човекът не знае кой ред да пази.
  await expect(page.getByText("questo dispositivo")).toBeVisible();

  await page
    .getByRole("button", { name: "Configura la verifica in due passaggi" })
    .click();
  await expect(
    page.getByRole("img", { name: "Codice QR per l'app di autenticazione" }),
  ).toBeVisible();
  const segreto = (await page.getByTestId("segreto-mfa").innerText()).trim();
  expect(segreto).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel("Codice di verifica").fill(codice(segreto));
  await page.getByRole("button", { name: "Attiva" }).click();

  // Резервните кодове — веднъж и ясно, преди да изчезнат.
  const codici = page
    .getByRole("status")
    .filter({ hasText: "Codici di recupero" });
  await expect(codici).toBeVisible();
  await expect(codici.locator("li")).toHaveCount(8);
  await expect(page.getByText("Attiva. All'accesso")).toBeVisible();

  // Следващият вход иска кода.
  const altra = await browser.newPage();
  await altra.goto("/login");
  await altra.getByLabel("Email").fill(email);
  await altra.getByLabel("Password").fill(PASSWORD);
  await altra.getByRole("button", { name: "Accedi" }).click();
  await expect(altra.getByLabel(/codice/i)).toBeVisible();
});
