import { test, expect, type Page } from "@playwright/test";
import { expectNoErrors, expectServerAdvanced, openGame, probe, stateVersion, waitMyTurn } from "./helpers";
import {
  dragTo,
  expectFullyVisible,
  expectPlayAgain,
  fits,
  isHoriz,
  nextShot,
  playAgain,
  shipCells,
  snapBoth,
  PHONE,
} from "./helpers-grid";

/**
 * Морски бой срещу бот — само истински кликове и влачене (2D, WebGL изключен).
 * Подреждане: „Случайно“, избор на кораб, „Завърти“, влачене на мястото му,
 * преместване с клик върху празно поле, „Готов“; после стрелба до края на
 * играта, картата „Край на играта“ и „Играй пак“.
 */

type Layout = number[][]; // по кораб: клетките му

/** Флотът, както е нарисуван в редактора (data-ship = индекс на кораба). */
async function readLayout(page: Page): Promise<Layout> {
  return page.locator("[data-placement] [data-cell]").evaluateAll((els) => {
    const ships: number[][] = [];
    for (const el of els) {
      const k = el.getAttribute("data-ship");
      if (k === null) continue;
      (ships[Number(k)] ??= []).push(Number(el.getAttribute("data-cell")));
    }
    return ships.map((s) => s.sort((a, b) => a - b));
  });
}
const keyOf = (l: Layout) => JSON.stringify(l);
const cellsExcept = (l: Layout, k: number) => new Set(l.flatMap((s, i) => (i === k ? [] : s)));
const placeCell = (page: Page, cell: number) => page.locator(`[data-placement] [data-cell="${cell}"]`);

/** Изстрелите ми по мрежата на противника (попадение/пропуск) и потопените клетки. */
async function readShots(page: Page): Promise<{ shots: Map<number, "hit" | "miss">; sunk: Set<number> }> {
  const raw = await page.locator("[data-fire]").evaluateAll((els) =>
    els.map((el) => [Number(el.getAttribute("data-fire")), el.getAttribute("data-shot"), el.hasAttribute("data-sunk")] as const),
  );
  const shots = new Map<number, "hit" | "miss">();
  const sunk = new Set<number>();
  for (const [cell, shot, isSunk] of raw) {
    if (shot === "hit" || shot === "miss") shots.set(cell, shot);
    if (isSunk) sunk.add(cell);
  }
  return { shots, sunk };
}

test("морски бой: ръчно подреждане със завъртане, „Случайно“, „Готов“, стрелба до край и „Играй пак“", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(300_000);
  const t = await openGame(browser, baseURL!, "BATTLESHIP");
  const { page } = t;
  await expect(page.locator('[data-placement="open"]')).toBeVisible();
  await snapBoth(page, info, "battleship-place");

  // „Случайно“ пренарежда целия флот.
  const first = await readLayout(page);
  expect(first).toHaveLength(10);
  await page.locator('[data-action="random"]').click();
  await expect.poll(async () => keyOf(await readLayout(page))).not.toBe(keyOf(first));

  // Ръчно: четворката — избор с клик, „Завърти“, после влачене на свободно място.
  let layout = await readLayout(page);
  let target: number[] | null = null;
  let four = -1;
  for (let attempt = 0; attempt < 5 && !target; attempt++) {
    layout = await readLayout(page);
    four = layout.findIndex((s) => s.length === 4);
    const rotated = !isHoriz(layout[four]!);
    const others = cellsExcept(layout, four);
    for (let top = 0; top < 100 && !target; top++) {
      const cells = shipCells(top, 4, rotated);
      if (cells && fits(cells, others) && keyOf([cells]) !== keyOf([layout[four]!])) target = cells;
    }
    if (!target) await page.locator('[data-action="random"]').click(); // рядко: няма място
  }
  expect(target, "няма свободно място за завъртяната четворка").not.toBeNull();
  const wasHoriz = isHoriz(layout[four]!);
  await placeCell(page, layout[four]![0]!).click();
  await expect(page.locator('[data-placement] [data-selected="true"]')).toHaveCount(4);
  await page.locator('[data-action="rotate"]').click();
  await expect.poll(async () => isHoriz((await readLayout(page))[four]!)).toBe(!wasHoriz);
  // Влачи я за горната/лявата ѝ клетка до горната/лявата клетка на целта.
  const rotatedTop = (await readLayout(page))[four]![0]!;
  await dragTo(page, placeCell(page, rotatedTop), placeCell(page, target![0]!));
  await expect.poll(async () => keyOf([(await readLayout(page))[four]!])).toBe(keyOf([target!]));

  // Ръчно: едноклетъчен кораб — избор, после клик върху празно поле.
  layout = await readLayout(page);
  const single = layout.findIndex((s) => s.length === 1);
  const others = cellsExcept(layout, single);
  const spot = Array.from({ length: 100 }, (_, c) => c).find((c) => c !== layout[single]![0] && fits([c], others));
  expect(spot, "няма празно поле за едноклетъчния кораб").toBeDefined();
  await placeCell(page, layout[single]![0]!).click();
  await expect(placeCell(page, layout[single]![0]!)).toHaveAttribute("data-selected", "true");
  await placeCell(page, spot!).click();
  await expect(placeCell(page, spot!)).toHaveAttribute("data-ship", String(single));

  // Флотът е валиден (нищо червено) → „Готов“.
  await expect(page.locator("[data-placement] [data-bad]")).toHaveCount(0);
  const placed = await readLayout(page);
  const ready = page.locator('[data-action="ready"]');
  await expect(ready).toBeEnabled();
  await expectFullyVisible(ready);
  let v = await stateVersion(page);
  await ready.click();
  await expectServerAdvanced(page, v);

  // Стрелбата започва, щом и ботът е готов; сървърът пази точно моя флот.
  await expect(page.locator("[data-fire]").first()).toBeVisible({ timeout: 30_000 });
  const mine = await page.locator('[data-own][data-ship="true"]').evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute("data-own"))).sort((a, b) => a - b),
  );
  expect(mine).toEqual(placed.flat().sort((a, b) => a - b));
  await snapBoth(page, info, "battleship-fire");

  // Стрелба до края: всеки изстрел — истински клик, сървърът трябва да отговори.
  let shotsFired = 0;
  while (await waitMyTurn(page, 90_000)) {
    const { shots, sunk } = await readShots(page);
    const cell = nextShot(shots, sunk);
    const btn = page.locator(`[data-fire="${cell}"]`);
    await expect(btn).toHaveAttribute("data-fireable", "true");
    v = await stateVersion(page);
    await btn.click();
    await expectServerAdvanced(page, v);
    await expect(btn).toHaveAttribute("data-shot", /^(hit|miss)$/);
    shotsFired++;
    expect(shotsFired).toBeLessThanOrEqual(100);
  }
  expect(shotsFired).toBeGreaterThan(0);
  await expectPlayAgain(page);
  await snapBoth(page, info, "battleship-over");

  // „Играй пак“ → нов мач, отново подреждане.
  await playAgain(page);
  await expect(page.locator('[data-placement="open"]')).toBeVisible();
  expectNoErrors(t);
  await t.ctx.close();
});

test("морски бой на телефон: подреждането и стрелбата се виждат и кликат изцяло", async ({ browser, baseURL }) => {
  const t = await openGame(browser, baseURL!, "BATTLESHIP");
  const { page } = t;
  await page.setViewportSize(PHONE);
  await expect(page.locator('[data-placement="open"]')).toBeVisible();
  for (const action of ["rotate", "random", "ready"]) await expectFullyVisible(page.locator(`[data-action="${action}"]`));
  // Клетките на телефон са поне ~22px — иначе влаченето с пръст е лотария.
  const box = await page.locator("[data-placement] [data-cell]").first().boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(22);
  await expectFullyVisible(page.locator('[data-placement] [data-cell="9"]'));

  let v = await stateVersion(page);
  await page.locator('[data-action="ready"]').click();
  await expectServerAdvanced(page, v);
  // Банерът „огън!“ на телефон се пренася на редове и не излиза от екрана
  // (беше nowrap и „влиташе“ изместен наляво с половината си ширина).
  const banner = page.locator(".aso-announce").first();
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expectFullyVisible(banner);
  await expect(page.locator("[data-fire]").first()).toBeVisible({ timeout: 30_000 });
  const fireBox = await page.locator("[data-fire]").first().boundingBox();
  expect(fireBox!.width).toBeGreaterThanOrEqual(22);
  await expectFullyVisible(page.locator('[data-fire="9"]'));
  await expectFullyVisible(page.locator('[data-own="99"]'));
  for (let shot = 0; shot < 3 && (await waitMyTurn(page, 60_000)); shot++) {
    const { shots, sunk } = await readShots(page);
    const btn = page.locator(`[data-fire="${nextShot(shots, sunk)}"]`);
    await btn.scrollIntoViewIfNeeded();
    await expectFullyVisible(btn);
    v = await stateVersion(page);
    await btn.click();
    await expectServerAdvanced(page, v);
  }
  await expect(probe(page)).toHaveAttribute("data-phase", /playing|over/);
  expectNoErrors(t);
  await t.ctx.close();
});
