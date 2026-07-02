import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { bingoEngine, type BingoState } from "./bingo.js";
import { battleshipEngine, type BattleshipState } from "./battleship.js";
import { wordsEngine, availableWords, type WordsState } from "./words.js";
import { WORDS_BG } from "./wordlist-bg.js";

const rng = () => new SeededRng("grid-guess-test");

// ── Wordlist ─────────────────────────────────────────────────────────────────

describe("wordlist-bg", () => {
  it("has at least 600 lowercase Cyrillic words with no duplicates", () => {
    expect(WORDS_BG.length).toBeGreaterThanOrEqual(600);
    for (const w of WORDS_BG) expect(w).toMatch(/^[а-я]+$/);
    expect(new Set(WORDS_BG).size).toBe(WORDS_BG.length);
  });

  it("every ending letter has at least one starter (chain viability)", () => {
    const starters = new Set(WORDS_BG.map((w) => w[0]!));
    for (const w of WORDS_BG) {
      expect(starters.has(w[w.length - 1]!)).toBe(true);
    }
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
  it("redact strips the future drawOrder but keeps cards and drawn balls", () => {
    let s = bingoEngine.init({ seats: 4 }, rng());
    for (let i = 0; i < 5; i++) s = bingoEngine.reduce(s, { type: "DRAW" }, rng()).state;
    for (let seat = 0; seat < 4; seat++) {
      const view = bingoEngine.redact(s, seat);
      expect(view.drawOrder).toEqual([]);
      expect(view.drawn).toEqual(s.drawn);
      expect(view.cards).toEqual(s.cards);
    }
    // authoritative state untouched
    expect(s.drawOrder).toHaveLength(75);
  });

  it("draws reveal the pre-seeded order as a prefix, only seat 0 may draw", () => {
    let s = bingoEngine.init({ seats: 2 }, rng());
    expect(bingoEngine.legalActions(s, 1)).toEqual([]);
    expect(bingoEngine.legalActions(s, 0)).toEqual([{ type: "DRAW" }]);
    const order = s.drawOrder.slice();
    for (let i = 0; i < 3; i++) s = bingoEngine.reduce(s, { type: "DRAW" }, rng()).state;
    expect(s.drawn).toEqual(order.slice(0, 3));
  });

  it("simultaneous bingos on the same ball all win", () => {
    const mkCard = (row: number[]): number[] => {
      const card = Array.from({ length: 25 }, (_, i) => 30 + i);
      for (let c = 0; c < 5; c++) card[c] = row[c]!;
      card[12] = -1;
      return card;
    };
    const state: BingoState = {
      cards: [mkCard([1, 2, 3, 4, 5]), mkCard([1, 2, 3, 4, 5]), mkCard([70, 71, 72, 73, 74])],
      drawOrder: [1, 2, 3, 4, 5, 6, 7],
      drawn: [1, 2, 3, 4],
      pos: 4,
      seats: 3,
      winners: [],
      winner: null,
      done: false,
    };
    const { state: end, events } = bingoEngine.reduce(state, { type: "DRAW" }, rng());
    expect(end.done).toBe(true);
    expect(end.winners).toEqual([0, 1]);
    expect(events).toContainEqual({ type: "WIN", seat: 0 });
    expect(events).toContainEqual({ type: "WIN", seat: 1 });
    const score = bingoEngine.score(end);
    expect(score.map((x) => x.result)).toEqual(["win", "win", "loss"]);
  });
});

// ── Морски бой (Battleship) ──────────────────────────────────────────────────

const SIZE = 10;
const rcOf = (i: number): [number, number] => [Math.floor(i / SIZE), i % SIZE];

describe("battleship engine", () => {
  const init = (seed = "bs-test") => battleshipEngine.init({ seats: 2 }, new SeededRng(seed));

  it("places the BG fleet (1×4, 2×3, 3×2, 4×1) as straight, non-touching ships", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const s = battleshipEngine.init({ seats: 2 }, new SeededRng(seed));
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
