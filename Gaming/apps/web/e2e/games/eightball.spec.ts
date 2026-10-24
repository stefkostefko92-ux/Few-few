import { test, expect } from "@playwright/test";
import { expectNoErrors } from "./helpers";
import {
  checkLayout,
  expectCleanWire,
  expectNoCutReplays,
  openCueGame,
  playMatch,
  type ShotStyle,
} from "./helpers-cue";

/**
 * 8 топки срещу бот на 2D масата (WebGL е изключен в games-2d) — само с
 * действия на човек: разбиване с „Постави бялата“ зад линията, прицел с
 * натискане върху сукното (пътят на мишката до контролите НЕ мести прицела),
 * сила с плъзгача (мишка + стрелки), ефект (мишка + клавиатура, вкл. ръба
 * по диагонал), удар с „Удар“ (и двоен клик — тръгва един удар) и със Space
 * при фокус върху плъзгача. На осмицата джобът се обявява с бутона. Всеки
 * удар се сверява със сървъра (виж helpers-cue.ts); ако мачът свърши —
 * картата и „Нова игра“ (играй пак).
 */
const style = (n: number): ShotStyle =>
  n === 0
    ? { via: "button", steps: 12 }
    : n === 1
      ? { via: "space", steps: 12, spinWorkout: true }
      : n === 2
        ? { via: "button", steps: 10, rimSpin: true }
        : { via: n === 4 ? "double" : n % 2 ? "space" : "button", steps: 6 };

test("8 топки: прицел с мишката, сила, ефект, бяла в ръка и удар срещу бот", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(480_000);
  const t = await openCueGame(browser, baseURL!, "EIGHTBALL");

  const report = await playMatch(t, { shots: 6, untilOverMax: 14, style });

  expect(t.myShots).toBeGreaterThanOrEqual(6);
  expect(report.placements, "бялата в ръка беше поставена (разбиването)").toBeGreaterThan(0);
  await expectNoCutReplays(t);
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});

test("8 топки: масата и контролите при 1366×768 и 390×844", async ({ browser, baseURL }, info) => {
  const t = await openCueGame(browser, baseURL!, "EIGHTBALL");
  await checkLayout(t, info, "eightball-2d-1366x768");
  await t.page.setViewportSize({ width: 390, height: 844 });
  await checkLayout(t, info, "eightball-2d-390x844");
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});
