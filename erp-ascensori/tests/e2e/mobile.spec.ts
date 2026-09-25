// Потокът на ТЕХНИКА — от телефон, както го прави в машинното помещение.

import { test, expect } from "@playwright/test";
import { entra, UTENTI } from "./_aiuto";

test("QR стикерът отваря точно този импиант след вход", async ({ page }) => {
  // Първо вземаме една матрикола, както би направил сканиращият.
  await entra(page, UTENTI.TECNICO);
  await page.goto("/impianti");
  const matricola = (
    await page.locator("table tbody tr td").first().innerText()
  ).trim();
  expect(matricola.length).toBeGreaterThan(0);

  // Сканирането води на кратък адрес; той пренасочва към импианта.
  await page.goto(`/i/${encodeURIComponent(matricola)}`);
  await expect(page).toHaveURL(/\/impianti\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    matricola,
  );

  // И самият код се дава като SVG.
  //
  // През НАВИГАЦИЯ, не през `request`/`page.request`: бисквитката на сесията е
  // `secure` (в продукция), а контекстът за заявки на Playwright не я праща по
  // http към 127.0.0.1, макар браузърът да я праща. Това е особеност на
  // тестовия стенд, не на продукта — зад Nginx всичко е по TLS.
  const id = page.url().split("/impianti/")[1];
  const qr = await page.goto(`/api/impianti/${id}/qr`);
  expect(qr?.status()).toBe(200);
  expect(qr?.headers()["content-type"]).toMatch(/image\/svg\+xml/);
});

test("интерфейсът не се разлива хоризонтално на телефон", async ({ page }) => {
  await entra(page, UTENTI.TECNICO);
  await page.goto("/ordini");
  await page.waitForLoadState("networkidle");
  // Хоризонталният скрол на цялата страница е класическият дефект на „мобилна"
  // версия, направена само с media queries.
  const scorre = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(scorre).toBe(false);
});

// ТЕСТЪТ ГОРЕ СИ МИНАВАШЕ ПРИ СЧУПЕН ТЕЛЕФОНЕН ИЗГЛЕД. Менюто стоеше постоянно
// отворено и взимаше 60 % от ширината; съдържанието не се СКРОЛВАШЕ, а се
// РЕЖЕШЕ — тоест хоризонтален скрол нямаше. Долните два теста мерят това,
// което човек вижда: колко място остава за работата и дали текстът се побира.

test("на телефон съдържанието взима целия екран, менюто е чекмедже", async ({
  page,
}) => {
  await entra(page, UTENTI.TECNICO);
  await page.goto("/ordini");
  await page.waitForLoadState("networkidle");

  const larghezza = page.viewportSize()?.width ?? 0;
  const main = await page.locator("main").boundingBox();
  expect(main?.width ?? 0).toBeGreaterThanOrEqual(larghezza - 1);

  // Затворено: връзките не са видими и не са в реда на табулация.
  const voce = page.getByRole("link", { name: "Impianti" });
  await expect(voce).toBeHidden();

  const apri = page.getByRole("button", { name: "Apri il menu" });
  await expect(apri).toHaveAttribute("aria-expanded", "false");
  await apri.click();
  await expect(voce).toBeVisible();
  await expect(apri).toHaveAttribute("aria-expanded", "true");
  // Фокусът е влязъл в чекмеджето (WCAG 2.4.3).
  await expect(
    page.getByRole("button", { name: "Chiudi il menu" }),
  ).toBeFocused();

  // Escape затваря и връща фокуса на бутона, който го е отворил.
  await page.keyboard.press("Escape");
  await expect(voce).toBeHidden();
  await expect(apri).toBeFocused();

  // Навигацията затваря чекмеджето — новата страница не се отваря под него.
  await apri.click();
  await voce.click();
  await expect(page).toHaveURL(/\/impianti/);
  await expect(voce).toBeHidden();
});

test("на телефон нито един бутон не реже текста си", async ({ page }) => {
  await entra(page, UTENTI.TECNICO);
  for (const percorso of ["/ordini", "/impianti", "/dashboard"]) {
    await page.goto(percorso);
    await page.waitForLoadState("networkidle");
    // Бутон с фиксирана височина и пренесен текст изглежда наред в кода и
    // отрязан на екрана — точно така излезе „Nuovo ordine di lavoro".
    const tagliati = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "main button, main a.btn-primary, main a.btn-secondary",
        ),
      ]
        .filter((b) => b.offsetParent !== null)
        .filter(
          (b) =>
            b.scrollHeight > b.clientHeight + 1 ||
            b.scrollWidth > b.clientWidth + 1,
        )
        .map((b) => b.textContent?.trim() ?? "?"),
    );
    expect(tagliati, `${percorso}: ${tagliati.join(" · ")}`).toEqual([]);
  }
});

test("PWA обвивката е инсталируема", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  const manifest = (await m.json()) as {
    display: string;
    icons: { purpose?: string }[];
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  const offline = await request.get("/offline.html");
  expect(offline.status()).toBe(200);
});
