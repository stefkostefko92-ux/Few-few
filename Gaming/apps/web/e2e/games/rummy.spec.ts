import { test, expect, type Page } from "@playwright/test";
import { arrangeMeld } from "@aso/game-core";
import { expectNoErrors, openGame, probe } from "./helpers";
import {
  clickAndAdvance,
  clickVisible,
  expectEvent,
  expectNoHorizontalScroll,
  expectNoRejections,
  expectStageCannotScroll,
  snap,
  waitFor,
  watchSocket,
  type SocketWatch,
} from "./helpers-draw";
import { acceptsFor, nextStep, type Memory, type RummyView, type Step } from "./rummy-plan";

// A click that cannot happen must fail fast with a clear cause, not idle
// until the test timeout (default action timeout is unlimited).
test.use({ actionTimeout: 20_000 });

/**
 * Българско реми (2 тестета + 4 жокера, отваряне с 51, мач до 501) срещу бот —
 * само истински кликове. Стекът закрепва раздаването (E2E_SEEDS в
 * infra/e2e-games.sh): още първият ход позволява отваряне, в което жокер стои
 * на мястото на карта от ръката, и рунд 1 минава през ВСЯКО действие:
 *  - теглене от тестето и вземане на горната карта от купа (+ задължителното
 *    ѝ използване), избор на карти с клик по видимата им част;
 *  - отваряне ≥ 51 с брояча („Отваряне: N / 51 т.“, „Отвори (N т.)“);
 *  - „Изчисти“ натрупаното отваряне и „Подреди“ ръката;
 *  - полагане на комбинация, долепване към комбинация, смяна на жокер;
 *  - хвърляне; излизане → отчетът „Край на рунд 1“ → „Продължи“ → рунд 2.
 * Решенията взима rummy-plan.ts (същите като в офлайн симулацията); всеки ход
 * се проверява и по събитието, което сървърът е приложил.
 */
test("реми: тегли/вземи, отваряне ≥51, комбинация, долепване, смяна на жокер, хвърляне, цял рунд", async ({ browser, baseURL }, info) => {
  test.setTimeout(8 * 60_000);
  const t = await openGame(browser, baseURL!, "RUMMY");
  const { page } = t;
  const ws = await watchSocket(t);
  const table = page.getByTestId("rummy-table");
  await expect(table).toBeVisible();
  await snap(page, info, "rummy-1366x768");
  await expectStageCannotScroll(table);

  const counts: Record<Step["kind"], number> = { draw: 0, take: 0, open: 0, meld: 0, layoff: 0, swap: 0, discard: 0 };
  const mem: Memory = { swapDone: false };
  const report = page.getByTestId("rummy-report");
  let uiChecked = false;
  let rounds = 0;
  const allDone = () => Object.values(counts).every((n) => n > 0);

  for (let guard = 0; guard < 600; guard++) {
    const v = await waitFor(page, () => report.isVisible(), 90_000);
    if (v === "over") break;
    if (v === "extra") {
      // Край на рунда: отчетът с наказанията, после „Продължи“.
      rounds++;
      await expect(report).toContainText(`Край на рунд ${rounds}`);
      await expect(report).toContainText(/Наказание/);
      await snap(page, info, `rummy-round-${rounds}-report`);
      await report.locator('[data-rummy-btn="report-continue"]').click();
      await expect(report).toBeHidden();
      await expect(table).toHaveAttribute("data-round", String(rounds + 1));
      if (allDone() || rounds >= 6) break;
      continue;
    }
    const view = await readView(page);
    // Бутоните са под масата — на 1366×768 трябва да дойдат в кадър сами.
    if (view.phase === "PLAY") await expect(page.getByTestId("rummy-controls")).toBeInViewport();
    const step = nextStep(view, mem, acceptsFor(view));
    if (!uiChecked && view.phase === "PLAY" && step.kind === "open") {
      await checkSortAndClear(page, view, step.melds[0]!);
      uiChecked = true;
    }
    await perform(page, ws, view.seat, step);
    counts[step.kind]++;
  }

  for (const [kind, n] of Object.entries(counts)) expect(n, `не беше изпълнено: ${kind}`).toBeGreaterThan(0);
  expect(uiChecked, "„Подреди“/„Изчисти“ не бяха проверени").toBe(true);
  expect(rounds, "нито един завършен рунд").toBeGreaterThan(0);
  expectNoRejections(ws);
  expectNoErrors(t);
  await t.ctx.close();
});

/** The table as the spec sees it — read from the view's data-* hooks. */
async function readView(page: Page): Promise<RummyView> {
  const table = page.getByTestId("rummy-table");
  const attr = async (n: string) => (await table.getAttribute(n)) ?? "";
  const words = (s: string) => s.split(" ").filter(Boolean);
  const melds = await page.locator("[data-meld-id]").evaluateAll((els) =>
    els.map((e) => ({
      id: Number(e.getAttribute("data-meld-id")),
      owner: Number(e.getAttribute("data-meld-owner")),
      kind: (e.getAttribute("data-meld-kind") ?? "run") as "run" | "set",
      cards: (e.getAttribute("data-meld-cards") ?? "").split(" ").filter(Boolean),
    })),
  );
  return {
    seat: Number(await probe(page).getAttribute("data-seat")),
    seats: Number(await attr("data-seats")),
    phase: (await attr("data-rummy-phase")) as "DRAW" | "PLAY",
    hand: words(await attr("data-hand")),
    melds,
    opened: (await attr("data-opened")) === "true",
    pending: words(await attr("data-pending")),
    takeable: (await page.getByTestId("rummy-discard").getAttribute("data-takeable")) === "true",
  };
}

/** Select cards in the fanned hand by clicking their visible strip. */
async function selectCards(page: Page, cards: string[]): Promise<void> {
  for (const c of cards) {
    const card = page.locator(`.aso-myhand [data-rcard="${c}"]`);
    await clickVisible(card);
    await expect(card, `картата ${c} не се избра`).toHaveAttribute("data-selected", "true");
  }
}

/** „Подреди“ toggles dealt/sorted order; „Изчисти“ undoes a staged opening. */
async function checkSortAndClear(page: Page, view: RummyView, meld: string[]): Promise<void> {
  const order = () => page.locator(".aso-myhand [data-rcard]").evaluateAll((els) => els.map((e) => e.getAttribute("data-rcard")!));
  const sortBtn = page.locator('[data-rummy-btn="sort"]');
  const sorted = await order();
  await sortBtn.click();
  await expect(sortBtn).toHaveAttribute("aria-pressed", "false");
  expect(await order(), "„Подреди“ (изкл.) трябва да покаже ръката по реда на раздаване").toEqual(view.hand);
  await sortBtn.click();
  await expect(sortBtn).toHaveAttribute("aria-pressed", "true");
  expect(await order()).toEqual(sorted);

  // Натрупай една комбинация в отварянето и я изчисти.
  await selectCards(page, meld);
  await page.locator('[data-rummy-btn="stage"]').click();
  const opening = page.getByTestId("rummy-opening");
  await expect(opening).toHaveAttribute("data-pts", String(arrangeMeld(meld)!.value));
  await expect(page.getByTestId("rummy-staged")).toBeVisible();
  for (const c of meld) await expect(page.locator(`.aso-myhand [data-rcard="${c}"]`)).toHaveCount(0);
  await page.locator('[data-rummy-btn="clear"]').click();
  await expect(page.getByTestId("rummy-staged")).toHaveCount(0);
  await expect(opening).toHaveAttribute("data-pts", "0");
  for (const c of meld) await expect(page.locator(`.aso-myhand [data-rcard="${c}"]`)).toHaveCount(1);
}

/** Carry out one decided step with clicks and check what the server applied. */
async function perform(page: Page, ws: SocketWatch, seat: number, step: Step): Promise<void> {
  const table = page.getByTestId("rummy-table");
  const from = ws.events.length;
  const mine = (type: string) => (e: Record<string, unknown>) => e.type === type && e.seat === seat;
  const handSize = async () => (await table.getAttribute("data-hand"))!.split(" ").filter(Boolean).length;

  switch (step.kind) {
    case "draw": {
      const stock = page.getByTestId("rummy-stock");
      await expect(stock).toHaveAttribute("data-drawable", "true");
      const before = await handSize();
      await clickAndAdvance(page, () => clickVisible(stock.getByRole("button")));
      await expectEvent(ws, from, mine("DRAW"), "сървърът не потвърди тегленето");
      await expect.poll(handSize).toBe(before + 1);
      return;
    }
    case "take": {
      const pile = page.getByTestId("rummy-discard");
      await expect(pile).toHaveAttribute("data-takeable", "true");
      const top = (await pile.getAttribute("data-top"))!;
      await clickAndAdvance(page, () => clickVisible(pile.getByRole("button")));
      const ev = await expectEvent(ws, from, mine("TAKE"), "сървърът не потвърди вземането от купа");
      expect(ev.card).toBe(top);
      // Взетата карта е „задължителна“ — маркирана, хвърлянето е забранено.
      await expect(table).toHaveAttribute("data-pending", new RegExp(`(^| )${top.replace("*", "\\*")}( |$)`));
      return;
    }
    case "open": {
      let total = 0;
      const opening = page.getByTestId("rummy-opening");
      for (const meld of step.melds) {
        await selectCards(page, meld);
        const value = arrangeMeld(meld)!.value;
        await expect(page.getByTestId("rummy-selected")).toHaveAttribute("data-pts", String(value));
        const stage = page.locator('[data-rummy-btn="stage"]');
        await expect(stage).toBeEnabled();
        await stage.click();
        total += value;
        await expect(opening).toHaveAttribute("data-pts", String(total));
        await expect(opening).toHaveText(`Отваряне: ${total} / 51 т.`);
      }
      expect(total).toBe(step.points);
      expect(total).toBeGreaterThanOrEqual(51);
      const open = page.locator('[data-rummy-btn="open"]');
      await expect(open).toHaveText(`Отвори (${total} т.)`);
      await expect(open).toBeEnabled();
      await clickAndAdvance(page, () => open.click());
      const ev = await expectEvent(ws, from, mine("OPEN"), "сървърът не потвърди отварянето");
      expect(ev.points).toBe(total);
      await expect(table).toHaveAttribute("data-opened", "true");
      return;
    }
    case "meld": {
      await selectCards(page, step.cards);
      const meld = page.locator('[data-rummy-btn="meld"]');
      await expect(meld).toBeEnabled();
      await clickAndAdvance(page, () => meld.click());
      await expectEvent(ws, from, mine("MELD"), "сървърът не потвърди комбинацията");
      return;
    }
    case "layoff":
    case "swap": {
      await selectCards(page, [step.card]);
      const target = page.locator(`[data-meld-id="${step.meldId}"]`);
      await expect(target, "масата не предлага хода върху тази комбинация").toHaveAttribute(
        "data-meld-action",
        step.kind === "layoff" ? "LAYOFF" : "SWAP",
      );
      await clickAndAdvance(page, () => clickVisible(target));
      const ev = await expectEvent(ws, from, mine(step.kind.toUpperCase()), `сървърът не потвърди ${step.kind}`);
      expect(ev.meldId).toBe(step.meldId);
      if (step.kind === "swap") {
        // Сменената карта е в комбинацията, жокерът — в ръката и задължителен.
        await expect(target).toHaveAttribute("data-meld-cards", new RegExp(`(^| )${step.card}( |$)`));
        await expect(table).toHaveAttribute("data-pending", /\*/);
      }
      return;
    }
    case "discard": {
      await selectCards(page, [step.card]);
      const btn = page.locator('[data-rummy-btn="discard"]');
      await expect(btn).toBeEnabled();
      await clickAndAdvance(page, () => btn.click());
      const ev = await expectEvent(ws, from, mine("DISCARD"), "сървърът не потвърди хвърлянето");
      expect(ev.card).toBe(step.card);
      return;
    }
  }
}

test.describe("мобилен изглед 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("реми на телефон: всяка карта в ветрилото се избира, първият ход с клик", async ({ browser, baseURL }, info) => {
    const t = await openGame(browser, baseURL!, "RUMMY");
    const { page } = t;
    const ws = await watchSocket(t);
    await expect(page.getByTestId("rummy-table")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, info, "rummy-390x844");
    const mem: Memory = { swapDone: false };
    // Първият ход (отваряне, смяна, долепване, хвърляне) — с клик по тясната
    // видима ивица на всяка карта.
    for (let i = 0; i < 12; i++) {
      if ((await waitFor(page, undefined, 60_000)) !== "mine") break;
      const view = await readView(page);
      if (view.phase === "DRAW") break; // ходът ми свърши — до следващия не чакаме
      const step = nextStep(view, mem, acceptsFor(view));
      await perform(page, ws, view.seat, step);
      if (step.kind === "discard") break;
    }
    await snap(page, info, "rummy-390x844-opened");
    await expect(page.getByTestId("rummy-table")).toHaveAttribute("data-opened", "true");
    await expectNoHorizontalScroll(page);
    expectNoRejections(ws);
    expectNoErrors(t);
    await t.ctx.close();
  });
});
