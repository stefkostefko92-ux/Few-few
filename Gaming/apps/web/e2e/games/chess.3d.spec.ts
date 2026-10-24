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
  waitViewChanged,
  waitViewIs,
} from "./helpers-board";

/**
 * Шах — 3D масата (WebGL през swiftshader в проекта games-3d): платното
 * рисува дъската и ходовете се правят с клик ВЪРХУ ПЛАТНОТО — в точката,
 * където сцената проектира полето (тестовата кука `window.__asoE2E.chess`).
 */

interface ChessHookView {
  fen: string;
  legal: { from: string; to: string; promotion?: string }[];
  selected: string | null;
  targets: string[];
  myTurn: boolean;
}

test("шах 3D: платното рисува, ходовете се правят с клик върху него", async ({ browser, baseURL }) => {
  test.setTimeout(5 * 60_000);
  const t = await openGame3D(browser, baseURL!, "CHESS");
  const { page } = t;
  await reduceMotion(page);
  const canvas = boardCanvas(page, "chess");
  await expect(canvas).toBeVisible();
  // 3D пътят, не 2D резервата.
  await expect(page.locator("[data-square]")).toHaveCount(0);

  let moves = 0;
  for (let i = 0; i < 6 && moves < 2; i++) {
    if (!(await waitTurn(page))) break;
    const v = await hookView<ChessHookView>(page, "chess");
    expect(v.myTurn).toBe(true);
    const mv = v.legal.find((a) => !a.promotion) ?? v.legal[0]!;
    // 1) избор на фигура с клик върху платното
    await clickOnCanvas(page, canvas, "chess", mv.from);
    await waitViewIs(page, "chess", "selected", mv.from);
    expect((await hookView<ChessHookView>(page, "chess")).targets).toContain(mv.to);
    // 2) поле-цел с клик върху платното → сървърът приема хода
    const before = await version(page);
    await clickOnCanvas(page, canvas, "chess", mv.to);
    await serverAdvanced(page, before);
    await waitViewChanged(page, "chess", "fen", v.fen);
    moves++;
  }
  expect(moves, "не се направиха два хода с клик по платното").toBe(2);
  // Платното рисува дъската (не е празно) — проверено след ходовете, за да
  // не изяжда часовника на първия ход; после снимки при двата размера.
  await expectCanvasPainted(page, canvas);
  await snapBoth(page, "chess-3d");
  expectNoErrors(t);
  await t.ctx.close();
});
