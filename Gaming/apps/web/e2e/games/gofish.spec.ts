import { test, expect, type Locator } from "@playwright/test";
import { expectGameOverCard, expectNoErrors, openGame } from "./helpers";
import {
  clickAndAdvance,
  expectInside,
  expectNoHorizontalScroll,
  expectNoOverlap,
  expectNotTruncated,
  expectNoRejections,
  expectStageCannotScroll,
  playAgain,
  snap,
  waitFor,
  watchSocket,
} from "./helpers-draw";
import { decision, expectDecisionClearOf, expectDecisionOnScreen, expectMinimizeAndReopen } from "./prompt-checks";

/** Whom to ask is decided by the opponents' seats (cards, books) and my hand.
 *  On a 768px laptop the felt is full, so the low popup in the top third may
 *  sit over the TOP opponent's name plate — its name and books are on that
 *  opponent's ask button; his cards stay in view. */
const GOFISH_TABLE = {
  myHand: ".aso-myhand",
  topCards: '.aso-seat[data-pos="top"] .aso-card',
  left: '.aso-seat[data-pos="left"]',
  right: '.aso-seat[data-pos="right"]',
  ocean: ".aso-table__center",
};

// A click that cannot happen must fail fast with a clear cause, not idle
// until the test timeout (default action timeout is unlimited).
test.use({ actionTimeout: 20_000 });

/** Relative luminance of a CSS `rgb()/rgba()` colour (0 = black, 1 = white). */
function luminance(css: string): number {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? ["255", "255", "255"]).slice(0, 3).map((v) => Number(v) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

/**
 * Бръкни в морето (Риба) срещу 3 бота — само истински кликове:
 *  - изборът КОГО питаш: бутоните за съперниците са различими (регресия: и
 *    тримата бяха „АСО Бот“) и се сменят с клик (aria-pressed);
 *  - изборът КАКВО питаш: бутоните с ранговете се четат (регресия: бял текст
 *    върху слонова кост — празни квадрати) и са точно ранговете в ръката;
 *  - двоен клик на ранг праща ЕДНО питане (регресия: второто ASK губеше хода);
 *  - всеки от тримата съперници е питан; мачът — до края, карта „Край“,
 *    „Нова игра“ започва нов мач.
 * Питането е прозорец, който излиза сам на моя ред (не е панел под масата).
 */
test("риба: питане на всеки съперник за ранг, до края и нова игра", async ({ browser, baseURL }, info) => {
  test.setTimeout(6 * 60_000);
  const t = await openGame(browser, baseURL!, "GOFISH");
  const { page } = t;
  const ws = await watchSocket(t);
  const table = page.getByTestId("gofish-table");
  await expect(table).toBeVisible();
  await expectStageCannotScroll(table);

  const panel = page.getByTestId("gofish-ask");
  const targets = panel.locator("[data-gofish-target]");
  const ranks = panel.locator("[data-gofish-rank]");
  const asked = new Map<string, number>();
  let asks = 0;
  let checkedUi = false;
  let doubleChecked = false;

  const myHandRanks = async (): Promise<string[]> =>
    (await page.locator(".aso-myhand .aso-card").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? "")))
      .map((label) => label.slice(0, -1)) // "10H" → "10", "KS" → "K"
      .map((r) => (r === "10" ? "T" : r));

  const legibleAndDistinct = async () => {
    await snap(page, info, "gofish-1366x768");
    // „Виж масата“ → pill → the same ask comes back
    await expectMinimizeAndReopen(page);
    // Кого: различими имена, по един бутон на съперник с карти.
    const names = await targets.allTextContents();
    expect(new Set(names).size, `еднакви имена на съперниците: ${names.join(", ")}`).toBe(names.length);
    // Какво: рангът се чете — тъмен текст върху светлия бутон.
    const first: Locator = ranks.first();
    await expect(first).toBeVisible();
    const color = await first.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(color), `рангът е почти бял (${color}) — не се чете`).toBeLessThan(0.2);
    // Бутоните са точно ранговете в ръката ми.
    const shown = await ranks.evaluateAll((els) => els.map((e) => e.getAttribute("data-gofish-rank")!));
    const labels = (await ranks.allTextContents()).map((s) => s.trim());
    expect(labels.every((l) => l.length > 0), "празен бутон за ранг").toBe(true);
    expect(new Set(shown)).toEqual(new Set(await myHandRanks()));
  };

  const askOnce = async () => {
    const n = await targets.count();
    expect(n).toBeGreaterThan(0);
    // Обикаляме всички двойки (съперник, ранг): всеки ход — следващият
    // съперник, а след пълен кръг — следващият ранг.
    const tg = targets.nth(asks % n);
    const id = (await tg.getAttribute("data-gofish-target"))!;
    if ((await tg.getAttribute("aria-pressed")) !== "true") {
      await tg.click();
      await expect(tg).toHaveAttribute("aria-pressed", "true");
    }
    const rank = ranks.nth(Math.floor(asks / n) % (await ranks.count()));
    if (!doubleChecked) {
      const sent = ws.sent.length;
      await clickAndAdvance(page, () => rank.dblclick());
      expect(ws.sent.length - sent, "двойният клик прати повече от едно питане").toBe(1);
      expectNoRejections(ws);
      doubleChecked = true;
    } else {
      await clickAndAdvance(page, () => rank.click());
    }
    asked.set(id, (asked.get(id) ?? 0) + 1);
    asks++;
  };

  for (;;) {
    const v = await waitFor(page, undefined, 60_000);
    if (v === "over") break;
    await expect(panel).toBeVisible();
    // Питането излиза само като прозорец — цял в кадър, без да покрива
    // съперниците (кого питам) и ръката ми (за какво).
    await expect(panel).toBeInViewport();
    await expect(decision(page)).toHaveAttribute("data-testid", "gofish-decision");
    await expectDecisionOnScreen(page, /^Кого питаш и за какво\?$/);
    await expectDecisionClearOf(page, GOFISH_TABLE);
    if (!checkedUi) {
      await legibleAndDistinct();
      checkedUi = true;
    }
    await askOnce();
  }
  await expectGameOverCard(page);
  await snap(page, info, "gofish-game-over");
  expect(asks, "нито едно питане с клик").toBeGreaterThan(0);
  expect(checkedUi).toBe(true);
  // Обикалянето стига до всеки от тримата, освен ако мачът е свършил твърде рано.
  expect(asked.size, `питани съперници: ${[...asked.keys()].join(",")}`).toBeGreaterThanOrEqual(Math.min(3, asks));

  await playAgain(page);
  await expect(page.getByTestId("gofish-table")).toBeVisible();
  await expect(page.getByTestId("gofish-table")).toHaveAttribute("data-gofish-books", "0");

  expectNoRejections(ws);
  expectNoErrors(t);
  await t.ctx.close();
});

test.describe("мобилен изглед 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("риба на телефон: съперниците не се застъпват с морето, питането работи", async ({ browser, baseURL }, info) => {
    const t = await openGame(browser, baseURL!, "GOFISH");
    const { page } = t;
    const ws = await watchSocket(t);
    const table = page.getByTestId("gofish-table");
    await expect(table).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, info, "gofish-390x844");

    const felt = page.locator(".aso-table__felt");
    const ocean = page.locator(".aso-table__center");
    for (const pos of ["top", "left", "right", "bottom"] as const) {
      const seat = page.locator(`.aso-seat[data-pos="${pos}"]`);
      await expectInside(seat, felt, `място „${pos}“`);
      if (pos !== "bottom") {
        await expectNoOverlap(seat.locator(".aso-seat__plate"), ocean, `табелата „${pos}“ и морето`);
        await expectNotTruncated(seat.locator(".aso-seat__name"), `съперникът „${pos}“`);
      }
    }
    await expectNoOverlap(page.locator('.aso-seat[data-pos="left"]'), page.locator('.aso-seat[data-pos="right"]'), "левият и десният съперник");

    // Едно питане с клик на телефона.
    if ((await waitFor(page, undefined, 60_000)) === "mine") {
      const panel = page.getByTestId("gofish-ask");
      await expectDecisionOnScreen(page, /^Кого питаш и за какво\?$/);
      await expectDecisionClearOf(page, { myHand: ".aso-myhand" });
      await snap(page, info, "gofish-ask-390x844");
      await panel.locator("[data-gofish-target]").last().click();
      await clickAndAdvance(page, () => panel.locator("[data-gofish-rank]").first().click());
    }
    expectNoRejections(ws);
    expectNoErrors(t);
    await t.ctx.close();
  });
});
