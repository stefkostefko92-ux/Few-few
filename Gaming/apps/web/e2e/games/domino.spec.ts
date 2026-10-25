import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { expectGameOverCard, expectNoErrors, openGame, probe } from "./helpers";
import {
  clickAndAdvance,
  expectEvent,
  expectAllInside,
  expectNoHorizontalScroll,
  expectNoRejections,
  expectStageCannotScroll,
  playAgain,
  snap,
  waitFor,
  watchSocket,
  type SocketWatch,
} from "./helpers-draw";
import { expectDecisionOnScreen, expectMinimizeRestore, expectNotCovered } from "./decision-checks";

// A click that cannot happen must fail fast with a clear cause, not idle
// until the test timeout (default action timeout is unlimited).
test.use({ actionTimeout: 20_000 });

type Side = "L" | "R";

/**
 * Домино (4 места: аз + 3 бота) — само истински кликове:
 *  - поставяне на плочка в ЛЕВИЯ и в ДЕСНИЯ край: плочка, която пасва и в
 *    двата (различни) края, отваря прозореца „В кой край?“ (◀ / ▶); плочка
 *    с един възможен край отива направо — сървърът потвърждава страната с
 *    PLAY събитието;
 *  - откриване на кръга (празна маса, без избор);
 *  - „Тегли“, когато нищо не пасва, и „Пас“, когато и казанът е празен — и
 *    двете идват сами в прозореца „Нищо не пасва“;
 *  - мачът до 100 т. се играе до края → карта „Край“ → „Нова игра“.
 *  Тегленето/пасът зависят от раздаването: ако първият мач мине без пас,
 *  следващият се играе, докато се стигне до пас.
 */
test("домино: двата края, теглене и пас, до края и нова игра", async ({ browser, baseURL }, info) => {
  test.setTimeout(12 * 60_000);
  const t = await openGame(browser, baseURL!, "DOMINO");
  const { page } = t;
  const ws = await watchSocket(t);
  await expect(page.getByTestId("domino-table")).toBeVisible();
  await snap(page, info, "domino-1366x768");
  await expectStageCannotScroll(page.getByTestId("domino-table"));
  const counts: Counts = { L: 0, R: 0, open: 0, draw: 0, pass: 0, asked: 0 };

  const done = () => counts.L > 0 && counts.R > 0 && counts.draw > 0 && counts.pass > 0 && counts.asked > 0;

  /** Play my turns until the match ends (→ true) or, with `untilCovered`,
   *  until every action has been exercised (→ false). */
  const playMatch = async (untilCovered: boolean): Promise<boolean> => {
    const seat = Number(await probe(page).getAttribute("data-seat"));
    for (;;) {
      if ((await waitFor(page, undefined, 60_000)) === "over") return true;
      await myTurn(page, ws, seat, counts, info);
      if (untilCovered && done()) return false;
    }
  };

  // Първият мач — до края; „Нова игра“ започва нов.
  expect(await playMatch(false)).toBe(true);
  await expectGameOverCard(page);
  await snap(page, info, "domino-game-over");
  await playAgain(page);
  await expect(page.getByTestId("domino-table")).toBeVisible();
  // Тегленето и пасът са по раздаване — доиграваме, докато се паднат.
  while (!done()) {
    if (await playMatch(true)) {
      await expectGameOverCard(page);
      await playAgain(page);
    }
  }

  expect(counts.L, "нито една плочка в левия край").toBeGreaterThan(0);
  expect(counts.R, "нито една плочка в десния край").toBeGreaterThan(0);
  expect(counts.draw, "„Тегли“ не беше натиснато").toBeGreaterThan(0);
  expect(counts.pass, "„Пас“ не беше натиснато").toBeGreaterThan(0);
  expect(counts.asked, "прозорецът „В кой край?“ не се появи").toBeGreaterThan(0);
  expectNoRejections(ws);
  expectNoErrors(t);
  await t.ctx.close();
});

type Counts = Record<"L" | "R" | "open" | "draw" | "pass" | "asked", number>;

/** One decision on my turn, by click. */
async function myTurn(page: Page, ws: SocketWatch, seat: number, counts: Counts, info?: TestInfo): Promise<void> {
  const table = page.getByTestId("domino-table");
  // След края на кръг масата се „замразява“ за ~2.5 s — тогава няма бутони.
  await expect(table).toHaveAttribute("data-frozen", "false", { timeout: 10_000 });
  const hand = page.getByTestId("domino-hand");
  const line = page.getByTestId("domino-line");
  const playable = hand.locator('[data-sides]:not([data-sides=""])');
  const n = await playable.count();

  if (n > 0) {
    // Има ход → няма „Нищо не пасва“.
    await expect(page.getByTestId("domino-stuck")).toHaveCount(0);
    const ends = ((await line.getAttribute("data-ends")) ?? "").split(" ").filter(Boolean);
    const differ = ends.length === 2 && ends[0] !== ends[1];
    const want: Side = counts.L <= counts.R ? "L" : "R";
    // Предпочитаме плочка за двата края (прозорецът), иначе — за желания край.
    let pick: Locator = playable.first();
    let sides = ((await pick.getAttribute("data-sides")) ?? "L").split(" ") as Side[];
    for (let i = 0; i < n; i++) {
      const s = ((await playable.nth(i).getAttribute("data-sides")) ?? "").split(" ") as Side[];
      if ((differ && s.length === 2) || (s.includes(want) && !sides.includes(want))) {
        pick = playable.nth(i);
        sides = s;
        if (differ && s.length === 2) break;
      }
    }
    const tile = (await pick.getAttribute("data-tile"))!;
    const ask = differ && sides.length === 2;
    // Без избор: единственият край; при еднакви краища — десния (резултатът е същият).
    const side: Side = ask ? want : ends.length === 0 ? "L" : sides.length === 2 ? "R" : sides[0]!;
    const from = ws.events.length;
    if (ask) {
      await pick.click();
      const card = await expectDecisionOnScreen(page, "domino-side");
      await expect(page.getByTestId("domino-side")).toContainText("В кой край?");
      if (counts.asked === 0) {
        // Прозорецът идва сам след клика, свива се и се връща; „Друга плочка“
        // го затваря без ход, а нов клик пак пита.
        await expectMinimizeRestore(page, "domino-side");
        // Краищата на редицата се виждат под прозореца (на лаптоп).
        await page.evaluate(() => window.scrollTo(0, 0));
        await expectNotCovered(page, "domino-side", line.locator("[data-tile]").first(), "левия край на редицата");
        await expectNotCovered(page, "domino-side", line.locator("[data-tile]").last(), "десния край на редицата");
        if (info) await snap(page, info, "domino-side-1366x768");
        const sent = ws.sent.length;
        await card.locator("[data-decision-skip]").click();
        await expect(page.getByTestId("domino-side")).toHaveCount(0);
        await page.waitForTimeout(300);
        expect(ws.sent.length, "„Друга плочка“ прати ход").toBe(sent);
        await pick.click();
        await expectDecisionOnScreen(page, "domino-side");
      }
      await clickAndAdvance(page, () => page.getByTestId("domino-side").locator(`[data-side="${side}"]`).click());
      counts.asked++;
    } else {
      await clickAndAdvance(page, () => pick.click());
      // Един възможен край (или еднакви краища) — ходът е направо, без прозорец.
      await expect(page.getByTestId("domino-side")).toHaveCount(0);
    }
    const ev = await expectEvent(ws, from, (e) => e.type === "PLAY" && e.seat === seat, "сървърът не потвърди поставената плочка");
    expect(ev.tile).toBe(tile);
    if (ends.length) {
      expect(ev.side, `плочката ${tile} отиде в грешния край`).toBe(side);
      counts[side]++;
    } else {
      counts.open++;
    }
    // Плочката е на масата (или в замразената маса след края на кръга).
    await expect(line.locator(`[data-tile="${tile}"]`)).toBeVisible();
    return;
  }

  // Нищо не пасва → прозорецът идва сам (без клик) с „Тегли“ или „Пас“.
  const card = await expectDecisionOnScreen(page, "domino-stuck");
  if (counts.draw + counts.pass === 0) {
    await expectMinimizeRestore(page, "domino-stuck");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNotCovered(page, "domino-stuck", hand, "ръката");
    if (info) await snap(page, info, "domino-stuck-1366x768");
  }
  const draw = card.locator('[data-domino-action="DRAW"]');
  const pass = card.locator('[data-domino-action="PASS"]');
  const from = ws.events.length;
  if (await draw.isVisible()) {
    const before = await hand.locator("[data-tile]").count();
    await expect(draw).toBeEnabled();
    await clickAndAdvance(page, () => draw.click());
    await expectEvent(ws, from, (e) => e.type === "DRAW" && e.seat === seat, "сървърът не потвърди тегленето");
    await expect(hand.locator("[data-tile]")).toHaveCount(before + 1);
    counts.draw++;
    return;
  }
  await expect(pass, "нищо не пасва, казанът е празен — трябва да има „Пас“").toBeVisible();
  await expect(pass).toBeEnabled();
  await clickAndAdvance(page, () => pass.click());
  await expectEvent(ws, from, (e) => e.type === "PASS" && e.seat === seat, "сървърът не потвърди паса");
  counts.pass++;
}

test.describe("мобилен изглед 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("домино на телефон: ръката се побира, ход с клик", async ({ browser, baseURL }, info) => {
    const t = await openGame(browser, baseURL!, "DOMINO");
    const { page } = t;
    const ws = await watchSocket(t);
    await expect(page.getByTestId("domino-table")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, info, "domino-390x844");
    const felt = page.locator(".aso-table__felt");
    const tiles = page.getByTestId("domino-hand").locator("[data-tile]");
    await expectAllInside(tiles, felt, "плочка");

    const seat = Number(await probe(page).getAttribute("data-seat"));
    const counts: Counts = { L: 0, R: 0, open: 0, draw: 0, pass: 0, asked: 0 };
    for (let i = 0; i < 2; i++) {
      if ((await waitFor(page, undefined, 60_000)) === "over") break;
      await myTurn(page, ws, seat, counts);
    }
    await expectNoHorizontalScroll(page);
    expectNoRejections(ws);
    expectNoErrors(t);
    await t.ctx.close();
  });
});
