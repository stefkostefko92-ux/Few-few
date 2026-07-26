// Достъпност — автоматична проверка по WCAG 2.1 AA.
//
// ЗАЩО Е ГЕЙТ, А НЕ ПРЕПОРЪКА. European Accessibility Act (Directive (EU)
// 2019/882) се прилага от 28 юни 2025 г., а в Италия е въведен с D.Lgs.
// 82/2022; техническият критерий е EN 301 549, който препраща към WCAG 2.1 AA.
// Продуктът се продава в ЕС на фирми, тоест изискването не е препоръка и не се
// покрива с изявление за достъпност, което не отговаря на истината.
//
// ЧЕСТНО ЗА ОБХВАТА: axe хваща около една трета от проблемите по WCAG — това,
// което се проверява машинно (контраст, имена на контроли, роли, заглавия,
// езикът на документа). Не хваща смисъл: „дали текстът на връзката казва
// НАКЪДЕ води", „дали редът на табулацията следва погледа", „дали съобщението
// за грешка казва как се поправя". Тези са за човек. Затова тук нулата е
// ПРАГЪТ, не сертификатът — на нея се стъпва, не се спира.

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { entra, UTENTI } from "./_aiuto";

/** Критериите, които EN 301 549 наистина иска: A + AA, без „best practice". */
const REGOLE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface Violazione {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

async function analizza(page: Page): Promise<Violazione[]> {
  const r = await new AxeBuilder({ page }).withTags(REGOLE).analyze();
  return r.violations as Violazione[];
}

/** Четимо съобщение: „3 нарушения" не казва какво да се поправи. */
function descrivi(v: Violazione[]): string {
  return v
    .map(
      (x) =>
        `\n  • [${x.impact ?? "?"}] ${x.id} — ${x.help}\n    ${x.nodes
          .slice(0, 3)
          .map((n) => JSON.stringify(n.target))
          .join("\n    ")}`,
    )
    .join("");
}

test("страницата за вход е достъпна", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  const v = await analizza(page);
  expect(v.length, `нарушения на /login:${descrivi(v)}`).toBe(0);
});

test("грешката при вход се ОБЯВЯВА на екранния четец", async ({ page }) => {
  // Отделно от axe: инструментът вижда, че има `role="alert"`, но не вижда, че
  // той се появява СЛЕД действието — а разликата е между „чух грешката" и
  // „натискам Accedi и нищо не се случва".
  await page.goto("/login");
  await page.getByLabel("Email").fill(UTENTI.ADMIN);
  await page.getByLabel("Password").fill("sbagliata-non-valida-2026");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await analizza(page)).toEqual([]);
});

// Трите вида страници в продукта. Ако достъпността се счупи, ще се счупи в
// една от тях: графики (цвят и текстови алтернативи), таблица (заглавия на
// колони) и форма (етикети, групи, съобщения за грешка).
for (const [nome, percorso] of [
  ["таблото с графиките", "/dashboard"],
  ["списъкът с импианти", "/impianti"],
  ["формата за кондоминиум", "/condomini"],
  ["фактурите", "/fatture"],
  ["магазинът", "/magazzino"],
  ["сроковете", "/scadenze"],
  ["падежите на вземанията", "/scadenzario"],
  ["календарът на обиколките", "/calendario"],
] as const) {
  test(`${nome} е достъпна`, async ({ page }) => {
    await entra(page, UTENTI.ADMIN);
    await page.goto(percorso);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const v = await analizza(page);
    expect(v.length, `нарушения на ${percorso}:${descrivi(v)}`).toBe(0);
  });
}

test("формата с отворен диалог е достъпна", async ({ page }) => {
  // Диалогът е мястото, където достъпността се чупи най-често: фокусът остава
  // отзад, `aria-modal` липсва, Esc не затваря. Проверява се ОТВОРЕН, защото
  // затворен той не съществува в дървото.
  await entra(page, UTENTI.ADMIN);
  await page.goto("/condomini");
  await page.getByRole("button", { name: /Nuovo|Aggiungi/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const v = await analizza(page);
  expect(v.length, `нарушения в диалога:${descrivi(v)}`).toBe(0);
});

test("тъмната тема НЕ разваля контраста", async ({ page }) => {
  // Контрастът е единственото WCAG изискване, което се чупи от смяна на цвят,
  // а не на код — тоест няма как да бъде забелязано при преглед на diff.
  await entra(page, UTENTI.ADMIN);
  await page.goto("/dashboard");
  await page.evaluate(() => {
    localStorage.setItem("ea:tema", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const v = await analizza(page);
  expect(v.length, `нарушения в тъмна тема:${descrivi(v)}`).toBe(0);
});
