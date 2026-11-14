import { test, expect, type Page } from "@playwright/test";
import { ludoEngine, SeededRng, type LudoState } from "@aso/game-core";
import { expectNoErrors, expectServerAdvanced, openGame, probe, stateVersion, waitMyTurn } from "./helpers";
import { snapBoth, note } from "./helpers-board";

/**
 * Не се сърди човече — аз + 3 бота (места 0–3), 2D дъската, само с истински
 * кликове: „Хвърли“ → пул, който свети (data-movable) → „Пас“, когато няма ход.
 *
 * Покрива: хвърляне (и трите опита за шестица, докато всички са в базата),
 * излизане от базата с 6 (и допълнителното хвърляне след 6), местене напред.
 * Играта е дълга — играе се до поне 10 мои хода и поне едно излизане.
 */

const rng = new SeededRng("e2e-ludo");

interface Pawn {
  seat: number;
  token: number;
  progress: number;
  movable: boolean;
}

async function readPawns(page: Page): Promise<Pawn[]> {
  return page.locator(".ludo-pawn[data-seat]").evaluateAll((els) =>
    els.map((el) => {
      const d = (el as HTMLElement).dataset;
      return { seat: Number(d.seat), token: Number(d.token), progress: Number(d.progress), movable: d.movable === "true" };
    }),
  );
}

async function readDie(page: Page): Promise<number | null> {
  const die = page.locator(".ludo-controls [data-die]");
  if ((await die.count()) === 0) return null;
  return Number(await die.first().getAttribute("data-die"));
}

const pawn = (page: Page, seat: number, token: number) => page.locator(`.ludo-pawn[data-seat="${seat}"][data-token="${token}"]`);
const action = (page: Page, a: string) => page.locator(`button[data-action="${a}"]`);

/** Състоянието за двигателя от видимата дъска (за проверка и избор на пул). */
function stateFrom(pawns: Pawn[], die: number): LudoState {
  const seats = Math.max(...pawns.map((p) => p.seat)) + 1;
  const progress = Array.from({ length: seats }, () => [-1, -1, -1, -1]);
  for (const p of pawns) progress[p.seat]![p.token] = p.progress;
  return { progress, turn: 0, seats, die, rolledSix: die === 6, attempts: 1, finished: [], winner: null, done: false };
}

interface Seen {
  rolls: number;
  sixes: number;
  exits: number;
  moves: number;
  passes: number;
  extraRollAfterSix: number;
}

async function playTurn(page: Page, seen: Seen): Promise<void> {
  for (let guard = 0; guard < 12; guard++) {
    if (!(await waitMyTurn(page, 5_000).catch(() => false))) return; // редът мина нататък
    if (await action(page, "roll").isVisible()) {
      const before = await stateVersion(page);
      await action(page, "roll").click();
      await expectServerAdvanced(page, before);
      seen.rolls++;
      // Падналото число се вижда (заровете остават и при ход без възможност).
      await expect(page.locator(".ludo-controls [data-die]")).toBeVisible();
      const die = await readDie(page);
      if (die === 6) seen.sixes++;
      continue;
    }
    if (await action(page, "pass").isVisible()) {
      const before = await stateVersion(page);
      await action(page, "pass").click();
      await expectServerAdvanced(page, before);
      seen.passes++;
      return;
    }
    const pawns = await readPawns(page);
    const die = await readDie(page);
    expect(die, "няма хвърлен зар, а се иска ход").not.toBeNull();
    const s = stateFrom(pawns, die!);
    const legal = ludoEngine
      .legalActions(s, 0)
      .flatMap((a) => (a.type === "MOVE" ? [a.token] : []))
      .sort();
    // Светят точно пуловете, които правилата позволяват.
    await expect
      .poll(async () => (await readPawns(page)).filter((p) => p.movable).map((p) => p.token).sort())
      .toEqual(legal);
    expect(legal.length, "няма позволен пул, а няма и „Пас“/„Хвърли“").toBeGreaterThan(0);
    // Изборът: излизане с 6 (ако може), иначе изборът на бота от двигателя.
    const fromBase = legal.find((tk) => pawns.find((p) => p.seat === 0 && p.token === tk)!.progress === -1);
    const bot = ludoEngine.bot!(s, 0, rng);
    const token = fromBase ?? (bot && bot.type === "MOVE" ? bot.token : legal[0]!);
    const was = pawns.find((p) => p.seat === 0 && p.token === token)!.progress;
    const before = await stateVersion(page);
    await pawn(page, 0, token).click();
    await expectServerAdvanced(page, before);
    seen.moves++;
    if (was === -1) {
      seen.exits++;
      // Излезлият пул е на старта (стъпка 0) — освен ако някой го е изял веднага.
      await expect
        .poll(async () => (await readPawns(page)).find((p) => p.seat === 0 && p.token === token)!.progress)
        .not.toBe(-1);
    }
    if (die === 6) {
      // След 6 се хвърля пак: пак мой ред с „Хвърли“.
      expect(await waitMyTurn(page, 10_000)).toBe(true);
      await expect(action(page, "roll")).toBeVisible();
      seen.extraRollAfterSix++;
      continue;
    }
    return;
  }
}

test("не се сърди човече: хвърляне, излизане с 6, местене — само с кликове", async ({ browser, baseURL }) => {
  test.setTimeout(10 * 60_000);
  const t = await openGame(browser, baseURL!, "LUDO");
  const { page } = t;
  // Четирима на масата, всички пулове в базите.
  await expect(page.locator(".ludo-pawn[data-seat]")).toHaveCount(16);
  expect((await readPawns(page)).every((p) => p.progress === -1)).toBe(true);
  await expect(probe(page)).toHaveAttribute("data-seat", "0");
  await snapBoth(page, "ludo-2d");

  const seen: Seen = { rolls: 0, sixes: 0, exits: 0, moves: 0, passes: 0, extraRollAfterSix: 0 };
  for (let turn = 0; turn < 80 && (seen.moves < 10 || seen.exits < 1); turn++) {
    if (!(await waitMyTurn(page, 60_000))) break;
    await playTurn(page, seen);
    if (turn % 10 === 9) note(`човече: ${JSON.stringify(seen)}`);
  }
  note(`човече: ${JSON.stringify(seen)}`);
  expect(seen.exits, "не излезе нито един пул с 6").toBeGreaterThan(0);
  expect(seen.moves, "твърде малко изиграни ходове").toBeGreaterThanOrEqual(10);
  expect(seen.extraRollAfterSix).toBeGreaterThan(0);
  test.info().annotations.push({ type: "ludo", description: JSON.stringify(seen) });
  expectNoErrors(t);
  await t.ctx.close();
});
