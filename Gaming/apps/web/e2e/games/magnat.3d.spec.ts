import { test, expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { expectNoErrors, expectServerAdvanced, openGame, probe, stateVersion, waitMyTurn } from "./helpers";
import { snapBoth } from "./helpers-grid";
import { expectDecisionOnScreen } from "./decision-checks";

/**
 * Магнат с WebGL (проект games-3d, swiftshader): 3D платното наистина рисува
 * дъската (не е празно/еднотонно), пулът ми е върху платното, а ходът минава с
 * истински кликове по бутоните — след хвърлянето пулът се премества и платното
 * се прерисува. 3D дъската не избира полета с клик, затова проекцията на пула
 * идва от тестовата кука `window.__asoE2E.magnat` (само при navigator.webdriver).
 */

const act = (page: Page, name: string): Locator => page.locator(`[data-action="${name}"]`);

async function raw(png: Buffer): Promise<{ data: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Брой различни цветове (по 4 бита на канал) — празно платно дава 1–2. */
async function distinctColors(png: Buffer): Promise<number> {
  const { data } = await raw(png);
  const seen = new Set<number>();
  for (let i = 0; i + 2 < data.length; i += 3) seen.add(((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4));
  return seen.size;
}

/** Дял пиксели, които видимо са се променили между две снимки. */
async function changed(a: Buffer, b: Buffer): Promise<number> {
  const x = await raw(a);
  const y = await raw(b);
  if (x.w !== y.w || x.h !== y.h) return 1;
  let diff = 0;
  for (let i = 0; i + 2 < x.data.length; i += 3) {
    const d = Math.abs(x.data[i]! - y.data[i]!) + Math.abs(x.data[i + 1]! - y.data[i + 1]!) + Math.abs(x.data[i + 2]! - y.data[i + 2]!);
    if (d > 48) diff++;
  }
  return diff / (x.w * x.h);
}

type Pt = { x: number; y: number } | null;
const tokenAt = (page: Page, seat: number): Promise<Pt> =>
  page.evaluate(
    (s) => (window as unknown as { __asoE2E?: { magnat?: { token: (n: number) => Pt } } }).__asoE2E?.magnat?.token(s) ?? null,
    seat,
  );
const animating = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __asoE2E?: { magnat?: { animating: () => boolean } } }).__asoE2E?.magnat?.animating() ?? true);

async function send(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeEnabled();
  const v = await stateVersion(page);
  await target.click();
  await expectServerAdvanced(page, v);
}

test("магнат 3D: платното рисува дъската, пулът се мести след хвърляне, ходът минава с клик", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(240_000);
  const t = await openGame(browser, baseURL!, "MAGNAT");
  const { page } = t;
  const me = Number(await probe(page).getAttribute("data-seat"));
  const canvas = page.locator(".mag-board canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(150);

  // Сцената е вдигната (куката е регистрирана) и дъската е нарисувана.
  await expect.poll(() => tokenAt(page, me), { timeout: 60_000 }).not.toBeNull();
  await expect.poll(() => animating(page), { timeout: 60_000 }).toBe(false);
  await expect.poll(async () => distinctColors(await canvas.screenshot()), { timeout: 60_000 }).toBeGreaterThan(60);
  await snapBoth(page, info, "magnat-3d");
  await expect.poll(() => animating(page), { timeout: 60_000 }).toBe(false);

  // Пулът ми е върху платното.
  const start = (await tokenAt(page, me))!;
  expect(start.x).toBeGreaterThan(box.x);
  expect(start.x).toBeLessThan(box.x + box.width);
  expect(start.y).toBeGreaterThan(box.y);
  expect(start.y).toBeLessThan(box.y + box.height);

  // Хвърляне с клик → пулът тръгва и спира на друго място; платното е прерисувано.
  expect(await waitMyTurn(page, 90_000)).toBe(true);
  await expect(page.locator("[data-mag-phase]")).toHaveAttribute("data-mag-phase", "ROLL");
  const before = await canvas.screenshot();
  await send(page, act(page, "roll"));
  await expect
    .poll(async () => {
      const p = await tokenAt(page, me);
      return !!p && Math.hypot(p.x - start.x, p.y - start.y) > 5 && !(await animating(page));
    }, { timeout: 60_000 })
    .toBe(true);
  expect(await changed(before, await canvas.screenshot())).toBeGreaterThan(0.002);

  // Довърши хода: решенията (покупка/отказ, търг, дълг) идват сами в прозореца
  // над 3D платното, после „Край на хода“ от таблото.
  for (let step = 0; step < 8 && (await waitMyTurn(page, 60_000)); step++) {
    const phase = await page.locator("[data-mag-phase]").getAttribute("data-mag-phase");
    if (phase === "ROLL") break; // чифт — следващото хвърляне вече е друг ход
    if (phase === "BUY") {
      const card = await expectDecisionOnScreen(page, "magnat-buy");
      await snapBoth(page, info, "magnat-3d-buy");
      const buy = card.locator('[data-action="buy"]');
      await send(page, (await buy.isEnabled()) ? buy : act(page, "decline"));
    } else if (phase === "AUCTION") {
      await expectDecisionOnScreen(page, "magnat-auction");
      await send(page, act(page, "pass-bid"));
    } else if (phase === "DEBT") {
      const card = await expectDecisionOnScreen(page, "magnat-debt");
      const pay = card.locator('[data-action="pay-debt"]');
      await send(page, (await pay.isEnabled()) ? pay : card.locator('[data-action="debt-mortgage"], [data-action="debt-sell"]').first());
    } else if (phase === "MANAGE") {
      await send(page, act(page, "end"));
      break;
    } else break;
  }
  expectNoErrors(t);
  await t.ctx.close();
});
