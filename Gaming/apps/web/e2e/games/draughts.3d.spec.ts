import { test, expect } from "@playwright/test";
import { expectNoErrors } from "./helpers";
import {
  boardCanvas,
  clickOnCanvas,
  expectCanvasPainted,
  hookView,
  openGame3D,
  reduceMotion,
  serverAdvanced,
  snapBoth,
  version,
  waitTurn,
  waitViewIs,
} from "./helpers-board";

/**
 * Руска дама — 3D масата: платното рисува, а ходовете (избор на пул, после
 * поле) се правят с клик ВЪРХУ ПЛАТНОТО в проектираната точка на полето
 * (`window.__asoE2E.draughts`). При вземане с продължение пулът е избран сам
 * и следващият скок също е клик по платното.
 */

interface DraughtsHookView {
  board: (string | null)[];
  legal: { from: number; to: number }[];
  selected: number | null;
  targets: number[];
  myTurn: boolean;
}

test("дама 3D: платното рисува, ходовете се правят с клик върху него", async ({ browser, baseURL }) => {
  test.setTimeout(5 * 60_000);
  const t = await openGame3D(browser, baseURL!, "DRAUGHTS");
  const { page } = t;
  await reduceMotion(page);
  const canvas = boardCanvas(page, "draughts");
  await expect(canvas).toBeVisible();
  await expect(page.locator("[data-cell]")).toHaveCount(0); // 3D, не 2D резервата

  let moves = 0;
  for (let i = 0; i < 10 && moves < 3; i++) {
    if (!(await waitTurn(page))) break;
    const v = await hookView<DraughtsHookView>(page, "draughts");
    expect(v.myTurn).toBe(true);
    const mv = v.legal[0]!;
    if (v.selected !== mv.from) {
      await clickOnCanvas(page, canvas, "draughts", mv.from);
      await waitViewIs(page, "draughts", "selected", mv.from);
    }
    expect((await hookView<DraughtsHookView>(page, "draughts")).targets).toContain(mv.to);
    const before = await version(page);
    await clickOnCanvas(page, canvas, "draughts", mv.to);
    await serverAdvanced(page, before);
    moves++;
  }
  expect(moves, "не се направиха ходове с клик по платното").toBeGreaterThanOrEqual(2);
  // Платното рисува дъската (не е празно) — проверено след ходовете, за да
  // не изяжда часовника на първия ход; после снимки при двата размера.
  await expectCanvasPainted(page, canvas);
  await snapBoth(page, "draughts-3d");
  expectNoErrors(t);
  await t.ctx.close();
});
