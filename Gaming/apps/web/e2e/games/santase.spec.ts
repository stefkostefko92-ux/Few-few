import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { expectNoErrors, stateVersion, waitMyTurn } from "./helpers";
import {
  act,
  action,
  actions,
  CARD_GRIP,
  cardsIn,
  expectApart,
  expectBanner,
  expectBannersOnScreen,
  expectGameOverThenPlayAgain,
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
  inDecision,
  skipDecision,
} from "./prompt-checks";

/**
 * Сантасе (66) срещу бот — само истински кликове по масата.
 *
 * Обявите на моето водене излизат САМИ като прозорец, когато има какво да се
 * реши (двойка 20/40, смяна на коза, реално 66): изборите се правят в него.
 * „Затвори“ и „Имам 66“ без 66 са в прозореца, щом е отворен, иначе са малки
 * бутони под масата. „Не сега“ скрива прозореца до следващото водене.
 *
 * Стекът раздава с фиксиран seed (SANTASE=e2e-santase-5159 в
 * infra/e2e-games.sh), затова сценарият е известен и минава през всяко
 * действие на играча:
 *  1. раздаване (коз ♣): водя Q♣ при K♣ в ръка → 40 с анонс; „Смени коза“
 *     (9♣ срещу коза на масата); „Без анонс“ + K♠ — женитбата ♠ се играе
 *     тихо; „Затвори“; после ботът води коз и цветът ме задължава — от ръката
 *     се кликва само 10♣ (другите карти не реагират); „Имам 66 — излизам“ с 67.
 *  2. раздаване (коз ♥): „Имам 66 с 20 ♠“ без 66 → невярно, 3 точки за бота.
 *  3.–5. раздаване: „Имам 66 — излизам“ без 66 на всяко мое водене → ботът
 *     стига 11 → „Край“ → „Нова игра“ сяда в нов мач от първо раздаване.
 * Всеки ход се решава само по това, което показва масата, с едно и също
 * правило (по него е избран и seed-ът — офлайн реплика на стаята).
 */

const SEEDED_FIRST_HAND = ["QC", "9C", "QH", "9H", "KS", "KC"];

type Step =
  | "exchange"
  | "marriage"
  | "quiet"
  | "declareValid"
  | "close"
  | "restricted"
  | "declareMarriage"
  | "declareFalse"
  | "play";

/** K or Q whose partner is in the same hand — a marriage on my lead. */
const pairCard = (hand: string[]): string | undefined =>
  hand.find((c) => {
    const [r, s] = [c.slice(0, -1), c.slice(-1)];
    return (r === "K" || r === "Q") && hand.includes(`${r === "K" ? "Q" : "K"}${s}`);
  });

async function score(
  page: Page,
): Promise<{ points: number; trump: string; match: [number, number] }> {
  const el = page.locator('[data-zone="score"]');
  const [me, opp] = ((await el.getAttribute("data-match")) ?? "0:0").split(":").map(Number);
  return {
    points: Number(await el.getAttribute("data-points")),
    trump: (await el.getAttribute("data-trump")) ?? "",
    match: [me ?? 0, opp ?? 0],
  };
}

async function matchScore(page: Page): Promise<string> {
  return (await page.locator('[data-zone="score"]').getAttribute("data-match")) ?? "";
}

/** What the decision is made by: my hand and the talon with the face-up
 *  trump. On a phone the popup sits in the top third and may cover the small
 *  trump badge — the trump suit is in its hint. */
const tableParts = (page: Page): Record<string, string> => ({
  hand: '[data-zone="hand"]',
  talon: '[data-zone="talon"]',
  ...((page.viewportSize()?.width ?? 0) > 640 ? { trump: ".aso-trump" } : {}),
});

type Done = Record<Step | "skip", number>;
/** Tests that already photographed the small calls on the felt. */
const smallCallsShot = new Set<string>();

/** One decision on my turn, by the scenario's fixed priority. */
async function takeTurn(page: Page, done: Done, testInfo?: TestInfo): Promise<Step> {
  await expect(page.locator('[data-zone="hand"] [data-playable="true"]').first()).toBeVisible();
  const hand = (await cardsIn(page, "hand")).map((c) => c.card);
  let has = new Set(await actions(page));
  const prompt = (await decision(page).count()) > 0;
  if (prompt) {
    // up by itself, on screen, clear of the hand and the talon it is about
    await expectDecisionOnScreen(page);
    await expectDecisionClearOf(page, tableParts(page));
  }
  if (!prompt && (await page.locator('[data-zone="actions"]').count()) > 0) {
    // no popup: „Затвори“/„Имам 66“ are small buttons — on screen, and they
    // cover neither my hand, nor my plate with the points, nor the talon
    const bar = '[data-zone="actions"]';
    await expect(page.locator(bar)).toBeInViewport();
    for (const part of [
      '[data-zone="hand"]',
      '.aso-seat[data-pos="bottom"] .aso-seat__plate',
      '[data-zone="talon"]',
      '[data-zone="trick"]',
      '[data-zone="opponent"]',
    ])
      await expectApart(page, part, bar);
    if (testInfo && !done.skip && !smallCallsShot.has(testInfo.testId)) {
      smallCallsShot.add(testInfo.testId);
      await snap(page, testInfo, `santase-small-calls-${page.viewportSize()?.width}x${page.viewportSize()?.height}`);
    }
  }
  if (prompt && done.declareValid && !done.skip) {
    // „Не сега“ (deal 1 is through): the popup goes away for this lead, no
    // pill; „Затвори“/„Имам 66“ stay reachable as small buttons under the
    // table — and the rest of this lead is played from there
    await skipDecision(page);
    done.skip++;
    const bar = page.locator('[data-zone="actions"]');
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-action="declare"]')).toBeVisible();
    await expect(bar.locator('[data-action="marriage"]')).toHaveCount(0);
    has = new Set(await actions(page));
    if (testInfo) await snap(page, testInfo, `santase-skipped-${page.viewportSize()?.width}x${page.viewportSize()?.height}`);
  }
  const { points, trump, match } = await score(page);
  const covered = done.exchange && done.marriage && done.quiet;
  const pair = pairCard(hand);

  if (has.has("exchange") && !done.exchange) {
    // the face-up trump goes to my hand, my 9 of trumps under the stock —
    // the swap brings the popup up by itself, with both cards named
    const [onTable] = await cardsIn(page, "talon");
    expect(hand).toContain(`9${trump}`);
    const exchange = inDecision(page, '[data-action="exchange"]');
    await expect(exchange).toContainText(/Смени коза \(9. ↔ .+\)/);
    await act(page, exchange);
    await expect(page.locator(`[data-zone="talon"] [data-card="9${trump}"]`)).toBeVisible();
    expect((await cardsIn(page, "hand")).map((c) => c.card)).toContain(onTable!.card);
    return "exchange";
  }
  if (has.has("marriage") && pair && !done.marriage) {
    // the pair is called from the popup: „Обяви 40 ♣ — играй дамата“
    const call = inDecision(page, `[data-action="marriage"][data-card="${pair}"]`);
    await expect(call).toHaveText(/^Обяви (20|40) . — играй (попа|дамата)$/);
    await act(page, call);
    await expectBanner(page, /^(20|40)!$/);
    await expect(page.locator(`[data-zone="hand"] [data-card="${pair}"]`)).toHaveCount(0);
    return "marriage";
  }
  if (has.has("quiet") && pair && !done.quiet) {
    // „Без анонс“ in the popup, then the K/Q from the hand goes quietly
    const quiet = inDecision(page, '[data-action="quiet"]');
    await quiet.click();
    await expect(quiet).toHaveAttribute("aria-pressed", "true");
    await expect(quiet).toContainText("✓");
    await playCard(page, "hand", pair);
    return "quiet";
  }
  if (has.has("declare") && points >= 66) {
    // real 66 (my tricks + called pairs) → the popup says so by itself
    await expectDecisionOnScreen(page, /^Имаш 66!$/);
    await act(page, inDecision(page, '[data-action="declare"]'));
    await expectBanner(page, /излиза с \d+!/);
    await expect.poll(() => matchScore(page)).not.toBe(`${match[0]}:${match[1]}`);
    expect((await score(page)).match[0]).toBeGreaterThan(match[0]);
    return "declareValid";
  }
  if (has.has("close") && covered && !done.close) {
    await act(page, action(page, "close"));
    await expect(page.getByTestId("santase-closed")).toBeVisible();
    await expect(action(page, "close")).toHaveCount(0);
    return "close";
  }
  const cards = await cardsIn(page, "hand");
  const blocked = cards.find((c) => !c.playable);
  if (blocked && !done.restricted) {
    // closed talon: follow suit and head the trick — the other cards are dead
    const before = await stateVersion(page);
    await page
      .locator(`[data-zone="hand"] [data-card="${blocked.card}"]`)
      .click({ ...CARD_GRIP, force: true });
    await page.waitForTimeout(600);
    expect(await stateVersion(page), "a card that must not be played sent a move").toBe(before);
    await playCard(page, "hand", cards.find((c) => c.playable)!.card);
    return "restricted";
  }
  if (
    has.has("declare-marriage") &&
    covered &&
    done.close &&
    done.restricted &&
    !done.declareMarriage
  ) {
    await act(page, action(page, "declare-marriage").first());
    await expectBanner(page, /обяви 66, а има \d+|излиза с \d+!/);
    return "declareMarriage";
  }
  if (has.has("declare") && covered && done.close && done.restricted && done.declareMarriage) {
    // no 66: a false call hands the bot 3 game points — the quick way to 11
    await act(page, action(page, "declare"));
    await expectBanner(page, /обяви 66, а има \d+/);
    return "declareFalse";
  }
  const first = (await cardsIn(page, "hand")).find((c) => c.playable);
  expect(first, "no playable card on my turn").toBeTruthy();
  await playCard(page, "hand", first!.card);
  return "play";
}

test("сантасе: всяко действие с истински кликове, до края на мача и „Нова игра“", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const t = await openTable(browser, baseURL!, "SANTASE");
  const { page } = t;

  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="hand"] [data-playable="true"]').first()).toBeVisible();
  expect(
    (await cardsIn(page, "hand")).map((c) => c.card),
    "стекът не раздава със seed-а на теста — пусни го с infra/e2e-games.sh (E2E_SEEDS)",
  ).toEqual(SEEDED_FIRST_HAND);
  // following suit is NOT required while the stock is open: every card is live
  expect((await cardsIn(page, "hand")).every((c) => c.playable)).toBe(true);
  // the pair Q♣+K♣ (40) on my lead: the popup comes up by itself, top third,
  // clear of my hand and the talon; the small calls row is not doubled under it
  await expectDecisionOnScreen(page, /^Твоето водене — обява\?$/);
  await expectDecisionClearOf(page, tableParts(page));
  await expect(inDecision(page, '[data-action="marriage"]')).toHaveCount(2);
  await expect(inDecision(page, '[data-action="close"]')).toBeVisible();
  await expect(page.locator('[data-zone="actions"]')).toHaveCount(0);
  await snap(page, testInfo, "santase-lead-1366x768");
  // „Виж масата“ → pill; the hand is still live; the pill brings it back
  await expectMinimizeAndReopen(page);

  const done: Done = {
    skip: 0,
    exchange: 0,
    marriage: 0,
    quiet: 0,
    declareValid: 0,
    close: 0,
    restricted: 0,
    declareMarriage: 0,
    declareFalse: 0,
    play: 0,
  };
  for (let turn = 0; turn < 40; turn++) {
    if (!(await waitMyTurn(page))) break; // match over
    const step = await takeTurn(page, done, testInfo);
    done[step]++;
    if (step === "close") await snap(page, testInfo, "santase-closed-1366x768");

    if (step === "exchange") await snap(page, testInfo, "santase-exchanged-1366x768");
  }

  expect(done, JSON.stringify(done)).toMatchObject({
    skip: 1,
    exchange: 1,
    marriage: 1,
    quiet: 1,
    declareValid: 1,
    close: 1,
    restricted: 1,
    declareMarriage: 1,
  });
  expect(done.declareFalse).toBeGreaterThan(0);
  expect(done.play).toBeGreaterThan(0);

  await expectGameOverThenPlayAgain(page);
  // a fresh match from deal 1 — same seed, same first hand — and it plays
  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-match", "0:0");
  await expect
    .poll(async () => (await cardsIn(page, "hand")).map((c) => c.card))
    .toEqual(SEEDED_FIRST_HAND);
  await playCard(page, "hand", "QC");

  await expectNotReloaded(page);
  await reopenRulesThenLeave(page);
  expectNoErrors(t);
  await t.ctx.close();
});

test("сантасе на телефон 390×844: талон, взятка, коз и ръце не се застъпват", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const t = await openTable(browser, baseURL!, "SANTASE", { viewport: PHONE });
  const { page } = t;
  // the popup on a phone: whole on screen, hand and talon still visible
  expect(await waitMyTurn(page)).toBe(true);
  await expectDecisionOnScreen(page, /^Твоето водене — обява\?$/);
  await expectDecisionClearOf(page, tableParts(page));
  await snap(page, testInfo, "santase-lead-390x844");
  await expectMinimizeAndReopen(page);
  const done: Done = {
    skip: 0,
    exchange: 0,
    marriage: 0,
    quiet: 0,
    declareValid: 0,
    close: 0,
    restricted: 0,
    declareMarriage: 0,
    declareFalse: 0,
    play: 0,
  };
  // Deal 1 of the scenario on the phone; deal 2 opens with the bot's lead, so
  // the trick is on the felt next to the full talon when it is my turn.
  for (let turn = 0; turn < 16 && !done.declareValid; turn++) {
    expect(await waitMyTurn(page)).toBe(true);
    const step = await takeTurn(page, done, testInfo);
    done[step]++;
    // the deal-end banners carry my (long) name: they must wrap, not run off
    if (step === "declareValid") await expectBannersOnScreen(page);
  }
  expect(done.declareValid).toBe(1);
  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="trick"] [data-card]').first()).toBeVisible();
  await expectTableLayout(page, {
    trump: ".aso-trump",
    opponent: '[data-zone="opponent"]',
    talon: '[data-zone="talon"]',
    trick: '[data-zone="trick"]',
    hand: '[data-zone="hand"]',
  });
  await snap(page, testInfo, "santase-390x844");
  await expectNotReloaded(page);
  expectNoErrors(t);
  await t.ctx.close();
});
