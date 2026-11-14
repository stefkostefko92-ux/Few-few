import { test, expect, type Browser, type Page } from "@playwright/test";
import { expectNoErrors, expectServerAdvanced, isOver, newPlayer, openGame, probe, stateVersion, type Table } from "./helpers";
import { expectFullyVisible, expectPlayAgain, playAgain, snapBoth, verdict, PHONE } from "./helpers-grid";

/**
 * Бинго — сървърът тегли число на 4 s; играчът САМ маркира изтеглените числа
 * от картата си (клик) или включва „Автомаркиране“ и вика „Бинго!“ при пълна
 * линия. Невярно „Бинго!“ = пропуск на 3 тегления. В Бинго никой няма „ход“
 * (legalActions е празно), затова тестът следи data-version и самата карта.
 */

test.describe.configure({ mode: "parallel" });

const LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines;
})();

interface Cell {
  i: number;
  n: number;
  marked: boolean;
  markable: boolean;
  voided: boolean;
}

/** Моята карта, както я вижда играчът (маркировките са потвърдени от сървъра). */
async function card(page: Page): Promise<Cell[]> {
  return page.locator("[data-bingo-cell]").evaluateAll((els) =>
    els.map((el) => ({
      i: Number(el.getAttribute("data-bingo-cell")),
      n: Number(el.getAttribute("data-number")),
      marked: el.getAttribute("data-marked") === "true",
      markable: el.getAttribute("data-markable") === "true",
      voided: el.getAttribute("data-void") === "true",
    })),
  );
}
const hasLine = (cells: Cell[]): boolean => {
  const marked = new Set(cells.filter((c) => c.marked).map((c) => c.i));
  return LINES.some((line) => line.every((i) => marked.has(i)));
};
const drawn = async (page: Page): Promise<number> =>
  Number(await page.locator("[data-drawn]").getAttribute("data-drawn"));
const lastBall = async (page: Page): Promise<number> =>
  Number(await page.locator("[data-drawn]").getAttribute("data-last"));
const bingoBtn = (page: Page) => page.locator('[data-action="bingo"]');

/** Маркира с клик всяко изтеглено, още неотбелязано число от картата. */
async function markAll(page: Page): Promise<number> {
  let clicked = 0;
  for (const c of await card(page)) {
    if (!c.markable) continue;
    const btn = page.locator(`[data-bingo-cell="${c.i}"]`);
    if ((await btn.getAttribute("data-markable")) !== "true") continue; // междувременно се промени
    const v = await stateVersion(page);
    await btn.click();
    await expectServerAdvanced(page, v);
    await expect(btn).toHaveAttribute("data-marked", "true");
    clicked++;
  }
  return clicked;
}

/** Вика „Бинго!“ (истински клик) и чака сървъра. */
async function callBingo(page: Page): Promise<void> {
  await expect(bingoBtn(page)).toBeEnabled();
  const v = await stateVersion(page);
  await bingoBtn(page).click();
  await expectServerAdvanced(page, v);
}

test("бинго срещу ботове: ръчно маркиране, автомаркиране и „Бинго!“ при линия — до края и „Играй пак“", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(480_000);
  const t = await openGame(browser, baseURL!, "BINGO");
  const { page } = t;
  await expect(page.locator("[data-bingo-cell]")).toHaveCount(25);
  await snapBoth(page, info, "bingo");

  // Ръчно маркиране: първото изтеглено число от картата ми — с клик.
  const first = page.locator('[data-bingo-cell][data-markable="true"]').first();
  await expect(first).toBeVisible({ timeout: 120_000 });
  const firstIdx = await first.getAttribute("data-bingo-cell");
  let v = await stateVersion(page);
  await first.click();
  await expectServerAdvanced(page, v);
  await expect(page.locator(`[data-bingo-cell="${firstIdx}"]`)).toHaveAttribute("data-marked", "true");

  // „Автомаркиране“: включва се с клик; следващото число от картата се маркира само.
  const auto = page.locator('[data-action="auto"]');
  v = await stateVersion(page);
  await auto.click();
  await expectServerAdvanced(page, v);
  await expect(auto).toBeChecked();
  const markedBefore = (await card(page)).filter((c) => c.marked).length;
  await expect
    .poll(async () => (await isOver(page)) || (await card(page)).filter((c) => c.marked).length > markedBefore, {
      timeout: 150_000,
      intervals: [250],
    })
    .toBe(true);

  // До края: довършва с клик числата, изтеглени преди автомаркирането, и вика
  // „Бинго!“ щом има пълна линия (освен ако бот не е бил по-бърз).
  let called = false;
  while (!(await isOver(page))) {
    await markAll(page).catch(async (e) => {
      if (!(await isOver(page))) throw e; // мачът свърши насред маркирането
    });
    if (!called && !(await isOver(page)) && hasLine(await card(page))) {
      await callBingo(page);
      called = true;
    }
    await page.waitForTimeout(250);
  }
  await expectPlayAgain(page, 30_000);
  expect(await verdict(page)).toMatch(called ? /Победа/ : /Загуба|Равенство/);
  await snapBoth(page, info, "bingo-over");

  await playAgain(page);
  await expect(page.locator("[data-bingo-cell]")).toHaveCount(25);
  await expect(page.locator('[data-action="auto"]')).not.toBeChecked();
  expectNoErrors(t);
  await t.ctx.close();
});

test("бинго: невярно „Бинго!“ → пропуск на 3 тегления (без маркиране и викане), после отново може", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const t = await openGame(browser, baseURL!, "BINGO");
  const { page } = t;

  // След първото теглене линия е невъзможна — викането е невярно.
  await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(await drawn(page)).toBeLessThanOrEqual(3);
  expect(hasLine(await card(page))).toBe(false);
  await callBingo(page);

  const penalty = page.locator("[data-penalty]");
  await expect(penalty).toHaveAttribute("data-penalty", "3");
  await expect(bingoBtn(page)).toBeDisabled();
  await expect(page.locator('[data-bingo-cell][data-markable="true"]')).toHaveCount(0);

  // Отброява по едно на всяко теглене; числата от наказанието не важат за мен.
  const voidedBalls: number[] = [];
  for (const left of ["2", "1"]) {
    await expect(penalty).toHaveAttribute("data-penalty", left, { timeout: 12_000 });
    voidedBalls.push(await lastBall(page));
    await expect(bingoBtn(page)).toBeDisabled();
    await expect(page.locator('[data-bingo-cell][data-markable="true"]')).toHaveCount(0);
  }
  await expect(penalty).toHaveCount(0, { timeout: 12_000 });
  voidedBalls.push(await lastBall(page));
  await expect(bingoBtn(page)).toBeEnabled();

  for (const c of await card(page)) {
    if (!voidedBalls.includes(c.n)) continue;
    expect(c.voided, `${c.n} е изтеглено по време на наказанието`).toBe(true);
    expect(c.markable).toBe(false);
    await expect(page.locator(`[data-bingo-cell="${c.i}"]`)).toBeDisabled();
  }
  // Изтеглено СЛЕД наказанието число от картата отново се маркира с клик.
  const after = page.locator('[data-bingo-cell][data-markable="true"]').first();
  await expect(after).toBeVisible({ timeout: 120_000 });
  const n = Number(await after.getAttribute("data-number"));
  expect(voidedBalls).not.toContain(n);
  const v = await stateVersion(page);
  await after.click();
  await expectServerAdvanced(page, v);
  await expect(page.locator(`[data-number="${n}"]`)).toHaveAttribute("data-marked", "true");
  expectNoErrors(t);
  await t.ctx.close();
});

/** Затваря автоматично отворените правила с видимия им бутон. */
async function closeRules(page: Page): Promise<void> {
  const rules = page.getByRole("dialog");
  await expect(rules).toBeVisible();
  await rules.getByRole("button", { name: /Разбрах/ }).click();
  await expect(rules).toBeHidden();
}

async function seated(browser: Browser, baseURL: string): Promise<Table> {
  const ctx = await browser.newContext({ storageState: await newPlayer(baseURL), baseURL });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|WebGL|GL Driver/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return { page, ctx, errors };
}

test("бинго: вярно „Бинго!“ при пълна линия носи победа (стая за двама, другият играч не маркира)", async ({
  browser,
  baseURL,
}) => {
  // Срещу ботове победата зависи от картите (ботът е безгрешен с едно теглене
  // закъснение) — тук съперникът е човек, който не маркира, така че вярното
  // „Бинго!“ се упражнява всеки път.
  test.setTimeout(480_000);
  const host = await seated(browser, baseURL!);
  const guest = await seated(browser, baseURL!);
  const hostName = (await (await host.page.request.get("/api/auth/me")).json()).user.displayName as string;

  await host.page.goto("rooms");
  await host.page.getByRole("combobox").first().selectOption("BINGO");
  await host.page.getByRole("button", { name: "Създай" }).click();
  await expect(host.page.getByRole("heading", { name: /стая/ })).toBeVisible();

  await guest.page.goto("rooms");
  const entry = guest.page.getByRole("listitem").filter({ hasText: hostName });
  await entry.getByRole("button", { name: "Влез" }).click();
  await expect(guest.page.getByRole("heading", { name: /стая/ })).toBeVisible();

  const start = host.page.getByRole("button", { name: "Започни играта" });
  await expect(start).toBeEnabled();
  await start.click();
  for (const p of [host.page, guest.page]) {
    await expect(p).toHaveURL(/\/play\/bingo/);
    await closeRules(p);
    await expect(probe(p)).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
  }

  // Домакинът маркира всяко свое число с клик и вика „Бинго!“ при пълна линия.
  const page = host.page;
  await page.setViewportSize(PHONE); // и на телефон картата и „Бинго!“ са изцяло видими
  await expectFullyVisible(bingoBtn(page));
  await expectFullyVisible(page.locator('[data-bingo-cell="4"]'));
  // …а изтегленото число и „Бинго!“ се виждат едновременно, без скрол (тегли се на 4 s).
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bingoBtn(page)).toBeInViewport({ ratio: 1 });
  await expect(page.locator("[data-drawn]")).toBeInViewport({ ratio: 1 });
  for (;;) {
    expect(await isOver(page), "мачът свърши без моето „Бинго!“").toBe(false);
    await markAll(page);
    if (hasLine(await card(page))) break;
    await page.waitForTimeout(250);
  }
  await callBingo(page);
  await expect(page.locator("[data-closing]")).toBeVisible();
  await expect(probe(page)).toHaveAttribute("data-phase", "over", { timeout: 15_000 });
  expect(await verdict(page)).toMatch(/Победа/);
  await expect(probe(guest.page)).toHaveAttribute("data-phase", "over", { timeout: 15_000 });
  expect(await verdict(guest.page)).toMatch(/Загуба/);
  expectNoErrors(host);
  expectNoErrors(guest);
  await host.ctx.close();
  await guest.ctx.close();
});
