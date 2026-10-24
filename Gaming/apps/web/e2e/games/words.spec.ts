import { test, expect, type Page } from "@playwright/test";
import { availableWords, type WordsState } from "@aso/game-core";
import { expectNoErrors, expectServerAdvanced, isOver, newPlayer, openGame, probe, stateVersion, waitMyTurn } from "./helpers";
import { expectFullyVisible, expectPlayAgain, playAgain, snapBoth, verdict, PHONE } from "./helpers-grid";

/**
 * Думи срещу бот — играчът ПИШЕ думите си в полето и натиска „Играй“ (или
 * „Пас“). Валидна дума удължава веригата и предава хода; невалидна (не е в
 * речника, грешна буква, вече казана) струва живот и ходът остава у теб; пасът
 * струва живот и започва нова верига; изтекъл часовник = пас (−1 живот).
 */

const myLives = async (page: Page): Promise<number> => {
  const seat = await probe(page).getAttribute("data-seat");
  return Number(await page.locator(`[data-player="${seat}"]`).getAttribute("data-lives"));
};

/** Веригата така, както е на масата: казаните думи и буквата за следващата. */
async function chain(page: Page): Promise<{ used: string[]; letter: string }> {
  const used = await page.locator("[data-word]").evaluateAll((els) => els.map((el) => el.getAttribute("data-word") ?? ""));
  const letter = (await page.locator("[data-letter]").getAttribute("data-letter")) ?? "";
  return { used, letter };
}

/** Дума, която човек би казал сега: от речника, с нужната буква, неказана. */
async function aValidWord(page: Page): Promise<string> {
  const { used, letter } = await chain(page);
  const state: WordsState = { used, lastLetter: letter, lives: [3, 3], turn: 0, seats: 2, winner: null, done: false };
  const words = availableWords(state);
  expect(words.length, `няма дума с „${letter}“`).toBeGreaterThan(0);
  return words[Math.floor(Math.random() * words.length)]!;
}

/** Напиши думата с клавиатурата и натисни „Играй“; сървърът трябва да отговори. */
async function typeWord(page: Page, word: string): Promise<void> {
  const input = page.locator('[data-action="word"]');
  await expect(input).toBeVisible();
  await input.fill("");
  await input.pressSequentially(word);
  const play = page.locator('[data-action="play"]');
  await expect(play).toBeEnabled();
  const v = await stateVersion(page);
  await play.click();
  await expectServerAdvanced(page, v);
}

/** Валиден ход: думата влиза във веригата и ходът минава към бота. */
async function playValid(page: Page): Promise<string> {
  const word = await aValidWord(page);
  const lives = await myLives(page);
  await typeWord(page, word);
  await expect(page.locator(`[data-word="${word}"]`)).toBeVisible();
  expect(await myLives(page)).toBe(lives);
  return word;
}

test("думи: валидна дума, невалидна дума (−1 живот), пас, изтекъл часовник — до края и „Играй пак“", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(240_000);
  const t = await openGame(browser, baseURL!, "WORDS");
  const { page } = t;
  expect(await waitMyTurn(page)).toBe(true);
  await snapBoth(page, info, "words");
  expect(await myLives(page)).toBe(3);

  // Валидна дума → веригата расте, ботът отговаря със своя дума.
  const mine = await playValid(page);
  expect(await waitMyTurn(page)).toBe(true);
  const { used } = await chain(page);
  expect(used.indexOf(mine)).toBe(used.length - 2); // след моята — думата на бота

  // Невалидна дума (не е в речника) → −1 живот, грешката се вижда, ходът остава у мен.
  await typeWord(page, "ъъъгх");
  await expect(page.locator("[data-words-error]")).toContainText("ъъъгх");
  expect(await myLives(page)).toBe(2);
  await expect(probe(page)).toHaveAttribute("data-my-turn", "true");
  await expect(page.locator('[data-action="word"]')).toBeFocused();

  // Пак валидна дума — ходът минава.
  await playValid(page);
  expect(await waitMyTurn(page)).toBe(true);

  // Пас → −1 живот, нова верига, ходът минава към бота.
  const before = (await chain(page)).used.length;
  const v = await stateVersion(page);
  await page.locator('[data-action="pass"]').click();
  await expectServerAdvanced(page, v);
  expect(await myLives(page)).toBe(1);
  await expect.poll(async () => (await chain(page)).used.length).toBeGreaterThan(before);
  expect(await waitMyTurn(page)).toBe(true);

  // Изтекъл часовник = пас: последният живот отива и мачът свършва.
  await expect(page.locator('[data-action="word"]')).toBeVisible();
  await expectPlayAgain(page, 60_000);
  expect(await myLives(page)).toBe(0);
  expect(await verdict(page)).toMatch(/Загуба/);

  await playAgain(page);
  expect(await waitMyTurn(page)).toBe(true);
  await playValid(page);
  expectNoErrors(t);
  await t.ctx.close();
});

test("думи: грешна начална буква и вече казана дума струват по живот, после валидна дума", async ({
  browser,
  baseURL,
}) => {
  const t = await openGame(browser, baseURL!, "WORDS");
  const { page } = t;
  expect(await waitMyTurn(page)).toBe(true);

  // Дума от речника, но с друга буква.
  const { used, letter } = await chain(page);
  const other = availableWords({ used, lastLetter: "", lives: [3, 3], turn: 0, seats: 2, winner: null, done: false }).find(
    (w) => w[0] !== letter,
  )!;
  await typeWord(page, other);
  await expect(page.locator("[data-words-error]")).toContainText(`с ${letter.toUpperCase()} `);
  expect(await myLives(page)).toBe(2);

  // Вече казаната (първата) дума от веригата.
  await typeWord(page, used[0]!);
  await expect(page.locator("[data-words-error]")).toContainText(used[0]!);
  expect(await myLives(page)).toBe(1);

  await playValid(page);
  expect(await isOver(page)).toBe(false);
  expectNoErrors(t);
  await t.ctx.close();
});

test("първо посещение: страницата не се презарежда сама и правилата остават отворени", async ({ browser, baseURL }) => {
  // Регресия: claim() на service worker-а при първо посещение презареждаше
  // страницата — правилата изчезваха (вече „видени“), мачът губеше сокета.
  const storageState = await newPlayer(baseURL!);
  const ctx = await browser.newContext({ storageState, baseURL });
  const page = await ctx.newPage();
  let loads = 0;
  page.on("load", () => loads++);
  await page.goto("play/words");
  const rules = page.getByRole("dialog");
  await expect(rules).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 })
    .toBe(true);
  await page.waitForTimeout(1_500);
  expect(loads).toBe(1);
  const navType = await page.evaluate(
    () => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).type,
  );
  expect(navType).toBe("navigate");
  await expect(rules).toBeVisible();
  await ctx.close();
});

test("думи на телефон: полето, „Играй“ и „Пас“ са изцяло на сукното", async ({ browser, baseURL }) => {
  const t = await openGame(browser, baseURL!, "WORDS");
  const { page } = t;
  await page.setViewportSize(PHONE);
  expect(await waitMyTurn(page)).toBe(true);
  for (const action of ["word", "play", "pass"]) await expectFullyVisible(page.locator(`[data-action="${action}"]`));
  await playValid(page);
  expectNoErrors(t);
  await t.ctx.close();
});
