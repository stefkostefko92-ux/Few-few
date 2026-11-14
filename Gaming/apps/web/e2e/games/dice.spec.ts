import { test, expect, type Page } from "@playwright/test";
import {
  expectGameOverCard,
  expectNoErrors,
  expectServerAdvanced,
  openGame,
  probe,
  stateVersion,
  waitMyTurn,
} from "./helpers";
import { snapBoth, note } from "./helpers-board";
import { expectDecisionOnScreen, expectMinimizeRestore, expectNotCovered } from "./decision-checks";

/**
 * Покер на зарове срещу бот — 2D заровете (WebGL е изключен), само с
 * истински кликове: „Хвърли“ → клик по зарове за задържане → „Хвърли пак“
 * (задържаните не се менят) → запис: след третото хвърляне изборът идва сам
 * в прозореца „Запиши резултата“ (стойностите са в него), а по-ранен запис е
 * с клик по свободна категория в таблицата.
 * Играе се цялата игра (13 категории) до картата „Край на играта“ и „Нова
 * игра“ (Играй пак), която почва нов мач.
 */

const roll = (page: Page) => page.locator('button[data-action="roll"]');
const die = (page: Page, i: number) => page.locator(`[data-die-index="${i}"]`);

async function diceValues(page: Page): Promise<number[]> {
  return page
    .locator("[data-die-index]")
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.value ?? "0")));
}

async function heldMask(page: Page): Promise<boolean[]> {
  return page.locator("[data-die-index]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.held === "true"));
}

/** Задържай най-честото лице (≥2), иначе нищо. */
function holdPlan(values: number[]): boolean[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let face = 0;
  let best = 1;
  for (const [f, n] of counts) if (n > best || (n === best && f > face && n > 1)) [face, best] = [f, n];
  return values.map((v) => best >= 2 && v === face);
}

interface Seen {
  turns: number;
  rerolls: number;
  holds: number;
  scored: number;
  /** Записи през прозореца (след последното хвърляне) / с клик в таблицата. */
  viaPrompt: number;
  viaTable: number;
}

async function playTurn(page: Page, seen: Seen): Promise<void> {
  seen.turns++;
  // 1) първо хвърляне
  await expect(roll(page)).toBeEnabled();
  let before = await stateVersion(page);
  await roll(page).click();
  await expectServerAdvanced(page, before);
  await expect.poll(async () => (await diceValues(page)).every((v) => v >= 1 && v <= 6)).toBe(true);

  // 2) до два пъти: задържане с клик + „Хвърли пак“
  for (let r = 0; r < 2; r++) {
    // Докато има презахвърляния, записът е по желание — без прозорец.
    await expect(page.getByTestId("dice-score")).toHaveCount(0);
    const values = await diceValues(page);
    const plan = holdPlan(values);
    if (plan.every((h) => h) || !plan.some((h) => h)) break;
    // Задържането остава между презахвърлянията — кликът го превключва, затова
    // се кликат само заровете, чието състояние се различава от плана.
    const held = await heldMask(page);
    for (let i = 0; i < 5; i++) {
      if (plan[i] === held[i]) continue;
      await die(page, i).click();
      if (plan[i]) await expect(die(page, i)).toHaveAttribute("data-held", "true");
      else await expect(die(page, i)).not.toHaveAttribute("data-held", "true");
      seen.holds++;
    }
    expect(await heldMask(page)).toEqual(plan);
    // Бутонът брои оставащите презахвърляния.
    await expect(roll(page)).toHaveText(`Презахвърли (${2 - r})`);
    before = await stateVersion(page);
    await roll(page).click();
    await expectServerAdvanced(page, before);
    seen.rerolls++;
    // Задържаните зарове остават същите.
    const after = await diceValues(page);
    for (let i = 0; i < 5; i++) if (plan[i]) expect(after[i], `задържаният зар ${i} се смени`).toBe(values[i]);
  }

  // 3) запис в най-изгодната свободна категория (стойността се вижда предварително)
  const noRerolls = (await roll(page).count()) === 0;
  if (noRerolls) {
    // Последното хвърляне → прозорецът идва сам; таблицата вече не се кликва.
    const card = await expectDecisionOnScreen(page, "dice-score");
    await expect(page.locator('[data-seat="0"][data-selectable="true"]')).toHaveCount(0);
    if (seen.viaPrompt === 0) {
      await expectMinimizeRestore(page, "dice-score");
      // На лаптоп заровете в тавата остават видими под прозореца.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectNotCovered(page, "dice-score", page.locator(".dice-tray"), "тавата със заровете");
      await snapBoth(page, "dice-score");
    }
    const options = await card.locator('[data-action="score"]').evaluateAll((els) =>
      els.map((el) => ({ cat: (el as HTMLElement).dataset.category!, pts: Number((el as HTMLElement).dataset.points ?? "0") })),
    );
    expect(options.length).toBeGreaterThan(0);
    const pick = options.reduce((a, b) => (b.pts > a.pts ? b : a));
    before = await stateVersion(page);
    await card.locator(`[data-action="score"][data-category="${pick.cat}"]`).click();
    await expectServerAdvanced(page, before);
    await expect(page.getByTestId("dice-score")).toHaveCount(0);
    await expect(page.locator(`[data-seat="0"][data-category="${pick.cat}"]`)).toHaveAttribute("data-filled", String(pick.pts));
    seen.viaPrompt++;
    seen.scored++;
    return;
  }
  const cells = page.locator('[data-seat="0"][data-selectable="true"]');
  await expect(cells.first()).toBeVisible();
  const options = await cells.evaluateAll((els) =>
    els.map((el) => ({ cat: (el as HTMLElement).dataset.category!, pts: Number(el.textContent?.trim() || "0") })),
  );
  const pick = options.reduce((a, b) => (b.pts > a.pts ? b : a));
  before = await stateVersion(page);
  await page.locator(`[data-seat="0"][data-category="${pick.cat}"]`).click();
  await expectServerAdvanced(page, before);
  seen.viaTable++;
  await expect(page.locator(`[data-seat="0"][data-category="${pick.cat}"]`)).toHaveAttribute(
    "data-filled",
    String(pick.pts),
  );
  seen.scored++;
}

test("зарове: хвърляне, задържане, запис — цялата игра с кликове, после „Нова игра“", async ({ browser, baseURL }) => {
  test.setTimeout(8 * 60_000);
  const t = await openGame(browser, baseURL!, "DICE");
  const { page } = t;
  await expect(page.locator("[data-die-index]")).toHaveCount(5);
  await expect(page.locator('[data-seat="0"][data-category]')).toHaveCount(13);
  await snapBoth(page, "dice-2d");

  const seen: Seen = { turns: 0, rerolls: 0, holds: 0, scored: 0, viaPrompt: 0, viaTable: 0 };
  while (await waitMyTurn(page, 60_000)) {
    await playTurn(page, seen);
    if (seen.turns === 6) await snapBoth(page, "dice-2d-mid");
  }
  note(`зарове: ${JSON.stringify(seen)}`);
  expect(seen.scored, "не се попълниха всички 13 категории").toBe(13);
  expect(seen.rerolls).toBeGreaterThan(0);
  expect(seen.viaPrompt, "прозорецът „Запиши резултата“ не се появи").toBeGreaterThan(0);
  // Сборът в таблицата = попълнените категории (+35 бонус при 63+ в горната част).
  const filled = await page
    .locator('[data-seat="0"][data-filled]')
    .evaluateAll((els) => els.map((el) => ({ cat: (el as HTMLElement).dataset.category!, v: Number((el as HTMLElement).dataset.filled) })));
  expect(filled).toHaveLength(13);
  const upper = filled.filter((f) => ["ones", "twos", "threes", "fours", "fives", "sixes"].includes(f.cat)).reduce((a, f) => a + f.v, 0);
  const sum = filled.reduce((a, f) => a + f.v, 0) + (upper >= 63 ? 35 : 0);
  const total = Number(await page.locator('[data-total-seat="0"]').innerText());
  expect(total === sum || total >= sum + 100, `сбор ${total}, очакван ${sum}`).toBe(true);

  await expectGameOverCard(page);
  await snapBoth(page, "dice-2d-over");
  await page.locator(".cine-over__card").getByRole("button", { name: "Нова игра" }).click();
  await expect(page.locator(".cine-over")).toBeHidden();
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
  await expect(page.locator('[data-seat="0"][data-filled]')).toHaveCount(0);
  expectNoErrors(t);
  await t.ctx.close();
});
