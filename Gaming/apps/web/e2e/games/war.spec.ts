import { test, expect } from "@playwright/test";
import { expectGameOverCard, expectNoErrors, openGame, stateVersion } from "./helpers";
import {
  clickAndAdvance,
  expectNoHorizontalScroll,
  expectNoRejections,
  expectStageCannotScroll,
  playAgain,
  snap,
  waitFor,
  watchSocket,
} from "./helpers-draw";
import { expectDecisionClearOf, expectDecisionOnScreen, expectMinimizeAndReopen } from "./prompt-checks";

// A click that cannot happen must fail fast with a clear cause, not idle
// until the test timeout (default action timeout is unlimited).
test.use({ actionTimeout: 20_000 });

/**
 * Война срещу бот — само истински кликове (2D, без WebGL):
 *  - обръщането върви и само (авто-обръщане след ~0.9 s, без клик);
 *  - „Обърни“ с клик; ДВОЕН клик праща точно един ход (регресия: вторият
 *    FLIP стигаше до сървъра и той го отхвърляше — „Невалиден ход“);
 *  - при равенство (война) решава човекът — в прозорец, който излиза сам
 *    горе, над равните карти: „В атака (3 карти)“ и „Предпазливо (1 карта)“ —
 *    и двете се натискат поне веднъж;
 *  - мачът се играе до края → карта „Край“ с бутони → „Нова игра“ = нов мач.
 */
test("война: обръщане, двоен клик, атака/предпазливо, до края и нова игра", async ({ browser, baseURL }, info) => {
  // Медианата е ~150 обръщания (~1 мин); опашката до ~1000 — щедър таван.
  test.setTimeout(12 * 60_000);
  const t = await openGame(browser, baseURL!, "WAR");
  const { page } = t;
  const ws = await watchSocket(t);
  const table = page.getByTestId("war-table");
  await expect(table).toBeVisible();
  await snap(page, info, "war-1366x768");
  await expectStageCannotScroll(table);

  const flipBtn = page.locator('[data-war-action="FLIP"]');
  const fightBtn = page.locator('[data-decision] [data-war-action="FIGHT"]');
  const skirmishBtn = page.locator('[data-decision] [data-war-action="SKIRMISH"]');

  /** Wait for my turn in the FLIP phase (a war decision is handled by the caller). */
  const myTurn = () => waitFor(page, undefined, 30_000);

  // 1) Авто-обръщане: на мой ход не правим нищо — клиентът обръща сам.
  expect(await myTurn()).toBe("mine");
  if ((await table.getAttribute("data-war-phase")) === "FLIP") {
    const sent = ws.sent.length;
    const before = await stateVersion(page);
    await expect.poll(() => ws.sent.length, { timeout: 5_000, message: "авто-обръщането не прати ход" }).toBeGreaterThan(sent);
    expect(ws.sent[sent]).toContain('"type":"FLIP"');
    await expect.poll(() => stateVersion(page), { timeout: 5_000 }).toBeGreaterThan(before);
  }

  let flips = 0;
  let fights = 0;
  let skirmishes = 0;
  let doubleChecked = false;
  let layoutChecked = false;
  let promptChecked = false;

  /** A manual flip must land inside the ~0.9 s before the auto-flip. If the
   *  auto-flip got there first (the turn moved on — maybe into my war
   *  decision), report false and let the loop go round again. */
  const tryFlip = async (click: () => Promise<void>): Promise<boolean> => {
    const before = await stateVersion(page);
    try {
      await click();
    } catch {
      return false;
    }
    await expect.poll(() => stateVersion(page), { timeout: 10_000 }).toBeGreaterThan(before);
    return true;
  };

  /** One decision on my turn: a war → alternate FIGHT/SKIRMISH; else FLIP. */
  const playTurn = async () => {
    if (await fightBtn.isVisible()) {
      await expect(table).toHaveAttribute("data-war-phase", "WAR");
      const useFight = fights <= skirmishes;
      const btn = useFight ? fightBtn : skirmishBtn;
      await expect(btn).toBeEnabled();
      // Решението е прозорец горе — в кадър, без да покрива равните карти.
      await expect(btn).toBeInViewport();
      await expectDecisionOnScreen(page, /^ВОЙНА!$/);
      await expectDecisionClearOf(page, { battle: ".aso-trick-card", bounty: ".war-bounty" });
      if (!promptChecked) {
        promptChecked = true;
        await snap(page, info, "war-decision-1366x768");
        await expectMinimizeAndReopen(page);
      }
      await clickAndAdvance(page, () => btn.click());
      if (useFight) fights++;
      else skirmishes++;
      return;
    }
    if (!((await flipBtn.count()) > 0 && (await flipBtn.isEnabled()))) return; // авто-обръщането изпревари
    if (!doubleChecked) {
      // Двоен клик → един-единствен FLIP (сървърът не бива да види втори).
      const sent = ws.sent.length;
      if (!(await tryFlip(() => flipBtn.dblclick({ timeout: 600 })))) return;
      const flipsSent = ws.sent.slice(sent).filter((s) => s.includes('"type":"FLIP"')).length;
      // Втори ход срещу СЪЩОТО състояние сървърът отхвърля („Невалиден ход“).
      expectNoRejections(ws);
      // Два приети FLIP-а = авто-обръщането (0.9 s) изпревари двойния клик и
      // ботът обърна между тях: вторият клик е законен ход в ново състояние,
      // не двойно пращане. Проверката е неубедителна — пак при следващото.
      if (flipsSent > 1) {
        flips++;
        return;
      }
      expect(flipsSent, "двойният клик прати повече от един ход").toBe(1);
      doubleChecked = true;
    } else if (!layoutChecked) {
      // „Обърни“ стои на мястото си и извън моя ход (изключен) — не изчезва и
      // не мести страницата под мишката на всяко обръщане.
      const top = () => flipBtn.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
      const y0 = await top();
      if (!(await tryFlip(() => flipBtn.click({ timeout: 800 })))) return;
      // Равенство при МОЕТО обръщане законно сменя бутона с решението за
      // войната — тогава проверяваме при следващото обръщане.
      if (!(await fightBtn.isVisible())) {
        await expect(flipBtn).toBeVisible();
        expect(await top(), "„Обърни“ се премести след хода").toBe(y0);
        layoutChecked = true;
      }
    } else if (!(await tryFlip(() => flipBtn.click({ timeout: 800 })))) {
      return;
    }
    flips++;
  };

  // 2) Първият мач — до самия край.
  for (;;) {
    const v = await myTurn();
    if (v === "over") break;
    await playTurn();
  }
  await expectGameOverCard(page);
  await snap(page, info, "war-game-over");
  expect(flips, "нито едно обръщане с клик").toBeGreaterThan(0);

  // 3) „Нова игра“ → нов мач (тестето отново е разделено 26:26 в началото).
  await playAgain(page);
  await expect(table).toBeVisible();
  await expect.poll(async () => Number(await table.getAttribute("data-war-flips"))).toBeLessThan(4);

  // 4) Войната е по случайност: ако в първия мач не се падна и атака, и
  //    предпазливо (или двойният клик все не успя преди авто-обръщането),
  //    играем новия мач, докато се паднат (и евентуално до края).
  while (fights === 0 || skirmishes === 0 || !doubleChecked || !layoutChecked) {
    const v = await myTurn();
    if (v === "over") {
      await expectGameOverCard(page);
      await playAgain(page);
      continue;
    }
    await playTurn();
  }

  expect(doubleChecked, "двойният клик на „Обърни“ не беше проверен").toBe(true);
  expect(layoutChecked, "мястото на „Обърни“ не беше проверено").toBe(true);
  expect(fights, "„В атака“ не беше натиснато").toBeGreaterThan(0);
  expect(skirmishes, "„Предпазливо“ не беше натиснато").toBeGreaterThan(0);
  expect(promptChecked).toBe(true);
  expectNoRejections(ws);
  expectNoErrors(t);
  await t.ctx.close();
});

test.describe("мобилен изглед 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("война на телефон: масата се побира и „Обърни“ работи", async ({ browser, baseURL }, info) => {
    test.setTimeout(8 * 60_000);
    const t = await openGame(browser, baseURL!, "WAR");
    const { page } = t;
    const ws = await watchSocket(t);
    const table = page.getByTestId("war-table");
    await expect(table).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, info, "war-390x844");

    // Ходове с клик на телефона (при война — решението с клик). Обръщането
    // трябва да изпревари авто-обръщането (~0.9 s), иначе — следващ ход.
    let clicked = 0;
    let shot = false;
    for (let i = 0; i < 12 && clicked < 2; i++) {
      if ((await waitFor(page, undefined, 30_000)) === "over") break;
      const fight = page.locator('[data-decision] [data-war-action="FIGHT"]');
      const isWar = await fight.isVisible();
      if (isWar && !shot) {
        shot = true;
        await expectDecisionOnScreen(page, /^ВОЙНА!$/);
        await expectDecisionClearOf(page, { battle: ".aso-trick-card" });
        await snap(page, info, "war-decision-390x844");
      }
      const btn = isWar ? fight : page.locator('[data-war-action="FLIP"]');
      const before = await stateVersion(page);
      try {
        await btn.click({ timeout: isWar ? 10_000 : 800 });
      } catch {
        continue;
      }
      await expect.poll(() => stateVersion(page), { timeout: 10_000 }).toBeGreaterThan(before);
      clicked++;
    }
    expect(clicked, "нито един ход с клик на телефона").toBeGreaterThan(0);
    // a war comes by chance (ties): let the auto-flip run until one does, then
    // the popup must sit above the tied cards on the phone too
    const fight = page.locator('[data-decision] [data-war-action="FIGHT"]');
    for (let i = 0; i < 400 && !shot; i++) {
      if ((await waitFor(page, () => fight.isVisible(), 30_000)) === "over") break;
      if (!(await fight.isVisible())) {
        await page.waitForTimeout(150); // my flip goes by itself
        continue;
      }
      shot = true;
      await expectDecisionOnScreen(page, /^ВОЙНА!$/);
      await expectDecisionClearOf(page, { battle: ".aso-trick-card" });
      await snap(page, info, "war-decision-390x844");
      await clickAndAdvance(page, () => fight.click());
    }
    await expectNoHorizontalScroll(page);
    expectNoRejections(ws);
    expectNoErrors(t);
    await t.ctx.close();
  });
});
