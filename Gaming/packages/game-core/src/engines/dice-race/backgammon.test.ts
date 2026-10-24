import { describe, expect, it } from "vitest";
import { IllegalActionError } from "../../kernel/contract.js";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { backgammonEngine, DEFAULT_BACKGAMMON_MATCH_TO, type BackgammonState } from "./backgammon.js";

const init = () => backgammonEngine.init({ seats: 2 }, new SeededRng("bg"));

describe("backgammon engine", () => {
  it("sets up 15 checkers per side", () => {
    const s = init();
    const white = s.points.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const black = -s.points.filter((v) => v < 0).reduce((a, v) => a + v, 0);
    expect(white).toBe(15);
    expect(black).toBe(15);
  });

  it("opens with an opening roll: two different dice, higher roller starts mid-MOVE", () => {
    for (const seed of ["bg", "bg-2", "bg-3", "bg-4", "bg-5"]) {
      const s = backgammonEngine.init({ seats: 2 }, new SeededRng(seed));
      expect(s.phase).toBe("MOVE");
      expect(s.openingRoll).toBeDefined();
      const [w, b] = s.openingRoll!;
      expect(w).not.toBe(b); // ties are re-rolled — the opening is never doubles
      expect(s.turn).toBe(w > b ? 0 : 1);
      expect(s.dice).toEqual([w, b]);
      expect(s.remaining).toEqual([w, b]);
      // The starter has MOVE actions; the opponent has none.
      const starter = backgammonEngine.legalActions(s, s.turn);
      expect(starter.length).toBeGreaterThan(0);
      expect(starter.every((a) => a.type === "MOVE" || a.type === "PASS")).toBe(true);
      expect(backgammonEngine.legalActions(s, s.turn === 0 ? 1 : 0)).toEqual([]);
    }
  });

  it("clears the opening roll and hands a ROLL turn to the opponent", () => {
    const rng = new SeededRng("bg-open");
    let s = backgammonEngine.init({ seats: 2 }, rng);
    const starter = s.turn;
    // Play out the opening dice.
    for (let i = 0; i < 8 && s.turn === starter; i++) {
      const actions = backgammonEngine.legalActions(s, starter);
      expect(actions.length).toBeGreaterThan(0);
      s = backgammonEngine.reduce(s, actions[0]!, rng).state;
    }
    expect(s.turn).toBe(starter === 0 ? 1 : 0);
    expect(s.phase).toBe("ROLL");
    expect(s.openingRoll).toBeUndefined();
    // Без зар за удвояване — в ROLL единственото действие е хвърлянето.
    expect(backgammonEngine.legalActions(s, s.turn)).toEqual([{ type: "ROLL" }]);
  });

  it("every advertised legal action is reducible without throwing", () => {
    const rng = new SeededRng("bg-validate");
    let s: BackgammonState = backgammonEngine.init({ seats: 2 }, rng);
    for (let i = 0; i < 300 && !backgammonEngine.isTerminal(s); i++) {
      const seat = s.turn;
      const actions = backgammonEngine.legalActions(s, seat);
      expect(actions.length).toBeGreaterThan(0);
      for (const a of actions) {
        expect(() => backgammonEngine.reduce(s, a, rng)).not.toThrow();
      }
      s = backgammonEngine.reduce(s, actions[0]!, rng).state;
    }
  });

  it("plays a full random match (to 5) to a winner", () => {
    const { state, terminal } = playRandom(backgammonEngine, {
      seed: "match-7",
      botSeed: "bots-7",
      maxSteps: 200_000,
    });
    expect(terminal).toBe(true);
    expect(state.winner).not.toBeNull();
    expect(state.match.score[state.winner!]).toBeGreaterThanOrEqual(5);
    expect(state.match.score[state.winner === 0 ? 1 : 0]).toBeLessThan(5);
    const score = backgammonEngine.score(state);
    expect(score.find((x) => x.result === "win")).toBeDefined();
    expect(score.find((x) => x.result === "loss")).toBeDefined();
  });

  it("is deterministic for identical seeds", () => {
    const a = playRandom(backgammonEngine, { seed: "m", botSeed: "b" });
    const b = playRandom(backgammonEngine, { seed: "m", botSeed: "b" });
    expect(a.state).toEqual(b.state);
    expect(a.steps).toBe(b.steps);
  });

  it("enforces the larger die when only one of two can be played", () => {
    // White must come in from the bar; black holds 5 of the 6 entry points so
    // only one die can ever be played. Construct: white on bar, dice [3,5].
    // Block white entry for die=3 (point 21 for white = 24-3) with 2+ black,
    // leave die=5 entry (point 19) open. Then the only legal move uses die 5.
    const s: BackgammonState = {
      points: new Array(24).fill(0),
      bar: [1, 0],
      off: [0, 0],
      turn: 0,
      phase: "MOVE",
      dice: [3, 5],
      remaining: [3, 5],
      match: { target: 5, score: [0, 0], game: 1 },
      lastGame: null,
      winner: null,
    };
    s.points[21] = -2; // block white's die-3 entry (24-3)
    // point 19 (24-5) left open for die-5 entry
    const actions = backgammonEngine.legalActions(s, 0);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === "MOVE" && a.die === 5)).toBe(true);
  });

  describe("max-dice lookahead вижда удара (регресия: simulate без placeAt)", () => {
    const moveState = (dice: [number, number]): BackgammonState => ({
      points: new Array(24).fill(0),
      bar: [0, 0],
      off: [13, 0],
      turn: 0,
      phase: "MOVE",
      dice,
      remaining: [...dice],
      match: { target: 5, score: [0, 0], game: 1 },
      lastGame: null,
      winner: null,
    });

    it("A: ударът 20→18 с 2-ката е единственият път към два зара", () => {
      // Бели (към 0): пул на 20 и на 10. Черни: самотен пул на 18, блокади на 15, 5, 3.
      // 20→18 удря, после 18→13 с 5-ицата; 10→8 оставя 5-ицата неизиграема.
      const s = moveState([5, 2]);
      s.points[20] = 1;
      s.points[10] = 1;
      s.points[18] = -1;
      s.points[15] = -2;
      s.points[5] = -2;
      s.points[3] = -2;
      const rng = new SeededRng("hit-a");
      expect(backgammonEngine.legalActions(s, 0)).toEqual([{ type: "MOVE", from: 20, die: 2 }]);
      expect(() => backgammonEngine.reduce(s, { type: "MOVE", from: 10, die: 2 }, rng)).toThrow(
        IllegalActionError,
      );
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 20, die: 2 }, rng);
      expect(r.state.bar[1]).toBe(1); // черният пул е ударен
      expect(r.state.points[18]).toBe(1);
      expect(backgammonEngine.legalActions(r.state, 0)).toEqual([{ type: "MOVE", from: 18, die: 5 }]);
      const r2 = backgammonEngine.reduce(r.state, { type: "MOVE", from: 18, die: 5 }, rng);
      expect(r2.state.points[13]).toBe(1);
      expect(r2.state.turn).toBe(1);
    });

    it("B: само един зар е изиграем → задължителна е по-голямата 6-ица", () => {
      // Бели: пул на 11 и на 0. Черни: самотен пул на 8, блокада на 2. Зарове [3,6].
      // 11→8 (удар) оставя 6-ицата блокирана; 11→5 оставя 3-ката неизиграема.
      const s = moveState([3, 6]);
      s.points[11] = 1;
      s.points[0] = 1;
      s.points[8] = -1;
      s.points[2] = -2;
      expect(backgammonEngine.legalActions(s, 0)).toEqual([{ type: "MOVE", from: 11, die: 6 }]);
      expect(() =>
        backgammonEngine.reduce(s, { type: "MOVE", from: 11, die: 3 }, new SeededRng("hit-b")),
      ).toThrow(IllegalActionError);
    });
  });

  describe("марс и мач до N точки", () => {
    const rng = new SeededRng("match");
    /** Бели на ход с последен пул на поле 0 (14 изнесени); черните — по избор. */
    const lastChecker = (over: Partial<BackgammonState> = {}): BackgammonState => {
      const s: BackgammonState = {
        points: new Array(24).fill(0),
        bar: [0, 0],
        off: [14, 0],
        turn: 0,
        phase: "MOVE",
        dice: [1, 2],
        remaining: [1],
        match: { target: 5, score: [0, 0], game: 1 },
        lastGame: null,
        winner: null,
        ...over,
      };
      s.points[0] = 1;
      return s;
    };

    it("обикновена победа (загубилият е изнесъл поне един пул) = 1 точка", () => {
      const s = lastChecker({ off: [14, 3] });
      s.points[10] = -12;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 0, die: 1 }, rng);
      expect(r.events).toContainEqual({ type: "GAME_WIN", seat: 0, points: 1, mars: false, score: [1, 0] });
      expect(r.state.match.score).toEqual([1, 0]);
      expect(r.state.lastGame).toEqual({ winner: 0, points: 1, mars: false });
    });

    it("марс (загубилият не е изнесъл нито един пул) = 2 точки", () => {
      const s = lastChecker();
      s.points[10] = -15;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 0, die: 1 }, rng);
      expect(r.events).toContainEqual({ type: "GAME_WIN", seat: 0, points: 2, mars: true, score: [2, 0] });
      expect(r.state.match.score).toEqual([2, 0]);
    });

    it("няма капия ×3: пул на бара или в дома на победителя пак е само марс (2)", () => {
      const s = lastChecker();
      s.bar[1] = 1;
      s.points[2] = -1;
      s.points[10] = -13;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 0, die: 1 }, rng);
      expect(r.state.match.score).toEqual([2, 0]);
    });

    it("след игра без край на мача: нова позиция, пръв хвърля победителят", () => {
      const s = lastChecker({ turn: 1, off: [3, 14], match: { target: 5, score: [1, 2], game: 4 } });
      s.points[0] = 0;
      s.points[23] = -1; // последният черен пул
      s.points[10] = 12;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 23, die: 1 }, rng);
      expect(r.events).toContainEqual({ type: "GAME_WIN", seat: 1, points: 1, mars: false, score: [1, 3] });
      expect(r.events).toContainEqual({ type: "NEW_GAME", game: 5, seat: 1 });
      expect(backgammonEngine.isTerminal(r.state)).toBe(false);
      const n = r.state;
      expect(n.match).toEqual({ target: 5, score: [1, 3], game: 5 });
      expect(n.turn).toBe(1);
      expect(n.phase).toBe("ROLL");
      expect(n.off).toEqual([0, 0]);
      expect(n.bar).toEqual([0, 0]);
      expect(n.openingRoll).toBeUndefined();
      expect(n.points).toEqual(backgammonEngine.init({ seats: 2 }, new SeededRng("p")).points);
      expect(backgammonEngine.legalActions(n, 1)).toEqual([{ type: "ROLL" }]);
      expect(backgammonEngine.legalActions(n, 0)).toEqual([]);
    });

    it("мачът до 5 свършва, щом някой стигне 5 (марс от 3 → 5)", () => {
      const s = lastChecker({ match: { target: 5, score: [3, 4], game: 6 } });
      s.points[10] = -15;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 0, die: 1 }, rng);
      expect(r.events).toContainEqual({ type: "WIN", seat: 0, score: [5, 4] });
      expect(r.events.some((e) => e.type === "NEW_GAME")).toBe(false);
      expect(r.state.winner).toBe(0);
      expect(backgammonEngine.isTerminal(r.state)).toBe(true);
      expect(backgammonEngine.legalActions(r.state, 0)).toEqual([]);
      expect(backgammonEngine.legalActions(r.state, 1)).toEqual([]);
      expect(backgammonEngine.score(r.state)).toEqual([
        { seat: 0, result: "win", points: 1 },
        { seat: 1, result: "loss", points: 0 },
      ]);
      expect(() => backgammonEngine.reduce(r.state, { type: "ROLL" }, rng)).toThrow(IllegalActionError);
    });

    it("резултат под целта не прекратява мача", () => {
      const s = lastChecker({ match: { target: 5, score: [3, 0], game: 3 } });
      s.points[10] = -12;
      s.off[1] = 3;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 0, die: 1 }, rng);
      expect(r.state.match.score).toEqual([4, 0]);
      expect(r.state.winner).toBeNull();
    });

    it("дължината на мача идва от лобито (3/5/7); невалидна → 5", () => {
      const at = (config: unknown) => backgammonEngine.init({ seats: 2, config }, new SeededRng("c")).match.target;
      expect(at(undefined)).toBe(5);
      expect(at({ matchTo: 3 })).toBe(3);
      expect(at({ matchTo: 7 })).toBe(7);
      expect(at({ matchTo: 99 })).toBe(5);
      expect(at({ matchTo: "7" })).toBe(5);
      expect(DEFAULT_BACKGAMMON_MATCH_TO).toBe(5);
    });

    it("пълният мач се изиграва докрай и е детерминистичен", () => {
      const a = playRandom(backgammonEngine, { seed: "m3", botSeed: "b3" });
      const b = playRandom(backgammonEngine, { seed: "m3", botSeed: "b3" });
      expect(a.state).toEqual(b.state);
      expect(a.terminal).toBe(true);
      expect(a.state.match.game).toBeGreaterThan(1);
      expect(a.state.match.target).toBe(5); // playRandom не подава config → 5
      expect(Math.max(...a.state.match.score)).toBeGreaterThanOrEqual(5);
    });

    it("не предлага удвояване (ROLL е единственото действие при хвърляне)", () => {
      const s = lastChecker({ phase: "ROLL", dice: [], remaining: [] });
      expect(backgammonEngine.legalActions(s, 0)).toEqual([{ type: "ROLL" }]);
      expect(backgammonEngine.bot!(s, 0, rng)).toEqual({ type: "ROLL" });
    });
  });
});
