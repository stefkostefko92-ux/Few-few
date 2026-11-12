import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import {
  BINGO_CLOSE_MS,
  BINGO_DRAW_MS,
  BINGO_PENALTY_DRAWS,
  bingoEngine,
  type BingoState,
} from "./bingo.js";
import {
  BATTLESHIP_PLACE_SECONDS,
  battleshipEngine,
  battleshipFleetError,
  placeFleet,
  type BattleshipState,
} from "./battleship.js";
import { wordsEngine, availableWords, chainLetter, type WordsState } from "./words.js";
import { WORDS_BG } from "./wordlist-bg.js";

const rng = () => new SeededRng("grid-guess-test");

// ── Wordlist ─────────────────────────────────────────────────────────────────

describe("wordlist-bg", () => {
  it("has several thousand lowercase Cyrillic words with no duplicates", () => {
    expect(WORDS_BG.length).toBeGreaterThanOrEqual(4000);
    for (const w of WORDS_BG) expect(w).toMatch(/^[а-я]+$/);
    expect(new Set(WORDS_BG).size).toBe(WORDS_BG.length);
  });

  it("every chain letter has starters (chain viability, incl. the „й/ь/ъ“ rule)", () => {
    const starters = new Map<string, number>();
    for (const w of WORDS_BG) starters.set(w[0]!, (starters.get(w[0]!) ?? 0) + 1);
    for (const w of WORDS_BG) {
      const c = chainLetter(w);
      expect(["й", "ь", "ъ"]).not.toContain(c);
      expect(starters.get(c) ?? 0, `след „${w}“ (${c})`).toBeGreaterThanOrEqual(10);
    }
  });

  it("the frequent ending letters have deep starter pools", () => {
    const count = (c: string) => WORDS_BG.filter((w) => w[0] === c).length;
    for (const c of ["а", "о", "е", "и", "т", "р", "н", "к", "л", "д"]) {
      expect(count(c), c).toBeGreaterThanOrEqual(130);
    }
    expect(count("я")).toBeGreaterThanOrEqual(40);
  });

  it("no obvious non-nouns: no plural/definite/adjective endings from the reject review", () => {
    for (const w of ["брег", "деца", "уши", "мерки", "горски", "зад", "след", "пред", "сред", "дупе", "задник"]) {
      expect(WORDS_BG).not.toContain(w);
    }
    // Членувани форми („-ът/-ят/-то/-ите“ на дълги думи) не се допускат.
    const definite = WORDS_BG.filter((w) => w.length > 6 && /(ът|ят|ото|ите)$/.test(w));
    expect(definite).toEqual([]);
  });
});

describe("chainLetter", () => {
  it("skips a trailing „й/ь/ъ“ to the letter before it", () => {
    expect(chainLetter("чай")).toBe("а");
    expect(chainLetter("брой")).toBe("о");
    expect(chainLetter("герой")).toBe("о");
    expect(chainLetter("котка")).toBe("а");
    expect(chainLetter("ъгъл")).toBe("л");
  });
});

// ── Думи (Words) ─────────────────────────────────────────────────────────────

describe("words engine", () => {
  const init = (seats = 2) => wordsEngine.init({ seats }, rng());

  it("starts with 3 lives, a seeded chain and a turn-seconds config passthrough", () => {
    const s = wordsEngine.init({ seats: 2, config: { turnSeconds: 15 } }, rng());
    expect(s.lives).toEqual([3, 3]);
    expect(s.used).toHaveLength(1);
    expect(s.lastLetter).toBe(s.used[0]![s.used[0]!.length - 1]);
    expect(s.config).toEqual({ turnSeconds: 15 });
    expect(init().config).toBeUndefined();
  });

  it("never serves the answers: legalActions exposes only PASS", () => {
    const s = init();
    expect(wordsEngine.legalActions(s, 0)).toEqual([{ type: "PASS" }]);
    expect(wordsEngine.legalActions(s, 1)).toEqual([]);
  });

  it("validate accepts any non-empty typed word on your turn, rejects otherwise", () => {
    const s = init();
    expect(wordsEngine.validate!(s, 0, { type: "PLAY", word: "каквото" })).toBe(true);
    expect(wordsEngine.validate!(s, 0, { type: "PASS" })).toBe(true);
    expect(wordsEngine.validate!(s, 0, { type: "PLAY", word: "  " })).toBe(false);
    expect(wordsEngine.validate!(s, 1, { type: "PLAY", word: "каквото" })).toBe(false);
  });

  it("a valid word extends the chain and passes the turn", () => {
    const s = init();
    const word = availableWords(s)[0]!;
    const { state, events } = wordsEngine.reduce(s, { type: "PLAY", word }, rng());
    expect(state.used).toEqual([...s.used, word]);
    expect(state.lastLetter).toBe(word[word.length - 1]);
    expect(state.turn).toBe(1);
    expect(events).toContainEqual({ type: "PLAY", seat: 0, word });
  });

  it("a wrong word costs a life with a reason, and the player keeps the turn", () => {
    const s = init();
    // not in the dictionary
    let r = wordsEngine.reduce(s, { type: "PLAY", word: "жжжж" }, rng());
    expect(r.events).toContainEqual({ type: "WRONG", seat: 0, word: "жжжж", reason: "dict", livesLeft: 2 });
    expect(r.state.lives).toEqual([2, 3]);
    expect(r.state.turn).toBe(0); // retry while alive
    expect(r.state.used).toEqual(s.used); // chain untouched
    // already used (the seed word) — checked before the letter rule
    r = wordsEngine.reduce(s, { type: "PLAY", word: s.used[0]! }, rng());
    expect(r.events[0]).toMatchObject({ type: "WRONG", reason: "used" });
    // wrong first letter
    const wrongStart = WORDS_BG.find((w) => w[0] !== s.lastLetter && w !== s.used[0])!;
    r = wordsEngine.reduce(s, { type: "PLAY", word: wrongStart }, rng());
    expect(r.events[0]).toMatchObject({ type: "WRONG", reason: "letter" });
  });

  it("PASS costs a life and reseeds the chain with a fresh word", () => {
    const s = init(3);
    const { state, events } = wordsEngine.reduce(s, { type: "PASS" }, rng());
    expect(events[0]).toEqual({ type: "PASS", seat: 0, livesLeft: 2 });
    const reseed = events.find((e) => e.type === "RESEED");
    expect(reseed).toBeDefined();
    if (reseed?.type !== "RESEED") throw new Error("unreachable");
    expect(state.used).toEqual([...s.used, reseed.word]);
    expect(state.used[0]).not.toBe(reseed.word);
    expect(state.lastLetter).toBe(reseed.word[reseed.word.length - 1]);
    expect(state.lives).toEqual([2, 3, 3]);
    expect(state.turn).toBe(1);
  });

  it("draining all lives on wrong words ends the game", () => {
    let s = init();
    for (let i = 0; i < 3; i++) {
      expect(s.done).toBe(false);
      expect(s.turn).toBe(0);
      s = wordsEngine.reduce(s, { type: "PLAY", word: "ьь" }, rng()).state;
    }
    expect(s.done).toBe(true);
    expect(s.winner).toBe(1);
    expect(wordsEngine.score(s).find((x) => x.seat === 1)?.result).toBe("win");
  });

  it("bot plays a random valid word and passes only when stuck", () => {
    const s = init();
    const pick = wordsEngine.bot!(s, 0, rng());
    expect(pick?.type).toBe("PLAY");
    if (pick?.type !== "PLAY") throw new Error("unreachable");
    expect(availableWords(s)).toContain(pick.word);
    // A dead-end state: every word for the current letter is already used.
    const deadEnd: WordsState = {
      ...s,
      used: [...new Set([...s.used, ...WORDS_BG.filter((w) => w[0] === s.lastLetter)])],
    };
    expect(availableWords(deadEnd)).toEqual([]);
    expect(wordsEngine.bot!(deadEnd, 0, rng())).toEqual({ type: "PASS" });
    expect(wordsEngine.bot!(s, 1, rng())).toBeNull(); // not their turn
  });
});

// ── Бинго (Bingo) ────────────────────────────────────────────────────────────

describe("bingo engine", () => {
  const drawN = (s: BingoState, n: number): BingoState => {
    for (let i = 0; i < n; i++) s = bingoEngine.reduce(s, { type: "DRAW" }, rng()).state;
    return s;
  };
  const mkCard = (row: number[]): number[] => {
    const card = Array.from({ length: 25 }, (_, i) => 30 + i);
    for (let c = 0; c < 5; c++) card[c] = row[c]!;
    card[12] = -1;
    return card;
  };
  const fixed = (cards: number[][], drawOrder: number[]): BingoState => ({
    ...bingoEngine.init({ seats: cards.length }, rng()),
    cards,
    drawOrder,
  });

  it("redact strips the future drawOrder but keeps cards, marks and drawn balls", () => {
    const s = drawN(bingoEngine.init({ seats: 4 }, rng()), 5);
    for (let seat = 0; seat < 4; seat++) {
      const view = bingoEngine.redact(s, seat);
      expect(view.drawOrder).toEqual([]);
      expect(view.drawn).toEqual(s.drawn);
      expect(view.cards).toEqual(s.cards);
      expect(view.marks).toEqual(s.marks);
    }
    expect(s.drawOrder).toHaveLength(75);
  });

  it("the server draws on a timer — no seat has a turn and clients can't DRAW", () => {
    let s = bingoEngine.init({ seats: 2 }, rng());
    expect(bingoEngine.legalActions(s, 0)).toEqual([]);
    expect(bingoEngine.legalActions(s, 1)).toEqual([]);
    expect(bingoEngine.serverAction!(s)).toEqual({ action: { type: "DRAW" }, delayMs: BINGO_DRAW_MS });
    expect(bingoEngine.validate!(s, 0, { type: "DRAW" })).toBe(false);
    expect(bingoEngine.validate!(s, 0, { type: "CLOSE" })).toBe(false);
    const order = s.drawOrder.slice();
    s = drawN(s, 3);
    expect(s.drawn).toEqual(order.slice(0, 3));
    expect(s.marks).toEqual([[], []]); // no automatic marking
  });

  it("MARK: only a drawn number on your own card; never for another seat", () => {
    let s = fixed([mkCard([1, 2, 3, 4, 5]), mkCard([6, 7, 8, 9, 10])], [1, 6, 2]);
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 0 })).toBe(false); // not drawn yet
    s = drawN(s, 1); // 1
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 0 })).toBe(true);
    expect(bingoEngine.validate!(s, 1, { type: "MARK", seat: 0, cell: 0 })).toBe(false); // spoofed seat
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 12 })).toBe(false); // free cell
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 99 })).toBe(false);
    expect(() => bingoEngine.reduce(s, { type: "MARK", seat: 1, cell: 0 }, rng())).toThrow();
    s = bingoEngine.reduce(s, { type: "MARK", seat: 0, cell: 0 }, rng()).state;
    expect(s.marks[0]).toEqual([0]);
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 0 })).toBe(false); // already
  });

  it("a valid „Бинго!“ needs a line of the player's OWN marks and stops the draw", () => {
    let s = fixed([mkCard([1, 2, 3, 4, 5]), mkCard([1, 2, 3, 4, 5]), mkCard([70, 71, 72, 73, 74])], [1, 2, 3, 4, 5, 6]);
    s = drawN(s, 5);
    for (let c = 0; c < 5; c++) {
      s = bingoEngine.reduce(s, { type: "MARK", seat: 0, cell: c }, rng()).state;
      s = bingoEngine.reduce(s, { type: "MARK", seat: 1, cell: c }, rng()).state;
    }
    const r = bingoEngine.reduce(s, { type: "BINGO", seat: 0 }, rng());
    expect(r.events).toContainEqual({ type: "BINGO_CALL", seat: 0, valid: true });
    expect(r.state.closing).toBe(true);
    expect(r.state.done).toBe(false);
    expect(bingoEngine.serverAction!(r.state)).toEqual({ action: { type: "CLOSE" }, delayMs: BINGO_CLOSE_MS });
    expect(() => bingoEngine.reduce(r.state, { type: "DRAW" }, rng())).toThrow();
    // seat 1 calls inside the closing window → shares the win
    s = bingoEngine.reduce(r.state, { type: "BINGO", seat: 1 }, rng()).state;
    s = bingoEngine.reduce(s, { type: "CLOSE" }, rng()).state;
    expect(s.done).toBe(true);
    expect(s.winners).toEqual([0, 1]);
    expect(bingoEngine.score(s).map((x) => x.result)).toEqual(["win", "win", "loss"]);
  });

  it("a false „Бинго!“ blocks the next 3 draws and voids the numbers drawn meanwhile", () => {
    let s = fixed([mkCard([1, 2, 3, 4, 5]), mkCard([6, 7, 8, 9, 10])], [1, 2, 3, 4, 5, 6, 7]);
    s = drawN(s, 1);
    const r = bingoEngine.reduce(s, { type: "BINGO", seat: 0 }, rng());
    expect(r.events).toContainEqual({ type: "BINGO_CALL", seat: 0, valid: false });
    expect(r.events).toContainEqual({ type: "PENALTY", seat: 0, until: 1 + BINGO_PENALTY_DRAWS });
    s = r.state;
    expect(s.falseCalls[0]).toBe(1);
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 0 })).toBe(false); // blocked
    expect(bingoEngine.validate!(s, 0, { type: "BINGO", seat: 0 })).toBe(false);
    s = drawN(s, 3); // 2, 3, 4 fall during the penalty
    expect(s.voided[0]).toEqual([2, 3, 4]);
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 0 })).toBe(true); // 1 was before
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 1 })).toBe(false); // 2 is void
    s = drawN(s, 1); // 5
    expect(bingoEngine.validate!(s, 0, { type: "MARK", seat: 0, cell: 4 })).toBe(true);
  });

  it("AUTO marks drawn numbers for that seat only; calling stays manual", () => {
    let s = fixed([mkCard([1, 2, 3, 4, 5]), mkCard([1, 7, 8, 9, 10])], [1, 2, 3, 4, 5]);
    expect(bingoEngine.validate!(s, 0, { type: "AUTO", seat: 0, on: true })).toBe(true);
    s = bingoEngine.reduce(s, { type: "AUTO", seat: 0, on: true }, rng()).state;
    s = drawN(s, 5);
    expect(s.marks[0]).toEqual([0, 1, 2, 3, 4]);
    expect(s.marks[1]).toEqual([]);
    expect(s.done).toBe(false);
    expect(s.closing).toBe(false);
  });

  it("bot marks then calls; an exhausted drum with no call is a draw", () => {
    let s = fixed([mkCard([1, 2, 3, 4, 5]), mkCard([6, 7, 8, 9, 10])], [1, 2, 3, 4, 5]);
    s = drawN(s, 5);
    for (let i = 0; i < 10; i++) {
      const a = bingoEngine.bot!(s, 0, rng());
      if (!a) break;
      expect(bingoEngine.validate!(s, 0, a)).toBe(true);
      s = bingoEngine.reduce(s, a, rng()).state;
    }
    expect(s.winners).toEqual([0]);
    // a seat with nothing to do returns null
    expect(bingoEngine.bot!(s, 1, rng())).toBeNull();
    let e = fixed([mkCard([1, 2, 3, 4, 5]), mkCard([6, 7, 8, 9, 10])], [60, 61]);
    e = drawN(e, 2);
    expect(bingoEngine.serverAction!(e)?.action).toEqual({ type: "CLOSE" });
    e = bingoEngine.reduce(e, { type: "CLOSE" }, rng()).state;
    expect(e.done).toBe(true);
    expect(bingoEngine.score(e).every((x) => x.result === "draw")).toBe(true);
  });
});

// ── Морски бой (Battleship) ──────────────────────────────────────────────────

const SIZE = 10;
const rcOf = (i: number): [number, number] => [Math.floor(i / SIZE), i % SIZE];

describe("battleship engine", () => {
  /** Both seats let the server place randomly → the firing phase. */
  const placed = (seed: string): BattleshipState => {
    const r = new SeededRng(seed);
    let s = battleshipEngine.init({ seats: 2 }, r);
    s = battleshipEngine.reduce(s, { type: "PLACE_RANDOM", seat: 0 }, r).state;
    return battleshipEngine.reduce(s, { type: "PLACE_RANDOM", seat: 1 }, r).state;
  };
  const init = (seed = "bs-test") => placed(seed);

  it("starts in the placement phase: both seats may place, the clock is extended", () => {
    const s = battleshipEngine.init({ seats: 2 }, new SeededRng("p"));
    expect(s.phase).toBe("PLACE");
    expect(s.config).toEqual({ turnSeconds: BATTLESHIP_PLACE_SECONDS });
    expect(battleshipEngine.legalActions(s, 0)).toEqual([{ type: "PLACE_RANDOM", seat: 0 }]);
    expect(battleshipEngine.legalActions(s, 1)).toEqual([{ type: "PLACE_RANDOM", seat: 1 }]);
    expect(battleshipEngine.validate!(s, 1, { type: "FIRE", cell: 0 })).toBe(false);
    expect(battleshipEngine.bot!(s, 1, new SeededRng("b"))).toEqual({ type: "PLACE_RANDOM", seat: 1 });
  });

  it("validates a manual fleet: bounds, straight lines, exact fleet, no overlap, no touching", () => {
    const good = placeFleet(new SeededRng("good"));
    expect(battleshipFleetError(good)).toBeNull();
    expect(battleshipFleetError("x")).toBe("fleet");
    expect(battleshipFleetError(good.slice(1))).toBe("fleet");
    const bent = good.map((sh) => sh.slice());
    const four = bent.findIndex((sh) => sh.length === 4);
    bent[four] = [0, 1, 2, 12]; // L-shape
    expect(battleshipFleetError(bent)).not.toBeNull();
    const out = good.map((sh) => sh.slice());
    out[out.findIndex((sh) => sh.length === 1)] = [100];
    expect(battleshipFleetError(out)).toBe("bounds");
    const wrongMix = good.map((sh) => sh.slice());
    wrongMix[wrongMix.findIndex((sh) => sh.length === 1)] = [0, 1]; // five 2s
    expect(battleshipFleetError(wrongMix)).toBe("fleet");
    // Hand-made legal fleet, then a version where two ships touch diagonally.
    const manual = [[0, 1, 2, 3], [20, 21, 22], [24, 25, 26], [40, 41], [43, 44], [46, 47], [60], [62], [64], [66]];
    expect(battleshipFleetError(manual)).toBeNull();
    const touching = manual.map((sh) => sh.slice());
    touching[6] = [53]; // diagonal to 44
    expect(battleshipFleetError(touching)).toBe("touch");
    const overlap = manual.map((sh) => sh.slice());
    overlap[6] = [0];
    expect(battleshipFleetError(overlap)).toBe("overlap");
  });

  it("PLACE stores the validated fleet; the game starts once both are ready", () => {
    const r = new SeededRng("pl");
    const manual = [[0, 1, 2, 3], [20, 21, 22], [24, 25, 26], [40, 41], [43, 44], [46, 47], [60], [62], [64], [66]];
    let s = battleshipEngine.init({ seats: 2 }, r);
    expect(battleshipEngine.validate!(s, 0, { type: "PLACE", seat: 0, ships: manual })).toBe(true);
    expect(battleshipEngine.validate!(s, 1, { type: "PLACE", seat: 0, ships: manual })).toBe(false); // spoofed
    expect(battleshipEngine.validate!(s, 0, { type: "PLACE", seat: 0, ships: [[0]] })).toBe(false);
    const a = battleshipEngine.reduce(s, { type: "PLACE", seat: 0, ships: manual }, r);
    s = a.state;
    expect(a.events).toEqual([{ type: "READY", seat: 0 }]);
    expect(s.phase).toBe("PLACE");
    expect(s.ships[0]).toEqual(manual);
    expect(battleshipEngine.legalActions(s, 0)).toEqual([]);
    expect(battleshipEngine.validate!(s, 0, { type: "PLACE_RANDOM", seat: 0 })).toBe(false); // already ready
    // the opponent sees nothing of the placed fleet
    expect(battleshipEngine.redact(s, 1).ships[0]).toEqual([]);
    const b = battleshipEngine.reduce(s, { type: "PLACE_RANDOM", seat: 1 }, r);
    expect(b.events.map((e) => e.type)).toEqual(["READY", "START"]);
    expect(b.state.phase).toBe("FIRE");
    expect(b.state.config).toBeUndefined();
    expect(battleshipFleetError(b.state.ships[1])).toBeNull();
    expect(battleshipEngine.legalActions(b.state, 0).length).toBe(100);
  });

  it("places the BG fleet (1×4, 2×3, 3×2, 4×1) as straight, non-touching ships", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const s = placed(seed);
      for (const fleet of s.ships) {
        expect(fleet.map((ship) => ship.length).sort((x, y) => x - y)).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 4]);
        const all = fleet.flat();
        expect(new Set(all).size).toBe(all.length); // no overlap
        for (const ship of fleet) {
          // straight line: same row consecutive cols, or same col consecutive rows
          const rows = ship.map((c) => rcOf(c)[0]);
          const cols = ship.map((c) => rcOf(c)[1]);
          const horiz = rows.every((r) => r === rows[0]);
          const vert = cols.every((c) => c === cols[0]);
          expect(horiz || vert).toBe(true);
          const line = (horiz ? cols : rows).sort((x, y) => x - y);
          for (let i = 1; i < line.length; i++) expect(line[i]! - line[i - 1]!).toBe(1);
        }
        // no-touch rule: ships never adjacent, not even diagonally
        for (let i = 0; i < fleet.length; i++) {
          for (let j = i + 1; j < fleet.length; j++) {
            for (const a of fleet[i]!) {
              for (const b of fleet[j]!) {
                const [ra, ca] = rcOf(a);
                const [rb, cb] = rcOf(b);
                expect(Math.max(Math.abs(ra - rb), Math.abs(ca - cb))).toBeGreaterThanOrEqual(2);
              }
            }
          }
        }
      }
    }
  });

  it("a hit grants another shot; a miss passes the turn (БГ rule)", () => {
    const s = init();
    const shipCell = s.ships[1]![0]![0]!;
    const hit = battleshipEngine.reduce(s, { type: "FIRE", cell: shipCell }, rng());
    expect(hit.events[0]).toEqual({ type: "FIRE", seat: 0, cell: shipCell, hit: true });
    expect(hit.state.turn).toBe(0);
    const oppCells = new Set(s.ships[1]!.flat());
    const missCell = Array.from({ length: 100 }, (_, i) => i).find((c) => !oppCells.has(c))!;
    const miss = battleshipEngine.reduce(s, { type: "FIRE", cell: missCell }, rng());
    expect(miss.events[0]).toEqual({ type: "FIRE", seat: 0, cell: missCell, hit: false });
    expect(miss.state.turn).toBe(1);
  });

  it("emits SUNK with the ship's cells when its last cell is hit", () => {
    const s = init();
    const two = s.ships[1]!.find((ship) => ship.length === 2)!;
    let r = battleshipEngine.reduce(s, { type: "FIRE", cell: two[0]! }, rng());
    expect(r.events.some((e) => e.type === "SUNK")).toBe(false);
    r = battleshipEngine.reduce(r.state, { type: "FIRE", cell: two[1]! }, rng());
    const sunk = r.events.find((e) => e.type === "SUNK");
    expect(sunk).toBeDefined();
    if (sunk?.type !== "SUNK") throw new Error("unreachable");
    expect(sunk.seat).toBe(0);
    expect([...sunk.cells].sort((a, b) => a - b)).toEqual([...two].sort((a, b) => a - b));
    expect(r.state.done).toBe(false);
  });

  it("sinking the whole fleet in one streak wins (hits never yield the turn)", () => {
    let s = init();
    const cells = s.ships[1]!.flat();
    const events: string[] = [];
    for (const cell of cells) {
      expect(s.turn).toBe(0); // every shot hits, so the streak never breaks
      const r = battleshipEngine.reduce(s, { type: "FIRE", cell }, rng());
      s = r.state;
      events.push(...r.events.map((e) => e.type));
    }
    expect(s.done).toBe(true);
    expect(s.winner).toBe(0);
    expect(events.filter((t) => t === "SUNK")).toHaveLength(10);
    expect(events).toContain("SUNK_ALL");
    expect(events).toContain("WIN");
  });

  it("redact reveals own fleet and only the opponent's sunk ships", () => {
    const s = init();
    const one = s.ships[1]!.find((ship) => ship.length === 1)!;
    const r = battleshipEngine.reduce(s, { type: "FIRE", cell: one[0]! }, rng());
    const mine = battleshipEngine.redact(r.state, 0);
    expect(mine.ships[0]).toEqual(r.state.ships[0]); // own fleet intact
    expect(mine.ships[1]).toEqual([one]); // only the sunk ship
    const theirs = battleshipEngine.redact(r.state, 1);
    expect(theirs.ships[1]).toEqual(r.state.ships[1]);
    expect(theirs.ships[0]).toEqual([]); // seat 1 has no hits yet
  });

  it("bot hunts a wounded ship via its orthogonal neighbours", () => {
    const s = init();
    const long = s.ships[1]!.find((ship) => ship.length === 4)!;
    const woundedAt = long[1]!; // inner cell so the rest of the ship stays afloat
    const r = battleshipEngine.reduce(s, { type: "FIRE", cell: woundedAt }, rng());
    const pick = battleshipEngine.bot!(r.state, 0, new SeededRng("bot"));
    expect(pick?.type).toBe("FIRE");
    if (pick?.type !== "FIRE") throw new Error("unreachable");
    const [hr, hc] = rcOf(woundedAt);
    const [pr, pc] = rcOf(pick.cell);
    expect(Math.abs(hr - pr) + Math.abs(hc - pc)).toBe(1);
  });

  it("bot never wastes shots hugging a sunk ship", () => {
    let s = init();
    // sink one 1-cell ship, then let the bot hunt
    const one = s.ships[1]!.find((ship) => ship.length === 1)!;
    s = battleshipEngine.reduce(s, { type: "FIRE", cell: one[0]! }, rng()).state;
    const [sr, sc] = rcOf(one[0]!);
    const botRng = new SeededRng("halo");
    for (let i = 0; i < 25; i++) {
      const pick = battleshipEngine.bot!(s, 0, botRng);
      if (pick?.type !== "FIRE") break;
      const [pr, pc] = rcOf(pick.cell);
      expect(Math.max(Math.abs(pr - sr), Math.abs(pc - sc))).toBeGreaterThanOrEqual(2);
      const r = battleshipEngine.reduce(s, { type: "FIRE", cell: pick.cell }, rng());
      s = r.state;
      if (s.done) break;
      if (s.turn !== 0) break; // miss — enough sampling for the assertion
    }
  });

  it("state shape survives BattleshipState typing", () => {
    const s: BattleshipState = init();
    expect(Array.isArray(s.ships[0]![0])).toBe(true);
  });
});

describe("words — „й“ правилото и таймаутът", () => {
  const r = () => new SeededRng("words-extra");
  it("дума на „й“ подава предходната буква (чай → „а“)", () => {
    const s: WordsState = { ...wordsEngine.init({ seats: 2 }, r()), used: ["чадър"], lastLetter: "ч" };
    const { state, events } = wordsEngine.reduce(s, { type: "PLAY", word: "чай" }, r());
    expect(events).toContainEqual({ type: "PLAY", seat: 0, word: "чай" });
    expect(state.lastLetter).toBe("а");
    expect(availableWords(state).every((w) => w[0] === "а")).toBe(true);
  });

  it("timeoutAction = PASS (губи се живот), само за играча на ход", () => {
    const s = wordsEngine.init({ seats: 2 }, r());
    expect(wordsEngine.timeoutAction!(s, 0)).toEqual({ type: "PASS" });
    expect(wordsEngine.timeoutAction!(s, 1)).toBeNull();
    const { state } = wordsEngine.reduce(s, wordsEngine.timeoutAction!(s, 0)!, r());
    expect(state.lives[0]).toBe(2);
    expect(state.turn).toBe(1);
  });
});
