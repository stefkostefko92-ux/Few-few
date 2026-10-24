import { test, expect, type Page } from "@playwright/test";
import { expectNoErrors } from "./helpers";
import {
  boardCanvas,
  clickOnCanvas,
  diceMisalignment,
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
 * Покер на зарове — WebGL тавата (PixiJS; в games-3d през swiftshader):
 * платното рисува заровете, а задържането става с клик ВЪРХУ ЗАРА в
 * платното (там стои прозрачният му бутон — `window.__asoE2E.dice` дава
 * точката). „Хвърли пак“ пази задържаните; записът е клик в таблицата.
 * Регресия: след смяна на ширината (завъртян телефон) заровете остават
 * под бутоните си и петият зар не излиза от тавата.
 */

interface DiceHookView {
  values: number[];
  held: boolean[];
  canToggle: boolean;
}

const roll = (page: Page) => page.locator('button[data-action="roll"]');
const NONE = [false, false, false, false, false];

test("зарове WebGL: платното рисува, задържане с клик върху заровете", async ({ browser, baseURL }) => {
  test.setTimeout(6 * 60_000);
  const t = await openGame3D(browser, baseURL!, "DICE");
  const { page } = t;
  await reduceMotion(page);
  const canvas = boardCanvas(page, "dice");
  await expect(canvas).toBeVisible();
  await expect(page.locator("[data-die-index]")).toHaveCount(0); // WebGL тавата, не 2D резервата
  expect(await diceMisalignment(page)).toEqual([]);

  let turns = 0;
  for (let i = 0; i < 6 && turns < 2; i++) {
    if (!(await waitTurn(page))) break;
    let before = await version(page);
    await roll(page).click();
    await serverAdvanced(page, before);
    await waitViewIs(page, "dice", "canToggle", true);
    const rolled = (await hookView<DiceHookView>(page, "dice")).values;
    if (turns === 1) {
      // Телефонът се завърта (тясна тава) — петият зар трябва да се задържа.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => diceMisalignment(page)).toEqual([]);
      await clickOnCanvas(page, canvas, "dice", 4, ".dice-gl__btn");
      await waitViewIs(page, "dice", "held", [false, false, false, false, true]);
      await clickOnCanvas(page, canvas, "dice", 4, ".dice-gl__btn");
      await waitViewIs(page, "dice", "held", NONE);
      await page.setViewportSize({ width: 1366, height: 768 });
      await expect.poll(() => diceMisalignment(page)).toEqual([]);
    }
    // Задържай заровете 0 и 3 с клик върху тях в платното.
    await clickOnCanvas(page, canvas, "dice", 0, ".dice-gl__btn");
    await waitViewIs(page, "dice", "held", [true, false, false, false, false]);
    await clickOnCanvas(page, canvas, "dice", 3, ".dice-gl__btn");
    await waitViewIs(page, "dice", "held", [true, false, false, true, false]);
    // Повторен клик отменя задържането — и пак го слагаме.
    await clickOnCanvas(page, canvas, "dice", 3, ".dice-gl__btn");
    await waitViewIs(page, "dice", "held", [true, false, false, false, false]);
    await clickOnCanvas(page, canvas, "dice", 3, ".dice-gl__btn");
    await waitViewIs(page, "dice", "held", [true, false, false, true, false]);
    // „Държа“ стои под задържаните зарове 0 и 3 (не струпано под средния).
    await expect(page.locator(".dice-gl__btn .dice-held-tag")).toHaveCount(2);
    expect(await diceMisalignment(page)).toEqual([]);

    before = await version(page);
    await roll(page).click(); // „Хвърли пак“
    await serverAdvanced(page, before);
    const after = (await hookView<DiceHookView>(page, "dice")).values;
    expect(after[0], "задържаният зар 0 се смени").toBe(rolled[0]);
    expect(after[3], "задържаният зар 3 се смени").toBe(rolled[3]);
    if (turns === 0) {
      // Заровете с точки са нарисувани (платното не е празно) + снимки.
      await expectCanvasPainted(page, canvas, 0.15);
      await snapBoth(page, "dice-3d");
    }

    // Запис в първата свободна категория.
    const cell = page.locator('[data-seat="0"][data-selectable="true"]').first();
    const cat = await cell.getAttribute("data-category");
    before = await version(page);
    await cell.click();
    await serverAdvanced(page, before);
    await expect(page.locator(`[data-seat="0"][data-category="${cat}"]`)).toHaveAttribute("data-filled", /\d+/);
    turns++;
  }
  expect(turns, "не се изиграха два хода").toBe(2);
  expectNoErrors(t);
  await t.ctx.close();
});
