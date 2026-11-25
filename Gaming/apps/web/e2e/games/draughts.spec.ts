import { test, expect, type Page } from "@playwright/test";
import { draughtsEngine, SeededRng, type DraughtsAction, type DraughtsState } from "@aso/game-core";
import {
  expectGameOverCard,
  expectNoErrors,
  expectServerAdvanced,
  openGame,
  probe,
  stateVersion,
  waitMyTurn,
} from "./helpers";
import { bannerCount, centerLuma, expectBanner, recordBanners, snapBoth, note } from "./helpers-board";

/**
 * Руска дама срещу бот — 2D дъската (WebGL е изключен в games-2d), само с
 * истински кликове: избираш пул (data-movable), после поле (data-target).
 *
 * Покрива всяко действие на човека:
 *  - обикновен ход;
 *  - задължително вземане: дъската предлага САМО вземащите пулове, а клик по
 *    друг свой пул дава „Задължително взимане!“ и нищо не праща;
 *  - многократно вземане: след първия скок редът остава мой, пулът е избран
 *    сам и се довършва поредицата („Продължи взимането!“);
 *  - промоция в дама, ако пул стигне последния ред.
 * Играе се до края (картата „Край на играта“ → „Играй пак“ → нов мач).
 *
 * Кой ход да изиграе, тестът решава с двигателя от @aso/game-core (търси
 * „удар“ — жертва, след която вземам поне два пула), за да се стигне
 * надеждно до многократно вземане; самите ходове са само кликове.
 */

type Piece = "w" | "W" | "b" | "B" | null;
const rng = new SeededRng("e2e-draughts");

function stateFrom(board: Piece[]): DraughtsState {
  return { board, turn: 0, chainFrom: null, winner: null, done: false, noCaptureMoves: 0, pending: [], positions: [] };
}

interface Turn {
  seq: DraughtsAction[];
  state: DraughtsState;
  caps: number;
  king: boolean;
}

/** Всички пълни ходове (с поредиците на вземане) на страната на ход. */
function fullTurns(s: DraughtsState, limit = 400): Turn[] {
  const out: Turn[] = [];
  const seat = s.turn;
  const rec = (st: DraughtsState, seq: DraughtsAction[], caps: number, king: boolean) => {
    if (out.length > limit) return;
    for (const a of draughtsEngine.legalActions(st, seat)) {
      const r = draughtsEngine.reduce(st, a, rng);
      const c = caps + (r.events.some((e) => e.type === "MOVE" && e.captured !== null) ? 1 : 0);
      const k = king || r.events.some((e) => e.type === "KING");
      if (!r.state.done && r.state.turn === seat && r.state.chainFrom !== null) rec(r.state, [...seq, a], c, k);
      else out.push({ seq: [...seq, a], state: r.state, caps: c, king: k });
    }
  };
  rec(s, [], 0, false);
  return out;
}

const maxChain = (s: DraughtsState): number => fullTurns(s).reduce((m, t) => Math.max(m, t.caps), 0);

/** Избор на ход: най-дългата поредица ≥2; иначе „удар“ (всеки отговор на бота
 *  ми оставя ≥2 вземания); иначе безопасна промоция; иначе алчният бот. */
function plan(board: Piece[]): DraughtsAction[] {
  const s = stateFrom(board);
  const mine = fullTurns(s);
  const best = mine.reduce((m, t) => Math.max(m, t.caps), 0);
  if (best >= 2) return mine.find((t) => t.caps === best)!.seq;
  let trap: { t: Turn; worst: number } | null = null;
  for (const t of mine) {
    if (t.state.done) continue;
    const replies = fullTurns(t.state);
    if (replies.length === 0) continue;
    let worst = Infinity;
    for (const r of replies) {
      const c = r.state.done ? 0 : maxChain(r.state);
      worst = Math.min(worst, c < 2 ? -Infinity : c - r.caps);
      if (worst === -Infinity) break;
    }
    if (worst > -Infinity && (!trap || worst > trap.worst)) trap = { t, worst };
  }
  if (trap) return trap.t.seq;
  const crown = mine.filter((t) => t.king && !t.state.done).sort((a, b) => maxChain(a.state) - maxChain(b.state))[0];
  if (crown && maxChain(crown.state) === 0) return crown.seq;
  const seq: DraughtsAction[] = [];
  let st = s;
  do {
    const a = draughtsEngine.bot!(st, 0, rng)!;
    seq.push(a);
    st = draughtsEngine.reduce(st, a, rng).state;
  } while (!st.done && st.turn === 0 && st.chainFrom !== null);
  return seq;
}

const cell = (page: Page, i: number) => page.locator(`[data-cell="${i}"]`);

async function readBoard(page: Page): Promise<Piece[]> {
  return page.locator("[data-cell]").evaluateAll((els) => {
    const b: (string | null)[] = new Array<string | null>(64).fill(null);
    for (const el of els) b[Number((el as HTMLElement).dataset.cell)] = (el as HTMLElement).dataset.piece ?? null;
    return b;
  }) as Promise<Piece[]>;
}

async function cellsWith(page: Page, attr: "movable" | "target" | "selected"): Promise<number[]> {
  return page
    .locator(`[data-cell][data-${attr}="true"]`)
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.cell)).sort((a, b) => a - b));
}

const isMine = (p: Piece) => p === "w" || p === "W";

interface Seen {
  moves: number;
  steps: number;
  forced: number;
  mustCaptureHint: boolean;
  multi: number;
  kings: number;
}

/** Един мой ход (с цялата поредица на вземане) — само кликове по дъската. */
async function playTurn(page: Page, seen: Seen): Promise<void> {
  const board = await readBoard(page);
  const legal = draughtsEngine.legalActions(stateFrom(board), 0);
  const froms = [...new Set(legal.map((a) => a.from))].sort((a, b) => a - b);
  // Дъската предлага точно законните пулове — нито повече, нито по-малко.
  await expect.poll(() => cellsWith(page, "movable")).toEqual(froms);

  const capture = legal.some((a) => {
    const r = draughtsEngine.reduce(stateFrom(board), a, rng);
    return r.events.some((e) => e.type === "MOVE" && e.captured !== null);
  });
  if (capture) {
    seen.forced++;
    // Задължително вземане: свой пул, който не може да вземе, не се избира.
    const idle = board.findIndex((p, i) => isMine(p) && !froms.includes(i));
    if (!seen.mustCaptureHint && idle >= 0) {
      const v = await stateVersion(page);
      const hints = await bannerCount(page, "Задължително взимане!");
      await cell(page, idle).click();
      await expectBanner(page, "Задължително взимане!", hints + 1);
      await expect(cell(page, idle)).not.toHaveAttribute("data-selected", "true");
      expect(await stateVersion(page), "клик по невземащ пул не бива да праща ход").toBe(v);
      seen.mustCaptureHint = true;
    }
  }

  const seq = plan(board);
  let piece = board[seq[0]!.from] ?? null;
  const chains = await bannerCount(page, "Продължи взимането!");
  for (let k = 0; k < seq.length; k++) {
    const { from, to } = seq[k]!;
    if (k > 0) {
      // Поредицата продължава: пак мой ред, пулът е избран сам.
      expect(await waitMyTurn(page, 15_000), "поредицата на вземане прекъсна").toBe(true);
      await expect(cell(page, from)).toHaveAttribute("data-selected", "true");
      await expect.poll(() => cellsWith(page, "movable")).toEqual([from]);
      if (k === 1) await expectBanner(page, "Продължи взимането!", chains + 1);
    }
    if ((await cell(page, from).getAttribute("data-selected")) !== "true") await cell(page, from).click();
    await expect(cell(page, from)).toHaveAttribute("data-selected", "true");
    await expect(cell(page, to)).toHaveAttribute("data-target", "true");
    const before = await stateVersion(page);
    const kings = await bannerCount(page, "Дама!");
    await cell(page, to).click();
    await expectServerAdvanced(page, before);
    seen.steps++;
    if (piece === "w" && to < 8) {
      // Промоция: пулът стигна последния ред и става дама веднага.
      await expectBanner(page, "Дама!", kings + 1);
      seen.kings++;
      piece = "W";
    }
  }
  seen.moves++;
  if (capture && seq.length >= 2) seen.multi++;
}

test("дама: ход, задължително и многократно вземане, промоция — само с кликове, до края", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(10 * 60_000);
  const t = await openGame(browser, baseURL!, "DRAUGHTS");
  const { page } = t;
  await recordBanners(page);
  // Аз съм белите (място 0), долу; дъската е 2D с 64 полета.
  await expect(page.locator("[data-cell]")).toHaveCount(64);
  // Двете страни се различават на око: белите пулове светли, черните тъмни
  // (регресия: „отблясъкът“ на сцената правеше всички пулове прозрачни).
  expect(await centerLuma(cell(page, 40)), "белите пулове не се виждат").toBeGreaterThan(150);
  expect(await centerLuma(cell(page, 1)), "черните пулове не се виждат").toBeLessThan(90);
  await snapBoth(page, "draughts-2d");

  const seen: Seen = { moves: 0, steps: 0, forced: 0, mustCaptureHint: false, multi: 0, kings: 0 };
  for (let game = 1; game <= 3; game++) {
    while (await waitMyTurn(page, 90_000)) await playTurn(page, seen);
    await expectGameOverCard(page);
    note(`дама: игра ${game} свърши — ${JSON.stringify(seen)}`);
    // „Играй пак“ („Нова игра“) → нов мач срещу бот: пак 12 срещу 12 на дъската.
    await page.locator(".cine-over__card").getByRole("button", { name: "Нова игра" }).click();
    await expect(page.locator(".cine-over")).toBeHidden();
    await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
    await expect
      .poll(async () => (await readBoard(page)).filter((p) => p !== null).length, { timeout: 15_000 })
      .toBe(24);
    if (seen.multi > 0 && seen.moves >= 10) break;
  }

  expect(seen.moves, "твърде малко изиграни ходове").toBeGreaterThanOrEqual(10);
  expect(seen.forced, "не се стигна до задължително вземане").toBeGreaterThan(0);
  expect(seen.mustCaptureHint, "не се провери подсказката за задължително вземане").toBe(true);
  expect(seen.multi, "не се стигна до многократно вземане").toBeGreaterThan(0);
  test.info().annotations.push({ type: "draughts", description: JSON.stringify(seen) });
  expectNoErrors(t);
  await t.ctx.close();
});
