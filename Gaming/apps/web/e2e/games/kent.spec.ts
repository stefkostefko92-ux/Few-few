import { test, expect, type Page } from "@playwright/test";
import { expectNoErrors, waitMyTurn } from "./helpers";
import {
  act,
  action,
  CARD_GRIP,
  cardsIn,
  expectApart,
  expectBanner,
  expectGameOverThenPlayAgain,
  expectNotReloaded,
  expectTableLayout,
  openTable,
  PHONE,
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
 * Кент срещу трима ботове — само истински кликове по масата.
 *
 * Стекът раздава с фиксиран seed (KENT=e2e-kent-411, infra/e2e-games.sh):
 *  1. кръг: „Пас“ (нищо полезно в борсата; преди това избирам карта и я
 *     отказвам с втори клик), после смени „моя карта → карта от борсата“, докато
 *     събера каре аса → „Дай знак“ (тайно — ходът остава у мен). Партньорът
 *     вече е дал знак (виждам „Знак!“ при него) → „Купе!“ → кръгът е наш.
 *  2.–4. кръг: „Стоп Кент!“ без каре у противниците → точка за тях всеки път;
 *     1:3 → „Край“ → „Нова игра“ сяда в нов мач.
 * Тайният знак и „Купе!“ излизат сами като прозорец (по желание — „Не сега“
 * ги връща под масата до следващия ход); „Пас“ и „Стоп Кент!“ са бутоните
 * под масата (облогът „Стоп“ е възможен на всеки ход — не е прозорец).
 * Всеки ход се решава само по това, което показва масата (по същото правило
 * е избран seed-ът — офлайн реплика на стаята).
 */

const SEEDED_FIRST_HAND = ["2C", "TS", "AC", "2S"];
const SEEDED_FIRST_CENTER = ["9H", "7D", "4H", "9C"];

type Step = "swap" | "pass" | "signal" | "kupe" | "stop";

const rank = (c: string): string => c.slice(0, -1);

/** Take a centre card whose rank I already collect, giving up a card of my
 *  least-held other rank (the same idea as the engine's bot). */
function pickSwap(
  hand: string[],
  center: string[],
): { handIndex: number; centerIndex: number } | null {
  const counts = new Map<string, number>();
  for (const c of hand) counts.set(rank(c), (counts.get(rank(c)) ?? 0) + 1);
  let best: { handIndex: number; centerIndex: number; gain: number } | null = null;
  center.forEach((cc, ci) => {
    const r = rank(cc);
    const held = counts.get(r) ?? 0;
    if (held >= 4) return;
    let hi = -1;
    let minHeld = Infinity;
    hand.forEach((hc, i) => {
      if (rank(hc) === r) return;
      const n = counts.get(rank(hc)) ?? 0;
      if (n < minHeld) {
        minHeld = n;
        hi = i;
      }
    });
    if (hi < 0 || held + 1 <= minHeld) return;
    if (!best || held + 1 > best.gain) best = { handIndex: hi, centerIndex: ci, gain: held + 1 };
  });
  return best;
}

async function view(page: Page): Promise<{ hand: string[]; center: string[] }> {
  return {
    hand: (await cardsIn(page, "hand")).map((c) => c.card),
    center: (await cardsIn(page, "center")).map((c) => c.card),
  };
}

const handCard = (page: Page, i: number) => page.locator('[data-zone="hand"] [data-card]').nth(i);
const centerCard = (page: Page, i: number) =>
  page.locator('[data-zone="center"] [data-card]').nth(i);

/** Select a hand card, then click again: the selection is undone and the
 *  centre goes back to not clickable. */
async function selectAndUndo(page: Page): Promise<void> {
  await handCard(page, 0).click(CARD_GRIP);
  await expect(handCard(page, 0)).toHaveClass(/aso-card--selected/);
  await expect(page.locator('[data-zone="center"] [data-playable="true"]')).toHaveCount(4);
  await handCard(page, 0).click(CARD_GRIP);
  await expect(handCard(page, 0)).not.toHaveClass(/aso-card--selected/);
  await expect(page.locator('[data-zone="center"] [data-playable="true"]')).toHaveCount(0);
}

/** What a Kent call is decided by: my hand, the Kent hint, the partner's
 *  sign. On a phone (scrolled down to my hand and „Пас“) the popup's top third
 *  can sit over the partner's seat — there the sign is restated in its hint. */
async function kentTable(page: Page): Promise<Record<string, string>> {
  const phone = (page.viewportSize()?.width ?? 0) <= 640;
  if (phone && (await page.getByTestId("partner-signal").count()) > 0)
    await expect(decision(page).locator(".aso-decision__hint")).toContainText(/тайния знак/);
  return {
    hand: '[data-zone="hand"]',
    hint: '[data-testid="kent-hint"]',
    ...(phone ? {} : { sign: '[data-testid="partner-signal"]' }),
  };
}

async function takeTurn(page: Page, done: Record<Step, number>): Promise<Step> {
  await expect(action(page, "pass")).toBeVisible();
  if ((await decision(page).count()) > 0) {
    // the call came up by itself, on screen, clear of what it is about
    await expectDecisionOnScreen(page, /^(Имаш кент!|Партньорът ти даде знак!)$/);
    await expectDecisionClearOf(page, await kentTable(page));
  }
  if ((await action(page, "signal").count()) > 0) {
    // the secret sign — from the popup: no move on the table, my turn goes on
    await act(page, inDecision(page, '[data-action="signal"]'));
    await expect(action(page, "signal")).toHaveCount(0);
    await expect(action(page, "pass")).toBeVisible();
    return "signal";
  }
  if ((await action(page, "kupe").count()) > 0) {
    await expect(page.getByTestId("partner-signal")).toBeVisible();
    await expectDecisionOnScreen(page, /^Партньорът ти даде знак!$/);
    await act(page, inDecision(page, '[data-action="kupe"]'));
    await expectBanner(page, /^Купе! ✓$/);
    return "kupe";
  }
  if (done.signal && done.kupe && done.pass && (await action(page, "stop").count()) > 0) {
    await act(page, action(page, "stop"));
    await expectBanner(page, /^Стоп Кент! [✓✗]$/);
    return "stop";
  }
  const { hand, center } = await view(page);
  const swap = pickSwap(hand, center);
  if (!swap) {
    if (!done.pass) await selectAndUndo(page);
    await act(page, action(page, "pass"));
    return "pass";
  }
  await handCard(page, swap.handIndex).click(CARD_GRIP);
  await expect(handCard(page, swap.handIndex)).toHaveClass(/aso-card--selected/);
  const taken = center[swap.centerIndex]!;
  await act(page, centerCard(page, swap.centerIndex));
  expect((await view(page)).hand[swap.handIndex]).toBe(taken);
  return "swap";
}

test("кент: смяна, пас, тайният знак, „Купе!“ и „Стоп Кент!“ с кликове — до края на мача и „Нова игра“", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const t = await openTable(browser, baseURL!, "KENT");
  const { page } = t;

  expect(await waitMyTurn(page)).toBe(true);
  await expect(action(page, "pass")).toBeVisible();
  expect(
    await view(page),
    "стекът не раздава със seed-а на теста — пусни го с infra/e2e-games.sh (E2E_SEEDS)",
  ).toEqual({
    hand: SEEDED_FIRST_HAND,
    center: SEEDED_FIRST_CENTER,
  });
  await snap(page, testInfo, "kent-1366x768");

  const done: Record<Step, number> = { swap: 0, pass: 0, signal: 0, kupe: 0, stop: 0 };
  let checkedPrompt = false;
  for (let turn = 0; turn < 60; turn++) {
    if (!(await waitMyTurn(page))) break; // match over
    if (!checkedPrompt && (await decision(page).count()) > 0) {
      // the Kent popup: snapshot, then „Виж масата“ → pill → back
      checkedPrompt = true;
      await snap(page, testInfo, "kent-call-1366x768");
      await expectMinimizeAndReopen(page);
    }
    done[await takeTurn(page, done)]++;
    if (done.signal === 1 && done.kupe === 0) {
      // the Kent hint sits on the felt; the sticky calls cover neither it nor my hand
      await expect(page.getByTestId("kent-hint")).toBeVisible();
      await expectApart(page, '[data-testid="kent-hint"]', '[data-zone="actions"]');
      await expectApart(page, '[data-zone="hand"]', '[data-zone="actions"]');
      await snap(page, testInfo, "kent-kent-1366x768");
    }
  }
  expect(done, JSON.stringify(done)).toEqual({ swap: 3, pass: 3, signal: 1, kupe: 1, stop: 3 });
  expect(checkedPrompt, "прозорецът за знака/„Купе!“ не излезе").toBe(true);

  await expectGameOverThenPlayAgain(page);
  expect(await waitMyTurn(page)).toBe(true);
  await expect(page.locator('[data-zone="score"]')).toHaveAttribute("data-score", "0:0");
  await expect.poll(async () => (await view(page)).hand).toEqual(SEEDED_FIRST_HAND);
  await act(page, action(page, "pass"));

  await expectNotReloaded(page);
  await reopenRulesThenLeave(page);
  expectNoErrors(t);
  await t.ctx.close();
});

test("кент на телефон 390×844: места, борса и ръка не се застъпват", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const t = await openTable(browser, baseURL!, "KENT", { viewport: PHONE });
  const { page } = t;
  expect(await waitMyTurn(page)).toBe(true);
  await expect(action(page, "pass")).toBeVisible();
  await expectTableLayout(page, {
    top: '.aso-seat[data-pos="top"]',
    left: '.aso-seat[data-pos="left"]',
    right: '.aso-seat[data-pos="right"]',
    center: '[data-zone="center"]',
    hand: '[data-zone="hand"]',
  });
  await snap(page, testInfo, "kent-390x844");
  const done: Record<Step, number> = { swap: 0, pass: 0, signal: 0, kupe: 0, stop: 0 };
  // up to the Kent: the popup for the secret sign on a phone — whole on
  // screen, hand and hint uncovered; „Не сега“ hides it (no pill) and the
  // sign stays reachable under the table for this turn
  for (let turn = 0; turn < 20; turn++) {
    expect(await waitMyTurn(page)).toBe(true);
    if ((await decision(page).count()) > 0) {
      await expectDecisionOnScreen(page, /^(Имаш кент!|Партньорът ти даде знак!)$/);
      await expectDecisionClearOf(page, await kentTable(page));
      await snap(page, testInfo, "kent-call-390x844");
      await skipDecision(page);
      await expect(page.locator('[data-zone="actions"] [data-action="signal"]')).toBeVisible();
      break;
    }
    done[await takeTurn(page, done)]++;
  }
  expect(done.swap).toBeGreaterThan(0);
  await expect(page.locator('[data-zone="actions"] [data-action="signal"]')).toBeVisible();
  await expectNotReloaded(page);
  expectNoErrors(t);
  await t.ctx.close();
});
