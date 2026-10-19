// Всяка страница от менюто, отворена от всяко ниво, което я вижда в менюто.
//
// Провал: 4xx/5xx от заявка на страницата (освен 401 при подновяване), грешка
// в JavaScript, или текст „Errore"/„non autorizzato" на екрана. Така се лови
// таб, който се отваря, но е празен, защото маршрутът зад него отказва на
// същото ниво, на което менюто го показва.

import { test, expect } from "@playwright/test";
import { entra, UTENTI } from "./_aiuto";

const RUOLI = {
  MASTER: UTENTI.MASTER,
  DIREZIONE: UTENTI.DIREZIONE,
  RESPONSABILE: "responsabile@erp-ascensori.local",
  TECNICO: UTENTI.TECNICO,
  OPERATORE: UTENTI.OPERATORE,
  CLIENTE: "cliente@erp-ascensori.local",
} as const;

for (const [ruolo, email] of Object.entries(RUOLI)) {
  test(`${ruolo}: всеки таб от менюто се отваря без отказ и без грешка`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await entra(page, email);
    // Менюто се рисува след `/api/me` (ролята решава кои връзки се виждат).
    await expect
      .poll(() => page.getByRole("navigation").getByRole("link").count())
      // Клиентът има една страница — своята; вътрешните нива — менюто.
      .toBeGreaterThan(ruolo === "CLIENTE" ? 0 : 3);
    const voci = await page
      .getByRole("navigation")
      .getByRole("link")
      .evaluateAll((a) =>
        (a as HTMLAnchorElement[]).map((x) => new URL(x.href).pathname),
      );
    expect(voci.length).toBeGreaterThan(ruolo === "CLIENTE" ? 0 : 3);

    const problemi: string[] = [];
    let corrente = "";
    page.on("pageerror", (e) => problemi.push(`${corrente} JS: ${e.message}`));
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (!u.pathname.startsWith("/api/") || u.pathname === "/api/auth/refresh")
        return;
      if (r.status() >= 400)
        problemi.push(
          `${corrente} → HTTP ${r.status()} ${r.request().method()} ${u.pathname}${u.search}`,
        );
    });

    for (const voce of [...new Set(voci)]) {
      corrente = voce;
      await page.goto(voce);
      await page.waitForLoadState("networkidle");
      // Детайл: първият запис от списъка, ако има.
      const link = page.locator(`tbody a[href^="${voce}/"]`).first();
      if (await link.count()) {
        corrente = `${voce}/[id]`;
        await link.click();
        await page.waitForURL(new RegExp(`^[^?]*${voce}/[^/]+$`));
        await page.waitForLoadState("networkidle");
      }
      const testo = await page.locator("main").innerText();
      if (/non autorizzat|Accesso negato|Errore di caricamento/i.test(testo))
        problemi.push(`${corrente}: на екрана — отказ/грешка`);
    }
    expect(problemi, problemi.join("\n")).toEqual([]);
  });
}
