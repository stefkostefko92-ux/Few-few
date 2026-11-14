import { test, expect, type Page } from "@playwright/test";
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
 * Табла — 3D масата: платното рисува, а ходовете се правят с клик ВЪРХУ
 * ПЛАТНОТО — точка с пул (или барът), после точката-цел (или подносът за
 * изнасяне) в проектираните им места (`window.__asoE2E.backgammon`).
 * „Хвърли“/„Пас“ са бутони под масата и в 3D.
 */

type Move = { type: "MOVE"; from: number | "BAR"; die: number };
interface BgHookView {
  state: { points: number[]; bar: [number, number]; remaining: number[] };
  legal: ({ type: "ROLL" } | { type: "PASS" } | Move)[];
  selected: number | "BAR" | null;
  targets: (number | "OFF")[];
  myTurn: boolean;
}

/** Аз съм белите (място 0) — движа се към точка 0. */
const destOf = (m: Move): number | "OFF" => {
  if (m.from === "BAR") return 24 - m.die;
  const d = m.from - m.die;
  return d < 0 ? "OFF" : d;
};

const action = (page: Page, a: string) => page.locator(`button[data-action="${a}"]`);

test("табла 3D: платното рисува, ходовете се правят с клик върху него", async ({ browser, baseURL }) => {
  test.setTimeout(6 * 60_000);
  const t = await openGame3D(browser, baseURL!, "BACKGAMMON");
  const { page } = t;
  await reduceMotion(page);
  const canvas = boardCanvas(page, "backgammon");
  await expect(canvas).toBeVisible();
  await expect(page.locator("[data-point]")).toHaveCount(0); // 3D, не 2D резервата

  let moves = 0;
  for (let i = 0; i < 40 && moves < 3; i++) {
    if (!(await waitTurn(page))) break;
    const v = await hookView<BgHookView>(page, "backgammon");
    if (v.legal.some((a) => a.type === "ROLL")) {
      const before = await version(page);
      await action(page, "roll").click();
      await serverAdvanced(page, before);
      continue;
    }
    if (v.legal.some((a) => a.type === "PASS")) {
      const before = await version(page);
      await action(page, "pass").click();
      await serverAdvanced(page, before);
      continue;
    }
    const mv = v.legal.find((a): a is Move => a.type === "MOVE");
    if (!mv) continue;
    const to = destOf(mv);
    // 1) начало: точката (или барът) — клик върху платното
    await clickOnCanvas(page, canvas, "backgammon", mv.from);
    await waitViewIs(page, "backgammon", "selected", mv.from);
    expect((await hookView<BgHookView>(page, "backgammon")).targets).toContain(to);
    // 2) цел: точката (или моят поднос) — клик върху платното → сървърът приема
    const before = await version(page);
    await clickOnCanvas(page, canvas, "backgammon", to);
    await serverAdvanced(page, before);
    moves++;
  }
  expect(moves, "не се направиха ходове с клик по платното").toBeGreaterThanOrEqual(2);
  // Платното рисува дъската (не е празно) — проверено след ходовете, за да
  // не изяжда часовника на първия ход; после снимки при двата размера.
  await expectCanvasPainted(page, canvas);
  await snapBoth(page, "backgammon-3d");
  expectNoErrors(t);
  await t.ctx.close();
});
