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
 * Снукър срещу бот на 2D масата — разбиване от ръка в „D“ („Постави
 * бялата“ + клик в полукръга), червена → цветна. След фал на бота изборът
 * излиза сам в прозорец за решение (умалената маса вътре; „Виж масата“ →
 * хапче → обратно): веднъж „Нека играе пак“ / „Върни топките“, после „Играя
 * аз“. Прицел с натискане върху сукното, сила с плъзгача (мишка + стрелки),
 * ефект (мишка + клавиатура), „Удар“ (и двоен клик — тръгва един удар) и
 * Space. Всеки удар се сверява със сървъра (точки, фалове, свободна топка —
 * същият двигател).
 */
const style = (n: number): ShotStyle =>
  n === 0
    ? { via: "button", steps: 12 }
    : n === 1
      ? { via: "space", steps: 12, spinWorkout: true }
      : n === 3
        ? { via: "button", steps: 10, rimSpin: true }
        : { via: n === 4 ? "double" : n % 2 ? "space" : "button", steps: 6 };

test("снукър: прицел с мишката, сила, ефект, бяла в „D“ и удар срещу бот", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(540_000);
  const t = await openCueGame(browser, baseURL!, "SNOOKER");

  // Човекът вкарва почти всичко — след своите удари дава масата на бота
  // (законни удари без вкарана топка), докато ботът направи фал.
  const report = await playMatch(t, {
    shots: 6,
    untilOverMax: 10,
    untilDecision: true,
    passTable: true,
    budgetMs: 240_000,
    style,
  });

  expect(t.myShots).toBeGreaterThanOrEqual(6);
  expect(report.placements, "бялата в ръка беше поставена в „D“ (разбиването)").toBeGreaterThan(0);
  expect(report.foulChoices, "изборът след фал на бота — през прозореца").toBeGreaterThan(0);
  expect(report.popupChecks, "прозорецът излезе сам, свива се и се връща").toBe(1);
  await expectNoCutReplays(t);
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});

test("снукър: масата и контролите при 1366×768 и 390×844", async ({ browser, baseURL }, info) => {
  const t = await openCueGame(browser, baseURL!, "SNOOKER");
  await checkLayout(t, info, "snooker-2d-1366x768");
  await t.page.setViewportSize({ width: 390, height: 844 });
  await checkLayout(t, info, "snooker-2d-390x844");
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});
