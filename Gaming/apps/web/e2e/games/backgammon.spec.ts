import { test, expect, type Page } from "@playwright/test";
import { backgammonEngine, SeededRng, type BackgammonAction, type BackgammonState } from "@aso/game-core";
import { expectNoErrors, expectServerAdvanced, openGame, stateVersion, waitMyTurn } from "./helpers";
import { centerLuma, expectBanner, recordBanners, snapBoth, note } from "./helpers-board";
import { expectDecisionOnScreen, expectMinimizeRestore } from "./decision-checks";

/**
 * Табла (Портес) срещу бот — 2D дъската, само с истински кликове:
 * „Хвърли“ → точка с пул (data-movable) → точка-цел (data-target), „Бар“ за
 * влизане от бара, „Извади“ за изнасяне, „Пас“ без ход — той идва сам в
 * прозореца „Няма възможен ход“ (единственото решение в таблата; обикновеният
 * ход е без прозорец).
 *
 * Покрива: хвърляне, местене с двата зара в един ход, влизане от бара и
 * изнасяне (ако се стигне), край на игра в мача → нова игра (резултатът в
 * мача се обновява, пръв хвърля победителят). Мачът е до 5 — играе се до
 * началото на втората игра.
 *
 * Тестът избира хода с двигателя от @aso/game-core (безопасно бягане — без
 * оставени самотни пулове, за да свърши играта бързо); ходовете са кликове.
 *
 * Seed `e2e-backgammon-111` (infra/e2e-games.sh): в началото на първата игра
 * мой пул е на бара, а с 6-6 не може да влезе → прозорецът „Няма възможен ход“
 * идва детерминистично (иначе пасът е въпрос на късмет и често не се пада).
 */

type Move = Extract<BackgammonAction, { type: "MOVE" }>;
const rng = new SeededRng("e2e-backgammon");

interface Board {
  points: number[];
  bar: [number, number];
  off: [number, number];
  dice: number[];
  game: number;
  score: string;
}

async function readBoard(page: Page): Promise<Board> {
  return page.evaluate(() => {
    const points = new Array<number>(24).fill(0);
    document.querySelectorAll<HTMLElement>("[data-point]").forEach((el) => {
      const n = Number(el.dataset.count ?? "0");
      points[Number(el.dataset.point)] = el.dataset.color === "w" ? n : el.dataset.color === "b" ? -n : 0;
    });
    const bar = (side: string) => Number(document.querySelector<HTMLElement>(`[data-bar="${side}"]`)?.dataset.count ?? "0");
    const root = document.querySelector<HTMLElement>("[data-bg-game]");
    const off = (root?.dataset.bgOff ?? "0:0").split(":").map(Number) as [number, number];
    const dice = (document.querySelector<HTMLElement>("[data-dice]")?.dataset.dice ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    return {
      points,
      bar: [bar("mine"), bar("opp")] as [number, number],
      off,
      dice,
      game: Number(root?.dataset.bgGame ?? "0"),
      score: root?.dataset.bgScore ?? "",
    };
  });
}

/** Аз съм белите (място 0): пуловете ми са положителни. */
function stateFrom(b: Board): BackgammonState {
  return {
    points: b.points,
    bar: b.bar,
    off: b.off,
    turn: 0,
    phase: "MOVE",
    dice: b.dice,
    remaining: b.dice,
    match: { target: 5, score: [0, 0], game: b.game },
    lastGame: null,
    winner: null,
  };
}

const pips = (s: BackgammonState) => s.points.reduce((a, v, i) => a + (v > 0 ? v * (i + 1) : 0), 0) + s.bar[0] * 25;
/** Мои самотни пулове, които черните могат да ударят директно. */
function exposed(s: BackgammonState): number {
  let n = 0;
  for (let i = 0; i < 24; i++) {
    if (s.points[i] !== 1) continue;
    let shots = 0;
    for (let j = Math.max(0, i - 6); j < i; j++) if (s.points[j]! < 0) shots -= s.points[j]!;
    if (s.bar[1] > 0 && i <= 5) shots += s.bar[1];
    if (shots > 0) n += 1 + Math.min(shots, 3) * 0.3;
  }
  return n;
}
const value = (s: BackgammonState) => -pips(s) - 12 * exposed(s) + 20 * s.off[0];

/** Безопасно бягане: най-добрият ход с поглед още един зар напред. */
function pick(s: BackgammonState): Move {
  const moves = backgammonEngine.legalActions(s, 0).filter((a): a is Move => a.type === "MOVE");
  let best = moves[0]!;
  let bestV = -Infinity;
  for (const m of moves) {
    const r = backgammonEngine.reduce(s, m, rng).state;
    let v = value(r);
    if (r.turn === 0 && r.phase === "MOVE" && r.winner === null && r.match.game === s.match.game) {
      let next = -Infinity;
      for (const m2 of backgammonEngine.legalActions(r, 0)) {
        if (m2.type === "MOVE") next = Math.max(next, value(backgammonEngine.reduce(r, m2, rng).state));
      }
      if (next > -Infinity) v = next;
    }
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

const destOf = (m: Move): number | "OFF" => {
  if (m.from === "BAR") return 24 - m.die;
  const d = m.from - m.die;
  return d < 0 ? "OFF" : d;
};

const point = (page: Page, i: number) => page.locator(`[data-point="${i}"]`);
const action = (page: Page, a: string) => page.locator(`button[data-action="${a}"]`);

async function movableFroms(page: Page): Promise<(number | "BAR")[]> {
  const pts = await page
    .locator('[data-point][data-movable="true"]')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.point)));
  const bar = (await action(page, "bar").count()) > 0 ? (["BAR"] as const) : [];
  return [...bar, ...pts.sort((a, b) => a - b)];
}

interface Seen {
  rolls: number;
  moves: number;
  bothDice: number;
  bar: number;
  bearOff: number;
  passes: number;
  turns: number;
}

/** Един мой ход: хвърляне (ако се иска) и всички зарове — само кликове. */
async function playTurn(page: Page, seen: Seen): Promise<void> {
  seen.turns++;
  if (await action(page, "roll").isVisible()) {
    // Снимка с бутона „Хвърли“ в реда под дъската (най-тесният момент на телефон).
    if (seen.rolls === 0) await snapBoth(page, "backgammon-2d-roll");
    const before = await stateVersion(page);
    await action(page, "roll").click();
    await expectServerAdvanced(page, before);
    seen.rolls++;
    if (!(await waitMyTurn(page, 15_000))) return;
  }
  let movesThisTurn = 0;
  const gameAtStart = (await readBoard(page)).game;
  for (let guard = 0; guard < 6; guard++) {
    if (await action(page, "pass").isVisible()) {
      // Без ход: прозорецът е дошъл сам, със заровете в подсказката.
      const card = await expectDecisionOnScreen(page, "backgammon-pass");
      await expect(card).toContainText("Няма възможен ход");
      if (seen.passes === 0) {
        await expectMinimizeRestore(page, "backgammon-pass");
        await snapBoth(page, "backgammon-pass");
      }
      const before = await stateVersion(page);
      await card.locator('[data-action="pass"]').click();
      await expectServerAdvanced(page, before);
      await expect(page.getByTestId("backgammon-pass")).toHaveCount(0);
      seen.passes++;
      break;
    }
    // Има ход → няма прозорец (обикновеният ход е по дъската).
    await expect(page.locator("[data-decision]")).toHaveCount(0);
    const b = await readBoard(page);
    if (b.game !== gameAtStart) break; // играта свърши с последния ми ход
    const s = stateFrom(b);
    expect(b.dice.length, "няма зарове за местене").toBeGreaterThan(0);
    const legal = backgammonEngine.legalActions(s, 0).filter((a): a is Move => a.type === "MOVE");
    const froms = [...new Set(legal.map((m) => m.from))].sort((x, y) =>
      x === "BAR" ? -1 : y === "BAR" ? 1 : (x as number) - (y as number),
    );
    // Дъската предлага точно законните начални точки (бара — с бутона „Бар“).
    await expect.poll(() => movableFroms(page)).toEqual(froms);
    const m = pick(s);
    const to = destOf(m);
    if (m.from === "BAR") {
      await action(page, "bar").click();
      await expect(action(page, "bar")).toHaveAttribute("data-selected", "true");
    } else {
      await point(page, m.from).click();
      await expect(point(page, m.from)).toHaveAttribute("data-selected", "true");
    }
    const before = await stateVersion(page);
    if (to === "OFF") {
      await expect(action(page, "bear-off")).toHaveAttribute("data-target", "true");
      await action(page, "bear-off").click();
      seen.bearOff++;
    } else {
      await expect(point(page, to)).toHaveAttribute("data-target", "true");
      await point(page, to).click();
    }
    await expectServerAdvanced(page, before);
    if (m.from === "BAR") seen.bar++;
    seen.moves++;
    movesThisTurn++;
    // Още зарове → пак мой ред; иначе редът минава на бота.
    if (!(await waitMyTurn(page, 3_000).catch(() => false))) break;
    if (await action(page, "roll").isVisible()) break; // нов ход (ботът вече игра)
  }
  if (movesThisTurn >= 2) seen.bothDice++;
}

test("табла: хвърляне, двата зара, бар/изнасяне, нова игра в мача — само с кликове", async ({ browser, baseURL }) => {
  test.setTimeout(14 * 60_000);
  const t = await openGame(browser, baseURL!, "BACKGAMMON");
  const { page } = t;
  await recordBanners(page);
  await expect(page.locator("[data-point]")).toHaveCount(24);
  const start = await readBoard(page);
  expect(start.game).toBe(1);
  expect(start.points.reduce((a, v) => a + Math.abs(v), 0)).toBe(30);
  // Пуловете на двете страни се виждат (бели светли, черни тъмни).
  expect(await centerLuma(page.locator(".bg-checker--w").first()), "белите пулове не се виждат").toBeGreaterThan(150);
  expect(await centerLuma(page.locator(".bg-checker--b").first()), "черните пулове не се виждат").toBeLessThan(90);
  await snapBoth(page, "backgammon-2d");

  const seen: Seen = { rolls: 0, moves: 0, bothDice: 0, bar: 0, bearOff: 0, passes: 0, turns: 0 };
  let game = 1;
  while (game === 1) {
    expect(await waitMyTurn(page, 90_000), "мачът свърши преди втората игра").toBe(true);
    await playTurn(page, seen);
    game = (await readBoard(page)).game;
    if (seen.turns % 10 === 0) note(`табла: ${JSON.stringify(seen)}`);
  }
  // Нова игра в мача: дъската е пак в начална позиция, резултатът — обновен.
  const g2 = await readBoard(page);
  expect(g2.game).toBe(2);
  // Новата игра почва от началната позиция: всички 30 пула на дъската (или на
  // бара след първия удар), никой изнесен.
  expect(g2.off).toEqual([0, 0]);
  expect(g2.points.reduce((acc, v) => acc + Math.abs(v), 0) + g2.bar[0] + g2.bar[1]).toBe(30);
  expect(g2.score === "1:0" || g2.score === "2:0" || g2.score === "0:1" || g2.score === "0:2", g2.score).toBe(true);
  // Банерите за края на игра 1 (точка/марс за победителя) и за новата игра.
  const marsOrWin = g2.score.endsWith(":0")
    ? g2.score === "2:0" ? "Марс! +2 точки" : "Спечели играта! +1 точка"
    : g2.score === "0:2" ? "Марс — съперникът взе 2 точки" : "Съперникът спечели играта (+1)";
  await expectBanner(page, marsOrWin);
  await expectBanner(page, "Игра 2 — пръв хвърля победителят");
  note(`табла: игра 1 свърши ${g2.score} — ${JSON.stringify(seen)}`);
  // Поне още един мой ход във втората игра; ако досега не съм изнасял —
  // докато изнеса (или свърши и втората игра).
  const turns2 = seen.turns;
  while (seen.turns === turns2 || (seen.bearOff === 0 && game === 2 && seen.turns - turns2 < 80)) {
    if (!(await waitMyTurn(page, 90_000))) break;
    await playTurn(page, seen);
    game = (await readBoard(page)).game;
  }
  note(`табла: край на теста — ${JSON.stringify(seen)}`);
  // Със seed-а на стека пасът (единственото решение в таблата) винаги се стига.
  expect(seen.passes, "„Няма възможен ход“ не се появи (стекът е без seed за BACKGAMMON?)").toBeGreaterThan(0);

  expect(seen.rolls, "не се хвърли зар").toBeGreaterThan(5);
  expect(seen.bothDice, "не се игра с двата зара").toBeGreaterThan(3);
  expect(seen.turns).toBeGreaterThanOrEqual(10);
  test.info().annotations.push({ type: "backgammon", description: JSON.stringify(seen) });
  expectNoErrors(t);
  await t.ctx.close();
});
