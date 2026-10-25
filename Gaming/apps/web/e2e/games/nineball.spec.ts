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
 * 9 топки срещу бот на 2D масата — разбиване от ръка зад линията, после
 * винаги първо най-ниската топка. Ударът веднага след разбиването може да е
 * push-out: прозорецът за решение излиза сам (с умалената маса), „Виж
 * масата“ го свива в хапче, хапчето го връща; push-out се обявява в него и
 * ударът тръгва с него (в следващ рак — „Нормален удар“). Прицел с натискане
 * върху сукното, сила с плъзгача (мишка + стрелки), ефект (мишка +
 * клавиатура), „Удар“ (и двоен клик — тръгва един удар) и Space. Всеки удар
 * се сверява със сървъра.
 */
const style = (n: number): ShotStyle =>
  n === 0
    ? { via: "button", steps: 12 }
    : n === 1
      ? { via: "space", steps: 12, rimSpin: true }
      : n === 2
        ? { via: "button", steps: 10, spinWorkout: true }
        : { via: n === 4 ? "double" : n % 2 ? "space" : "button", steps: 6 };

test("9 топки: прицел с мишката, сила, ефект, push-out и удар срещу бот", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(480_000);
  const t = await openCueGame(browser, baseURL!, "NINEBALL");

  const report = await playMatch(t, { shots: 6, untilOverMax: 12, style });

  expect(t.myShots).toBeGreaterThanOrEqual(6);
  expect(report.placements, "бялата в ръка беше поставена (разбиването)").toBeGreaterThan(0);
  // Разбиването е детерминистично (същият рак, същият план): след него идва push-out.
  expect(report.pushOuts, "push-out през прозореца за решение").toBe(1);
  expect(report.popupChecks, "прозорецът излезе сам, свива се и се връща").toBe(1);
  await expectNoCutReplays(t);
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});

test("9 топки: масата и контролите при 1366×768 и 390×844", async ({ browser, baseURL }, info) => {
  const t = await openCueGame(browser, baseURL!, "NINEBALL");
  await checkLayout(t, info, "nineball-2d-1366x768");
  await t.page.setViewportSize({ width: 390, height: 844 });
  await checkLayout(t, info, "nineball-2d-390x844");
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});
