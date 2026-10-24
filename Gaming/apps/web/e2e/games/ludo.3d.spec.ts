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
} from "./helpers-board";

/**
 * Не се сърди човече — 3D масата: платното рисува, а пулът се мести с клик
 * ВЪРХУ ПЛАТНОТО — точно върху 3D пула (`window.__asoE2E.ludo`, id "0:<пул>").
 * „Хвърли“/„Пас“ са бутони под масата. Поне два хода с клик, от тях поне
 * едно излизане с 6 (кликът е върху пула в базата).
 */

interface LudoHookView {
  state: { progress: number[][]; die: number | null };
  legal: ({ type: "ROLL" } | { type: "PASS" } | { type: "MOVE"; token: number })[];
  movable: number[];
  myTurn: boolean;
}

const action = (page: Page, a: string) => page.locator(`button[data-action="${a}"]`);

test("човече 3D: платното рисува, пулът се мести с клик върху него", async ({ browser, baseURL }) => {
  test.setTimeout(8 * 60_000);
  const t = await openGame3D(browser, baseURL!, "LUDO");
  const { page } = t;
  await reduceMotion(page);
  const canvas = boardCanvas(page, "ludo");
  await expect(canvas).toBeVisible();
  await expect(page.locator(".ludo-pawn")).toHaveCount(0); // 3D, не 2D резервата

  let moves = 0;
  let exits = 0;
  for (let i = 0; i < 300 && (moves < 2 || exits < 1); i++) {
    if (!(await waitTurn(page, 90_000))) break;
    const v = await hookView<LudoHookView>(page, "ludo");
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
    if (v.movable.length === 0) continue;
    // Излизане от базата с 6 (клик върху пула в базата), иначе пул на пътя.
    const fromBase = v.movable.find((tk) => v.state.progress[0]![tk] === -1);
    const token = fromBase ?? v.movable[0]!;
    const was = v.state.progress[0]![token]!;
    const before = await version(page);
    await clickOnCanvas(page, canvas, "ludo", `0:${token}`);
    await serverAdvanced(page, before);
    const now = (await hookView<LudoHookView>(page, "ludo")).state.progress[0]![token];
    expect(now, "пулът не тръгна след клика").not.toBe(was);
    if (was === -1) exits++;
    moves++;
  }
  expect(moves, "не се направиха ходове с клик по платното").toBeGreaterThanOrEqual(2);
  expect(exits, "пулът не излезе от базата с клик по платното").toBeGreaterThanOrEqual(1);
  // Платното рисува дъската (не е празно) — проверено след ходовете, за да
  // не изяжда часовника на първия ход; после снимки при двата размера.
  await expectCanvasPainted(page, canvas);
  await snapBoth(page, "ludo-3d");
  expectNoErrors(t);
  await t.ctx.close();
});
