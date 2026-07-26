// Content-Security-Policy — през истински браузър, защото само той я налага.
//
// Този файл съществува заради една конкретна опасност: строга CSP се пише за
// час, а се чупи от промяна, която изглежда напълно невинна — нова графика,
// вграден стил, външен шрифт. Счупването не е видимо в кода и НЕ проваля нито
// интеграционните тестове (те бият по HTTP и не изпълняват скриптове), нито
// билда. Вижда се само в конзолата на човека, който вече е купил продукта.
//
// Затова тук всяко нарушение е ПРОВАЛ на теста, а не предупреждение.

import { test, expect, type Page } from "@playwright/test";
import { entra, UTENTI } from "./_aiuto";

/**
 * Закача се за трите канала, по които браузърът обявява блокиран ресурс.
 *
 * Само `console` не стига: част от нарушенията (напр. блокирана картинка) не
 * винаги стигат до конзолата, а събитието `securitypolicyviolation` се вдига
 * винаги. Регистрира се преди първата навигация, иначе първата страница минава
 * незабелязано — а тя е точно тази, която зарежда скелета на приложението.
 */
async function raccogliViolazioni(page: Page): Promise<string[]> {
  const trovate: string[] = [];

  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.effectiveDirective} ← ${e.blockedURI}`,
      );
    });
  });

  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(t))
      trovate.push(t);
  });

  return trovate;
}

async function violazioniDellaPagina(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __csp?: string[] }).__csp ?? [],
  );
}

test("хедърът е налице и е строгият, не наблюдаващият", async ({ page }) => {
  const res = await page.goto("/login");
  const csp = res?.headers()["content-security-policy"];
  expect(csp, "CSP липсва изцяло").toBeTruthy();
  expect(csp).toMatch(/'strict-dynamic'/);
  expect(csp).toMatch(/frame-ancestors 'none'/);
  // Ако това падне, някой е сложил `unsafe-inline` за скриптове „за да работи".
  expect(csp?.match(/script-src [^;]*/)?.[0]).not.toMatch(/unsafe-inline/);
});

test("nonce-ът е РАЗЛИЧЕН на всяка заявка", async ({ page }) => {
  const nonce = async () => {
    const res = await page.goto("/login");
    return res?.headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  };
  const a = await nonce();
  const b = await nonce();
  expect(a).toBeTruthy();
  // Постоянен nonce е същото като липса на nonce: научава се веднъж и се ползва.
  expect(a).not.toEqual(b);
});

test("страницата за вход се зарежда БЕЗ нито едно нарушение", async ({
  page,
}) => {
  const console_ = await raccogliViolazioni(page);
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  expect([...console_, ...(await violazioniDellaPagina(page))]).toEqual([]);
});

// Табло, списък и форма покриват трите вида страници: графики (вградени стилове
// на Recharts), таблица и въвеждане. Ако CSP се счупи, ще се счупи в една от тях.
for (const [nome, percorso] of [
  ["табло с графиките", "/dashboard"],
  ["списък с данни", "/impianti"],
  ["страница с форма", "/condomini"],
  ["календар (мрежа с връзки)", "/calendario"],
] as const) {
  test(`${nome} се зарежда БЕЗ нито едно нарушение`, async ({ page }) => {
    const console_ = await raccogliViolazioni(page);
    await entra(page, UTENTI.ADMIN);
    await page.goto(percorso);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Графиките се рисуват след първия paint; без това нарушението от
    // Recharts би се случило след края на теста.
    await page.waitForLoadState("networkidle");
    expect([...console_, ...(await violazioniDellaPagina(page))]).toEqual([]);
  });
}

test("скрипт, вмъкнат в HTML-а, НЕ се изпълнява — това е цялата причина за политиката", async ({
  page,
}) => {
  // Проиграва се XSS такъв, какъвто се случва наистина: чужд текст излиза в
  // сървърния HTML и браузърът го разчита като скрипт. Отговорът се прихваща и
  // в него се вмъква таг БЕЗ nonce — хедърите остават непокътнати, тоест важи
  // истинската наша политика.
  //
  // ЧЕСТНО ЗА ОБХВАТА: `'strict-dynamic'` НАРОЧНО се доверява на скриптове,
  // създадени от вече изпълняващ се доверен код (`createElement` + `append`) —
  // иначе Next не би могъл да зарежда собствените си чънкове. Тоест политиката
  // спира вмъкването в документа, а не нападател, който ВЕЧЕ изпълнява код.
  // Точно затова тя е ВТОРАТА преграда, а първата си остава екранирането.
  await page.route("**/login", async (route) => {
    const res = await route.fetch();
    const html = await res.text();
    await route.fulfill({
      response: res,
      body: html.replace(
        "</body>",
        "<script>window.__eseguito = true</script></body>",
      ),
    });
  });

  const violazioni = await raccogliViolazioni(page);
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();

  expect(
    await page.evaluate(
      () => (window as unknown as { __eseguito?: boolean }).__eseguito === true,
    ),
  ).toBe(false);
  // И нарушението е ДОКЛАДВАНО: иначе политиката би пазела мълчаливо и никой
  // не би разбрал, че е имало опит.
  expect([...violazioni, ...(await violazioniDellaPagina(page))].join("\n")).toMatch(
    /script-src/,
  );
});
