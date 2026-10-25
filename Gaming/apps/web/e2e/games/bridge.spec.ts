import { test, expect, type Page } from "@playwright/test";
import { expectNoErrors, waitMyTurn } from "./helpers";
import {
  act,
  action,
  cardsIn,
  expectBanner,
  expectNotReloaded,
  expectTableLayout,
  openTable,
  PHONE,
  playCard,
  reopenRulesThenLeave,
  snap,
} from "./helpers-cards";
import {
  decision,
  expectDecisionClearOf,
  expectDecisionOnScreen,
  expectMinimizeAndReopen,
} from "./prompt-checks";

/**
 * Бридж срещу трима ботове — наддаване и разиграване само с кликове.
 *
 * Стекът раздава с фиксиран seed (BRIDGE=e2e-bridge-110, infra/e2e-games.sh):
 *  наддаване — противникът открива 1NT → „Контра“; моят партньор казва 2♠,
 *  противникът го контрира → „Реконтра“; противник 3♣ → обявявам 3NT;
 *  3NT е контриран → „Пас“. Аз съм разиграващ (първи от отбора казал NT),
 *  партньорът е дъми: след първата карта ръката му е открита и на неговия ред
 *  играя аз — от панела „Ръка на дъми“. Изиграват се всичките 13 взятки, после
 *  започва второ раздаване. (Робърът е дълъг — до два гейма — затова тестът
 *  спира след първото цяло раздаване.)
 * Наддаването е прозорец, който излиза сам на моя ред (не е под масата):
 * стоящата обява е в пояснението му, ръката ми остава видима.
 * Всеки ход се решава само по това, което показва масата.
 */

const SEEDED_FIRST_HAND = [
  "2S",
  "5D",
  "QH",
  "AS",
  "4H",
  "5H",
  "2H",
  "JD",
  "TC",
  "9H",
  "KS",
  "JH",
  "6S",
];

type Step = "double" | "redouble" | "bid" | "pass" | "play" | "dummy";

async function score(page: Page, name: string): Promise<string> {
  return (await page.locator('[data-zone="score"]').getAttribute(name)) ?? "";
}

async function takeTurn(
  page: Page,
  done: Record<Step, number>,
  bidDeals: Set<string>,
): Promise<Step> {
  if ((await score(page, "data-phase")) === "AUCTION") {
    // the bidding box comes up by itself as a popup — whole on screen, my
    // hand (what I bid by) uncovered; only live levels are listed
    const box = page.locator('[data-decision] [data-zone="auction"]');
    await expect(box).toBeVisible();
    await expectDecisionOnScreen(page, /^Твоят анонс$/);
    await expectDecisionClearOf(page, { hand: '[data-zone="hand"]' });
    expect(await box.locator('[data-action="bid"]').count()).toBeLessThanOrEqual(35);
    await expect(box.locator('[data-action="bid"]:enabled').first()).toBeVisible();
    const deal = await score(page, "data-deal");
    if ((await action(page, "double").count()) > 0 && !done.double) {
      // I see what I am doubling: the opponents' standing bid and who made it
      await expect(page.locator('[data-zone="standing-bid"]')).toContainText(
        /Договор: \d(♣|♦|♥|♠|NT) · АСО Бот/,
      );
      await act(page, action(page, "double"));
      await expectBanner(page, /^Контра!$/);
      await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-doubled", "1");
      return "double";
    }
    if ((await action(page, "redouble").count()) > 0 && !done.redouble) {
      await expect(page.locator('[data-zone="standing-bid"]')).toContainText(/· Контра$/);
      await act(page, action(page, "redouble"));
      await expectBanner(page, /^Реконтра!$/);
      await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-doubled", "2");
      return "redouble";
    }
    const bid = box.locator('[data-action="bid"][data-bid$="NT"]:enabled').first();
    if ((await bid.count()) > 0 && !bidDeals.has(deal)) {
      const name = (await bid.getAttribute("data-bid")) ?? "";
      bidDeals.add(deal);
      await act(page, bid);
      await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-contract", name);
      await expectBanner(page, new RegExp(`: ${name}$`));
      return "bid";
    }
    await act(page, action(page, "pass"));
    return "pass";
  }

  // PLAY: on the dummy's turn I (the declarer) play a dummy card
  const dummyCards = page.locator('[data-zone="dummy"] [data-playable="true"]');
  const hand = page.locator('[data-zone="hand"] [data-playable="true"]');
  await expect(dummyCards.or(hand).first()).toBeVisible();
  if ((await dummyCards.count()) > 0) {
    await expect(page.locator('.bridge-dummy[data-dummy-turn="true"]')).toBeInViewport();
    // my own hand is not playable while the dummy is on turn
    expect((await cardsIn(page, "hand")).some((c) => c.playable)).toBe(false);
    const first = (await cardsIn(page, "dummy")).find((c) => c.playable)!;
    await playCard(page, "dummy", first.card);
    return "dummy";
  }
  const first = (await cardsIn(page, "hand")).find((c) => c.playable)!;
  await playCard(page, "hand", first.card);
  return "play";
}

test("бридж: наддаване (пас, обява, контра, реконтра) и цяло раздаване с карти от ръката и от дъми", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const t = await openTable(browser, baseURL!, "BRIDGE");
  const { page } = t;

  expect(await waitMyTurn(page)).toBe(true);
  expect(
    (await cardsIn(page, "hand")).map((c) => c.card),
    "стекът не раздава със seed-а на теста — пусни го с infra/e2e-games.sh (E2E_SEEDS)",
  ).toEqual(SEEDED_FIRST_HAND);
  // opponent opened 1NT: the popup says so, the dead level-1 row is gone
  await expectDecisionOnScreen(page, /^Твоят анонс$/);
  await expect(decision(page).locator('[data-zone="standing-bid"]')).toContainText(/Договор: 1NT/);
  await expect(page.locator('[data-action="bid"][data-bid^="1"]')).toHaveCount(0);
  await snap(page, testInfo, "bridge-auction-1366x768");
  // „Виж масата“ → pill; the pill brings the same call back
  await expectMinimizeAndReopen(page);

  const done: Record<Step, number> = { double: 0, redouble: 0, bid: 0, pass: 0, play: 0, dummy: 0 };
  const bidDeals = new Set<string>();
  for (let turn = 0; turn < 60; turn++) {
    expect(await waitMyTurn(page)).toBe(true);
    if ((await score(page, "data-deal")) !== "1") break; // first deal scored → deal 2's auction
    done[await takeTurn(page, done, bidDeals)]++;
    if (done.dummy === 1 && done.play === 0) await snap(page, testInfo, "bridge-1366x768");
  }

  // the whole first deal: 4 calls, 13 cards from my hand + 13 from the dummy
  expect(done, JSON.stringify(done)).toEqual({
    double: 1,
    redouble: 1,
    bid: 1,
    pass: 1,
    play: 13,
    dummy: 13,
  });
  await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-deal", "2");
  await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-tricks", "0:0");
  await expect(page.getByText(/Последно: 3NT/)).toBeVisible();

  await expectNotReloaded(page);
  await reopenRulesThenLeave(page);
  expectNoErrors(t);
  await t.ctx.close();
});

test("бридж на телефон 390×844: наддаването и дъми идват на екрана, нищо не се застъпва", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const t = await openTable(browser, baseURL!, "BRIDGE", { viewport: PHONE });
  const { page } = t;
  const done: Record<Step, number> = { double: 0, redouble: 0, bid: 0, pass: 0, play: 0, dummy: 0 };
  const bidDeals = new Set<string>();
  // the auction, then the dummy's first card (after the opening lead)
  while (done.dummy === 0) {
    expect(await waitMyTurn(page)).toBe(true);
    if (done.pass === 0 && done.double === 0) {
      await expectDecisionOnScreen(page, /^Твоят анонс$/);
      await expectDecisionClearOf(page, { hand: '[data-zone="hand"]' });
      await snap(page, testInfo, "bridge-auction-390x844");
    }
    if (done.pass === 1) {
      await expect(
        page.locator('[data-zone="dummy"] [data-playable="true"]').first(),
      ).toBeVisible();
      await expect(page.locator('[data-zone="trick"] [data-card]')).toHaveCount(1);
      // the dummy panel scrolls into view smoothly: measure the table once the
      // page stands still (boxes read mid-scroll come from different frames)
      let lastY = -1;
      await expect
        .poll(async () => {
          const y = await page.evaluate(() => window.scrollY);
          const still = y === lastY;
          lastY = y;
          return still;
        }, { intervals: [250] })
        .toBe(true);
      await expectTableLayout(page, {
        top: '.aso-seat[data-pos="top"]',
        left: '.aso-seat[data-pos="left"]',
        right: '.aso-seat[data-pos="right"]',
        trick: '[data-zone="trick"]',
        hand: '[data-zone="hand"]',
        trump: ".aso-trump",
      });
      await snap(page, testInfo, "bridge-390x844");
    }
    done[await takeTurn(page, done, bidDeals)]++;
  }
  expect(done).toMatchObject({ double: 1, redouble: 1, bid: 1, pass: 1, dummy: 1 });
  await expectNotReloaded(page);
  expectNoErrors(t);
  await t.ctx.close();
});
