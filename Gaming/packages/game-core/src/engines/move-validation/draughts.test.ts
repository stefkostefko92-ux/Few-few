import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { draughtsEngine, KING_ONLY_DRAW_PLIES, type DraughtsState } from "./draughts.js";

const empty = (): DraughtsState => ({
  board: new Array(64).fill(null),
  turn: 0,
  chainFrom: null,
  winner: null,
  done: false,
  noCaptureMoves: 0,
  pending: [],
  positions: [],
});

const idx = (r: number, c: number) => r * 8 + c;
const rng = () => new SeededRng("x");

describe("draughts multi-jump chaining", () => {
  it("forces a continued capture with the same piece (chainFrom set)", () => {
    const s = empty();
    // White (5,0); black (4,1) -> land (3,2); black (2,3) -> land (1,4).
    s.board[idx(5, 0)] = "w";
    s.board[idx(4, 1)] = "b";
    s.board[idx(2, 3)] = "b";

    // First jump.
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(3, 2) }, rng());
    expect(r1.state.chainFrom).toBe(idx(3, 2));
    expect(r1.state.turn).toBe(0); // same player continues
    // Only the chaining piece may act.
    const actions = draughtsEngine.legalActions(r1.state, 0);
    expect(actions.every((a) => a.from === idx(3, 2))).toBe(true);

    // Second jump completes the chain; turn passes.
    const r2 = draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(3, 2), to: idx(1, 4) }, rng());
    expect(r2.state.chainFrom).toBeNull();
    expect(r2.state.turn).toBe(1);
    // both black men captured
    expect(r2.state.board[idx(4, 1)]).toBeNull();
    expect(r2.state.board[idx(2, 3)]).toBeNull();
  });

  it("mandatory capture: only captures are offered when one exists", () => {
    const s = empty();
    s.board[idx(5, 2)] = "w";
    s.board[idx(4, 3)] = "b"; // capturable
    s.board[idx(5, 6)] = "w"; // could step but capture takes priority
    const actions = draughtsEngine.legalActions(s, 0);
    expect(actions.length).toBeGreaterThan(0);
    // every offered move must be the capturing jump (lands two away)
    expect(actions.every((a) => Math.abs((a.to % 8) - (a.from % 8)) === 2)).toBe(true);
  });
});

describe("руска дама: обикновеният пул взема и назад", () => {
  it("a man captures backward", () => {
    const s = empty();
    s.board[idx(3, 2)] = "w";
    s.board[idx(4, 3)] = "b"; // behind the white man (white moves toward row 0)
    const actions = draughtsEngine.legalActions(s, 0);
    expect(actions).toContainEqual({ type: "MOVE", from: idx(3, 2), to: idx(5, 4) });
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(3, 2), to: idx(5, 4) }, rng());
    expect(r.state.board[idx(4, 3)]).toBeNull();
    expect(r.state.board[idx(5, 4)]).toBe("w");
  });

  it("a man does NOT step backward (steps stay forward-only)", () => {
    const s = empty();
    s.board[idx(3, 2)] = "w"; // nothing to capture anywhere
    const actions = draughtsEngine.legalActions(s, 0);
    // only the two forward steps
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.to).sort()).toEqual([idx(2, 1), idx(2, 3)].sort());
  });
});

describe("draughts flying kings", () => {
  it("a king slides any number of empty squares", () => {
    const s = empty();
    s.board[idx(4, 3)] = "W";
    const actions = draughtsEngine.legalActions(s, 0);
    expect(actions).toHaveLength(13); // full X of open diagonals
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(1, 0) });
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(0, 7) });
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(7, 0) });
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(7, 6) });
  });

  it("a king cannot slide past a piece", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(5, 2)] = "w"; // own man blocks the diagonal
    const actions = draughtsEngine.legalActions(s, 0);
    const kingMoves = actions.filter((a) => a.from === idx(7, 0));
    expect(kingMoves).toEqual([{ type: "MOVE", from: idx(7, 0), to: idx(6, 1) }]);
  });

  it("a king captures a distant piece and may stop on any empty square behind it", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(4, 3)] = "b"; // three squares away, empty squares behind
    const actions = draughtsEngine.legalActions(s, 0);
    // mandatory capture: all actions are the flying capture with 4 landings
    expect(actions).toHaveLength(4);
    for (const to of [idx(3, 4), idx(2, 5), idx(1, 6), idx(0, 7)]) {
      expect(actions).toContainEqual({ type: "MOVE", from: idx(7, 0), to });
    }
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(7, 0), to: idx(2, 5) }, rng());
    expect(r.state.board[idx(4, 3)]).toBeNull();
    expect(r.state.board[idx(2, 5)]).toBe("W");
    expect(r.state.chainFrom).toBeNull();
    expect(r.state.turn).toBe(1);
  });

  it("a king cannot capture when the square behind the piece is occupied", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(4, 3)] = "b";
    s.board[idx(3, 4)] = "b"; // no empty landing behind the first enemy
    const actions = draughtsEngine.legalActions(s, 0);
    // no capture available → only sliding steps up to (5,2)
    expect(actions.every((a) => a.to === idx(6, 1) || a.to === idx(5, 2))).toBe(true);
  });
});

describe("руска дама: промоция в поредица", () => {
  it("пул, стигнал последния ред при вземане, става дама веднага и продължава като дама", () => {
    const s = empty();
    s.board[idx(2, 1)] = "w";
    s.board[idx(1, 2)] = "b"; // скок до (0,3) — последният ред
    s.board[idx(3, 6)] = "b"; // далече по диагонала (0,3)→(4,7): само дама може да го вземе
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(2, 1), to: idx(0, 3) }, rng());
    expect(r1.state.board[idx(0, 3)]).toBe("W"); // коронясан веднага
    expect(r1.events).toContainEqual({ type: "KING", seat: 0, at: idx(0, 3) });
    expect(r1.state.chainFrom).toBe(idx(0, 3));
    expect(r1.state.turn).toBe(0);
    // Продължава като летяща дама: взема (3,6) отдалеч и каца на (4,7).
    expect(draughtsEngine.legalActions(r1.state, 0)).toEqual([
      { type: "MOVE", from: idx(0, 3), to: idx(4, 7) },
    ]);
    const r2 = draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(0, 3), to: idx(4, 7) }, rng());
    expect(r2.state.board[idx(4, 7)]).toBe("W");
    expect(r2.state.board[idx(1, 2)]).toBeNull();
    expect(r2.state.board[idx(3, 6)]).toBeNull();
    expect(r2.state.chainFrom).toBeNull();
    expect(r2.events.some((e) => e.type === "KING")).toBe(false); // само веднъж
  });

  it("поредица, която свършва на последния ред, също коронясва", () => {
    const s = empty();
    s.board[idx(2, 1)] = "w";
    s.board[idx(1, 2)] = "b";
    s.board[idx(0, 5)] = "b"; // не може да се вземе от (0,3)
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(2, 1), to: idx(0, 3) }, rng());
    expect(r.state.board[idx(0, 3)]).toBe("W");
    expect(r.state.chainFrom).toBeNull();
    expect(r.state.turn).toBe(1);
    expect(r.events.some((e) => e.type === "KING")).toBe(true);
  });
});

describe("руска дама: свободен избор на вземане", () => {
  it("и единичното вземане е законно, когато има по-дълга поредица", () => {
    const s = empty();
    s.board[idx(5, 4)] = "w";
    s.board[idx(4, 5)] = "b"; // единично вземане → (3,6)
    s.board[idx(4, 3)] = "b"; // поредица → (3,2) → (1,0)
    s.board[idx(2, 1)] = "b";
    const acts = draughtsEngine.legalActions(s, 0);
    expect(acts).toContainEqual({ type: "MOVE", from: idx(5, 4), to: idx(3, 6) });
    expect(acts).toContainEqual({ type: "MOVE", from: idx(5, 4), to: idx(3, 2) });
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 4), to: idx(3, 6) }, rng());
    expect(r.state.turn).toBe(1);
    expect(r.state.board[idx(4, 5)]).toBeNull();
  });

  it("всеки пул с вземане може да вземе — не само този с най-дългата поредица", () => {
    const s = empty();
    s.board[idx(5, 0)] = "w"; // поредица от два скока
    s.board[idx(4, 1)] = "b";
    s.board[idx(2, 3)] = "b";
    s.board[idx(5, 6)] = "w"; // единичен скок
    s.board[idx(4, 7)] = "b";
    s.board[idx(4, 5)] = "b";
    const acts = draughtsEngine.legalActions(s, 0);
    expect(acts).toContainEqual({ type: "MOVE", from: idx(5, 6), to: idx(3, 4) });
    expect(acts).toContainEqual({ type: "MOVE", from: idx(5, 0), to: idx(3, 2) });
  });

  it("започнатата поредица трябва да се довърши", () => {
    const s = empty();
    s.board[idx(5, 0)] = "w";
    s.board[idx(4, 1)] = "b";
    s.board[idx(2, 3)] = "b";
    s.board[idx(6, 7)] = "w"; // има и свободен ход, но не и в поредица
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(3, 2) }, rng());
    expect(draughtsEngine.legalActions(r1.state, 0)).toEqual([
      { type: "MOVE", from: idx(3, 2), to: idx(1, 4) },
    ]);
    expect(() =>
      draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(6, 7), to: idx(5, 6) }, rng()),
    ).toThrow();
  });
});

describe("руска дама: летящата дама е длъжна да продължи", () => {
  it("ако от някое приземяване има продължение, само те са позволени", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(5, 2)] = "b"; // приземявания (4,3),(3,4),(2,5),(1,6),(0,7)
    s.board[idx(2, 3)] = "b"; // от (3,4) може да се вземе (2,3) → (1,2)
    const acts = draughtsEngine.legalActions(s, 0);
    expect(acts).toEqual([{ type: "MOVE", from: idx(7, 0), to: idx(3, 4) }]);
  });
});

describe("draughts „турски удар“ (взетите остават до края на хода)", () => {
  it("дамката не минава през вече взет пул и не се обръща да вземе още", () => {
    const s = empty();
    s.board[idx(4, 3)] = "W";
    s.board[idx(2, 5)] = "b";
    s.board[idx(6, 1)] = "b";
    s.board[idx(0, 1)] = "b";
    // Всички вземания са дълги 1 → и трите приземявания са законни.
    const acts = draughtsEngine.legalActions(s, 0);
    for (const to of [idx(1, 6), idx(0, 7), idx(7, 0)]) {
      expect(acts).toContainEqual({ type: "MOVE", from: idx(4, 3), to });
    }
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(4, 3), to: idx(1, 6) }, rng());
    // Без продължение (1,6)->(7,0) през взетия (2,5): ходът свършва, пулът се маха.
    expect(r.state.chainFrom).toBeNull();
    expect(r.state.turn).toBe(1);
    expect(r.state.board[idx(2, 5)]).toBeNull();
    expect(r.state.board[idx(6, 1)]).toBe("b");
    expect(r.state.pending).toEqual([]);
  });

  it("един пул не може да се прескочи два пъти в една поредица", () => {
    const s = empty();
    s.board[idx(4, 3)] = "W";
    s.board[idx(3, 4)] = "b"; // взет при (4,3)→(2,5); после (2,5)→(4,3)… не е позволено
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(4, 3), to: idx(2, 5) }, rng());
    expect(r.state.chainFrom).toBeNull();
    expect(r.state.turn).toBe(1);
    expect(r.state.board[idx(3, 4)]).toBeNull();
  });

  it("законно вземане с пул е налично редом с вземанията на дамата", () => {
    const s = empty();
    s.board[idx(4, 3)] = "W";
    s.board[idx(2, 5)] = "b";
    s.board[idx(6, 1)] = "b";
    s.board[idx(0, 1)] = "b";
    s.board[idx(6, 5)] = "w";
    s.board[idx(5, 6)] = "b";
    expect(draughtsEngine.legalActions(s, 0)).toContainEqual({
      type: "MOVE",
      from: idx(6, 5),
      to: idx(4, 7),
    });
  });

  it("мид-верига взетият пул стои на дъската и блокира; махат се всички накрая", () => {
    const s = empty();
    s.board[idx(5, 0)] = "w";
    s.board[idx(4, 1)] = "b";
    s.board[idx(2, 3)] = "b";
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(3, 2) }, rng());
    expect(r1.state.board[idx(4, 1)]).toBe("b"); // още на дъската
    expect(r1.state.pending).toEqual([idx(4, 1)]);
    // Пулът не може да скочи обратно през взетия (4,1).
    expect(draughtsEngine.legalActions(r1.state, 0)).toEqual([
      { type: "MOVE", from: idx(3, 2), to: idx(1, 4) },
    ]);
    const r2 = draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(3, 2), to: idx(1, 4) }, rng());
    expect(r2.state.board[idx(4, 1)]).toBeNull();
    expect(r2.state.board[idx(2, 3)]).toBeNull();
    expect(r2.state.pending).toEqual([]);
  });
});

describe("draughts реми", () => {
  it("15 хода на страна (30 полухода) само с дами → реми, не победа по материал", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(5, 4)] = "W"; // бял материал повече — без значение
    s.board[idx(0, 7)] = "B";
    s.noCaptureMoves = KING_ONLY_DRAW_PLIES - 1;
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(7, 0), to: idx(6, 1) }, rng());
    expect(r.state.done).toBe(true);
    expect(r.state.winner).toBeNull();
    expect(r.events).toContainEqual({ type: "DRAW" });
    expect(draughtsEngine.score(r.state).every((x) => x.result === "draw")).toBe(true);
  });

  it("ход на обикновен пул нулира брояча (без реми)", () => {
    const s = empty();
    s.board[idx(5, 0)] = "w";
    s.board[idx(0, 7)] = "B";
    s.noCaptureMoves = KING_ONLY_DRAW_PLIES - 1;
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(4, 1) }, rng());
    expect(r.state.done).toBe(false);
    expect(r.state.noCaptureMoves).toBe(0);
  });

  it("вземане нулира брояча", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(5, 2)] = "b";
    s.board[idx(0, 7)] = "B";
    s.noCaptureMoves = KING_ONLY_DRAW_PLIES - 1;
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(7, 0), to: idx(4, 3) }, rng());
    expect(r.state.done).toBe(false);
    expect(r.state.noCaptureMoves).toBe(0);
  });

  it("трикратно повторение на позицията → реми", () => {
    // Дамките са на ръбовете, без обща диагонал с празно поле зад — няма вземания.
    const s = empty();
    s.board[idx(7, 6)] = "W";
    s.board[idx(0, 1)] = "B";
    const seq = [
      [idx(7, 6), idx(6, 7)],
      [idx(0, 1), idx(1, 0)],
      [idx(6, 7), idx(7, 6)],
      [idx(1, 0), idx(0, 1)],
    ] as const;
    let last = s;
    // Позицията след 1-вия полуход (черни на ход) се повтаря на 5-ия и 9-ия →
    // третото ѝ появяване (9-ият полуход) е реми, не по-рано.
    for (let i = 0; i < 9; i++) {
      const [from, to] = seq[i % 4]!;
      expect(last.done).toBe(false);
      last = draughtsEngine.reduce(last, { type: "MOVE", from, to }, rng()).state;
    }
    expect(last.done).toBe(true);
    expect(last.winner).toBeNull();
  });

  it("не предлага действия, различни от MOVE (клиентът няма бутони за реми)", () => {
    const s = draughtsEngine.init({ seats: 2 }, rng());
    expect(draughtsEngine.legalActions(s, 0).every((a) => a.type === "MOVE")).toBe(true);
  });
});

describe("draughts bot", () => {
  it("returns a legal action and prefers the longer capture chain (by choice)", () => {
    const s = empty();
    // Two options: single capture right, double-chain left.
    s.board[idx(5, 4)] = "w";
    s.board[idx(4, 5)] = "b"; // single capture → (3,6)
    s.board[idx(4, 3)] = "b"; // chain start → (3,2), then (2,1)? build a chain:
    s.board[idx(2, 1)] = "b"; // (3,2) → jump (2,1) → (1,0)
    const legal = draughtsEngine.legalActions(s, 0);
    const pick = draughtsEngine.bot!(s, 0, rng());
    expect(pick).not.toBeNull();
    expect(legal).toContainEqual(pick);
    expect(pick).toEqual({ type: "MOVE", from: idx(5, 4), to: idx(3, 2) });
  });
});
