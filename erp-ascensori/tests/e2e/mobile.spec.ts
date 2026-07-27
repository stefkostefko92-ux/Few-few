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
