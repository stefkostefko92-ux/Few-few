import { test, expect, type Page } from "@playwright/test";
import { expectNoErrors, stateVersion, waitMyTurn } from "./helpers";
import {
  act,
  action,
  boxesOverlap,
  boxOf,
  cardsIn,
  expectApart,
  expectBanner,
  expectGameOverThenPlayAgain,
  expectLegibleOnIvory,
  expectNotReloaded,
  expectTableLayout,
  openTable,
  PHONE,
  playCard,
  reopenRulesThenLeave,
  snap,
} from "./helpers-cards";

/**
 * Белот срещу трима ботове — само истински кликове по масата.
 *
 * Ботовете са на „Лесно“ (избрано в лобито, както го прави играч): само тогава
 * бот понякога казва „Контра“ — без това „Реконтра“ на човека е недостижима.
 * Стекът раздава с фиксиран seed (BELOTE=e2e-belote-36, infra/e2e-games.sh):
 *  1. раздаване: противникът обявява ♦ → „Контра“; после ВК от другия
 *     противник → „Пас“; 8 взятки (първата — само Q♦ е позволена: отговаряш
 *     на боята, останалите карти не се кликват).
 *  2. раздаване: обявявам ВК, противник контрира → „Реконтра“ (x4); 8 взятки
 *     → 164:0 → „Край“ → „Нова игра“ сяда в нов мач.
 * Всеки ход се решава само по това, което показва масата (по същото правило
 * е избран seed-ът — офлайн реплика на стаята).
 */

const SEEDED_FIRST_HAND = ["QC", "KH", "8S", "TH", "7S"];

type Step = "contra" | "recontra" | "bid" | "pass" | "play";

async function scoreAttr(page: Page, name: string): Promise<string> {
  return (await page.locator('[data-zone="score"]').getAttribute(name)) ?? "";
}

async function takeTurn(
  page: Page,
  done: Record<Step, number>,
  bidDeals: Set<string>,
): Promise<Step> {
  const phase = await scoreAttr(page, "data-phase");
  if (phase === "BID") {
    await expect(page.locator('[data-zone="bidding"]')).toBeVisible();
    const deal = await scoreAttr(page, "data-deal");
    if ((await action(page, "recontra").count()) > 0 && !done.recontra) {
      await act(page, action(page, "recontra"));
      await expectBanner(page, /^Реконтра!$/);
      await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-doubling", "4");
      return "recontra";
    }
    if ((await action(page, "contra").count()) > 0 && !done.contra) {
      await act(page, action(page, "contra"));
      await expectBanner(page, /^Контра!$/);
      return "contra";
    }
    const bid = page.locator('[data-action="bid"]:enabled').first();
    if ((await bid.count()) > 0 && !bidDeals.has(deal)) {
      const contract = (await bid.getAttribute("data-contract")) ?? "";
      bidDeals.add(deal);
      await act(page, bid);
      await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-contract", contract);
      return "bid";
    }
    await act(page, action(page, "pass"));
    return "pass";
  }

  await expect(page.locator('[data-zone="hand"] [data-playable="true"]').first()).toBeVisible();
  const hand = await cardsIn(page, "hand");
  const blocked = hand.find((c) => !c.playable);
  if (blocked && !done.play) {
    // must follow suit: a card that is not allowed is not even clickable
    const before = await stateVersion(page);
    await page
      .locator(`[data-zone="hand"] [data-card="${blocked.card}"]`)
      .click({ position: { x: 8, y: 34 }, force: true });
    await page.waitForTimeout(600);
    expect(await stateVersion(page), "a blocked card sent a move").toBe(before);
  }
  await playCard(page, "hand", hand.find((c) => c.playable)!.card);
  return "play";
}

test("белот: обявяване, пас, контра, реконтра и разиграване с кликове — до края на мача и „Нова игра“", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const t = await openTable(browser, baseURL!, "BELOTE", { difficulty: "EASY" });
  const { page } = t;

  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="bidding"]')).toBeVisible();
  expect(
    (await cardsIn(page, "hand")).map((c) => c.card),
    "стекът не раздава със seed-а на теста — пусни го с infra/e2e-games.sh (E2E_SEEDS)",
  ).toEqual(SEEDED_FIRST_HAND);
  // during the auction no card is playable
  expect((await cardsIn(page, "hand")).some((c) => c.playable)).toBe(false);
  // every contract tile is readable (♣/♠/БК/ВК used to be near-white on ivory)
  await expectLegibleOnIvory(page.locator('[data-action="bid"]'));
  // the auction sticks to the bottom of a 768px screen, clear of my hand
  await expect(page.locator('[data-zone="bidding"]')).toBeInViewport();
  await expectApart(page, '[data-zone="hand"]', '[data-zone="bidding"]');
  await snap(page, testInfo, "belote-bidding-1366x768");

  const done: Record<Step, number> = { contra: 0, recontra: 0, bid: 0, pass: 0, play: 0 };
  const bidDeals = new Set<string>();
  let shotPlay = false;
  for (let turn = 0; turn < 60; turn++) {
    if (!(await waitMyTurn(page))) break; // match over
    done[await takeTurn(page, done, bidDeals)]++;
    if (!shotPlay && done.play === 3) {
      shotPlay = true;
      await snap(page, testInfo, "belote-1366x768");
    }
  }

  expect(done, JSON.stringify(done)).toMatchObject({
    contra: 1,
    recontra: 1,
    bid: 1,
    pass: 1,
    play: 16,
  });

  await expectGameOverThenPlayAgain(page);
  // fresh match, deal 1 again: my first call is the same contra
  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-deal", "1");
  await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-match", "0:0");
  await act(page, action(page, "contra"));

  await expectNotReloaded(page);
  await reopenRulesThenLeave(page);
  expectNoErrors(t);
  await t.ctx.close();
});

test("белот на телефон 390×844: странични места, взятка и ръка не се застъпват", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const t = await openTable(browser, baseURL!, "BELOTE", { difficulty: "EASY", viewport: PHONE });
  const { page } = t;
  expect(await waitMyTurn(page)).toBe(true);
  // the auction panel is below the table on a phone: it must come into view,
  // clear of the floating chat button
  const bidding = page.locator('[data-zone="bidding"]');
  await expect(bidding).toBeInViewport({ ratio: 1 });
  await page.waitForTimeout(600); // smooth scroll settles
  expect(
    boxesOverlap(await boxOf(bidding), await boxOf(page.getByRole("button", { name: /Чат/ }))),
  ).toBe(false);
  await snap(page, testInfo, "belote-bidding-390x844");

  const done: Record<Step, number> = { contra: 0, recontra: 0, bid: 0, pass: 0, play: 0 };
  const bidDeals = new Set<string>();
  while (done.pass === 0) {
    expect(await waitMyTurn(page)).toBe(true);
    done[await takeTurn(page, done, bidDeals)]++;
  }
  // first trick: three cards are already on the felt when it is my turn
  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="trick"] [data-card]')).toHaveCount(3);
  await expectTableLayout(page, {
    top: '.aso-seat[data-pos="top"]',
    left: '.aso-seat[data-pos="left"]',
    right: '.aso-seat[data-pos="right"]',
    trick: '[data-zone="trick"]',
    hand: '[data-zone="hand"]',
  });
  await snap(page, testInfo, "belote-390x844");
  await playCard(page, "hand", "QD");
  await expectNotReloaded(page);
  expectNoErrors(t);
  await t.ctx.close();
});
