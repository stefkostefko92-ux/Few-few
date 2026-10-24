import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import {
  RUMMY_LIMIT,
  arrangeMeld,
  bestMelds,
  buildRummyDeck,
  extendMeld,
  penaltyValue,
  roundPenalties,
  rummyEngine,
  rummyFace,
  type RummyAction,
  type RummyMeld,
  type RummyState,
} from "./rummy.js";

const rng = () => new SeededRng("rummy-test");

function makeState(partial: Partial<RummyState>): RummyState {
  return {
    seats: 2,
    hands: [[], []],
    stock: ["2Ca", "3Ca", "4Ca", "5Ca", "6Ca"],
    discard: [],
    melds: [],
    nextMeldId: 1,
    opened: [false, false],
    openedThisTurn: false,
    turn: 0,
    phase: "PLAY",
    mustUse: [],
    scores: [0, 0],
    round: 1,
    firstSeat: 0,
    lastRound: null,
    winners: [],
    done: false,
    ...partial,
  };
}

const act = (s: RummyState, a: RummyAction) => rummyEngine.reduce(s, a, rng());
const ok = (s: RummyState, a: RummyAction) => rummyEngine.validate!(s, s.turn, a);
const meld = (id: number, owner: number, kind: "run" | "set", cards: string[]): RummyMeld => ({ id, owner, kind, cards });

describe("реми: тесте и раздаване", () => {
  it("108 уникални карти (2 тестета + 4 жокера)", () => {
    const deck = buildRummyDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck).size).toBe(108);
    expect(deck.filter((c) => c.startsWith("*"))).toHaveLength(4);
    expect(rummyFace("TSa")).toBe("TS");
    expect(rummyFace("*3")).toBe("*");
  });

  it.each([2, 3, 4])("%i играчи: по 14 карти, първият 15 и започва с хвърляне", (seats) => {
    const s = rummyEngine.init({ seats }, rng());
    expect(s.hands).toHaveLength(seats);
    expect(s.hands[0]).toHaveLength(15);
    for (let i = 1; i < seats; i++) expect(s.hands[i]).toHaveLength(14);
    expect(s.stock).toHaveLength(108 - 14 * seats - 1);
    expect(s.discard).toHaveLength(0);
    expect(s.phase).toBe("PLAY");
    expect(rummyEngine.legalActions(s, 0).every((a) => a.type === "DISCARD")).toBe(true);
    expect(rummyEngine.legalActions(s, 1)).toEqual([]);
  });

  it("е детерминистичен при едно и също семе", () => {
    const a = rummyEngine.init({ seats: 3 }, new SeededRng("x"));
    const b = rummyEngine.init({ seats: 3 }, new SeededRng("x"));
    expect(a).toEqual(b);
  });
});

describe("реми: комбинации и точки", () => {
  it("серия с ниско асо A-2-3 = 6 т., с високо Q-K-A = 31 т.", () => {
    expect(arrangeMeld(["3Ha", "AHa", "2Hb"])).toMatchObject({ kind: "run", cards: ["AHa", "2Hb", "3Ha"], value: 6 });
    expect(arrangeMeld(["AHa", "KHa", "QHa"])).toMatchObject({ kind: "run", cards: ["QHa", "KHa", "AHa"], value: 31 });
  });

  it("без завъртане K-A-2; без смесени бои; без дубликат в серия", () => {
    expect(arrangeMeld(["KHa", "AHa", "2Ha"])).toBeNull();
    expect(arrangeMeld(["5Ha", "6Ha", "7Sa"])).toBeNull();
    expect(arrangeMeld(["5Ha", "5Hb", "6Ha", "7Ha"])).toBeNull();
  });

  it("група: 3–4 карти от ранг в различни бои", () => {
    expect(arrangeMeld(["KHa", "KSb", "KDa"])).toMatchObject({ kind: "set", value: 30 });
    expect(arrangeMeld(["AHa", "ASb", "ADa", "ACa"])).toMatchObject({ kind: "set", value: 44 });
    expect(arrangeMeld(["KHa", "KHb", "KDa"])).toBeNull(); // повторена боя
    expect(arrangeMeld(["KHa", "KSb", "KDa", "KCa", "KHb"])).toBeNull(); // 5 карти
  });

  it("жокерът замества карта и носи нейната стойност", () => {
    // 9-*-J ♠ → жокерът е 10
    expect(arrangeMeld(["9Sa", "*1", "JSa"])).toMatchObject({ cards: ["9Sa", "*1", "JSa"], value: 29 });
    // Q-K + жокер → жокерът отива нагоре като високо асо (11)
    expect(arrangeMeld(["QSa", "KSa", "*2"])).toMatchObject({ cards: ["QSa", "KSa", "*2"], value: 31 });
    // група с жокер
    expect(arrangeMeld(["7Ha", "7Sa", "*1"])).toMatchObject({ kind: "set", value: 21 });
    // нужни са поне 2 истински карти
    expect(arrangeMeld(["7Ha", "*1", "*2"])).toBeNull();
  });

  it("наказателни стойности: асо 11, фигура 10, жокер 50", () => {
    expect(penaltyValue("ASa")).toBe(11);
    expect(penaltyValue("QDb")).toBe(10);
    expect(penaltyValue("7Ca")).toBe(7);
    expect(penaltyValue("*4")).toBe(50);
  });

  it("bestMelds намира максимални непресичащи се комбинации и оставя карта", () => {
    const plan = bestMelds(["KHa", "KSa", "KDa", "QHa", "JHa", "THa", "2Ca"])!;
    // K♥ в серията T-J-Q-K♥ (40) + не стига за група → или група K (30) + T-J-Q (30) = 60
    expect(plan.value).toBe(60);
    expect(plan.used).toBe(6);
    const all = bestMelds(["5Ha", "6Ha", "7Ha"])!; // цялата ръка не може — една остава
    expect(all.used).toBeLessThan(3);
  });
});

describe("реми: отваряне ≥ 51", () => {
  const hand = ["KHa", "KSa", "KDa", "QCa", "JCa", "TCa", "2Da", "5Sb"]; // 30 + 30 = 60
  it("приема отваряне с 60 т. и маркира играча", () => {
    const s = makeState({ hands: [hand, ["3Ha"]] });
    const a: RummyAction = { type: "OPEN", melds: [["KHa", "KSa", "KDa"], ["TCa", "JCa", "QCa"]] };
    expect(ok(s, a)).toBe(true);
    const r = act(s, a);
    expect(r.state.opened[0]).toBe(true);
    expect(r.state.melds).toHaveLength(2);
    expect(r.state.hands[0]).toEqual(["2Da", "5Sb"]);
    expect(r.events[0]).toMatchObject({ type: "OPEN", points: 60 });
  });

  it("отхвърля под 51 т.", () => {
    const s = makeState({ hands: [hand, ["3Ha"]] });
    expect(ok(s, { type: "OPEN", melds: [["KHa", "KSa", "KDa"]] })).toBe(false);
    expect(() => act(s, { type: "OPEN", melds: [["KHa", "KSa", "KDa"]] })).toThrow(/51/);
  });

  it("жокерът брои стойността на заместената карта (Q-K-*=31 + 7-7-7=21 → 52)", () => {
    const s = makeState({ hands: [["QSa", "KSa", "*1", "7Ha", "7Sa", "7Da", "4Cb"], ["3Ha"]] });
    expect(ok(s, { type: "OPEN", melds: [["QSa", "KSa", "*1"], ["7Ha", "7Sa", "7Da"]] })).toBe(true);
    // ниско асо: A-2-3 + жокер = малко
    const s2 = makeState({ hands: [["ASa", "2Sa", "3Sa", "7Ha", "7Sa", "7Da", "4Cb"], ["3Ha"]] });
    expect(ok(s2, { type: "OPEN", melds: [["ASa", "2Sa", "3Sa"], ["7Ha", "7Sa", "7Da"]] })).toBe(false);
  });

  it("трябва да остане карта за хвърляне", () => {
    const s = makeState({ hands: [["KHa", "KSa", "KDa", "QCa", "JCa", "TCa"], ["3Ha"]] });
    expect(ok(s, { type: "OPEN", melds: [["KHa", "KSa", "KDa"], ["TCa", "JCa", "QCa"]] })).toBe(false);
  });

  it("неотворен не може да полага, долепя или сменя жокер", () => {
    const s = makeState({
      hands: [["5Ha", "6Ha", "7Ha", "8Sa", "9Sa"], ["3Ha"]],
      melds: [meld(1, 1, "run", ["TSa", "JSa", "*1"])],
      opened: [false, true],
    });
    expect(ok(s, { type: "MELD", cards: ["5Ha", "6Ha", "7Ha"] })).toBe(false);
    expect(ok(s, { type: "LAYOFF", meldId: 1, cards: ["9Sa"] })).toBe(false);
  });
});

describe("реми: вземане от купа", () => {
  it("неотворен може да вземе само ако с картата отваря — и OPEN трябва да я съдържа", () => {
    const base = makeState({
      hands: [["KHa", "KSa", "QCa", "JCa", "TCa", "2Da", "5Sb"], ["3Ha"]],
      discard: ["4Ha", "KDa"],
      phase: "DRAW",
    });
    expect(rummyEngine.legalActions(base, 0)).toContainEqual({ type: "TAKE" });
    const taken = act(base, { type: "TAKE" }).state;
    expect(taken.mustUse).toEqual(["KDa"]);
    // Хвърляне е забранено, докато картата не се използва.
    expect(ok(taken, { type: "DISCARD", card: "5Sb" })).toBe(false);
    expect(rummyEngine.legalActions(taken, 0)[0]!.type).toBe("OPEN");
    // Отваряне без взетата карта е невалидно.
    const t2 = { ...taken, hands: [[...taken.hands[0]!, "KCa"], ["3Ha"]] };
    expect(ok(t2, { type: "OPEN", melds: [["KHa", "KSa", "KCa"], ["TCa", "JCa", "QCa"]] })).toBe(false);
    const opened = act(taken, { type: "OPEN", melds: [["KHa", "KSa", "KDa"], ["TCa", "JCa", "QCa"]] }).state;
    expect(opened.mustUse).toEqual([]);
    expect(ok(opened, { type: "DISCARD", card: "5Sb" })).toBe(true);
  });

  it("не предлага TAKE, ако картата не може да се използва", () => {
    const s = makeState({ hands: [["KHa", "KSa", "2Da", "5Sb"], ["3Ha"]], discard: ["KDa"], phase: "DRAW" });
    // K-K-K = 30 < 51 → не отваря
    expect(rummyEngine.legalActions(s, 0)).toEqual([{ type: "DRAW" }]);
    expect(() => act(s, { type: "TAKE" })).toThrow();
  });

  it("отворен играч може да вземе карта, която долепя към масата", () => {
    const s = makeState({
      hands: [["2Da", "5Sb"], ["3Ha"]],
      discard: ["8Ha"],
      melds: [meld(1, 1, "run", ["5Ha", "6Ha", "7Ha"])],
      opened: [true, true],
      phase: "DRAW",
    });
    expect(ok(s, { type: "TAKE" })).toBe(true);
    const t = act(s, { type: "TAKE" }).state;
    expect(rummyEngine.legalActions(t, 0)).toEqual([{ type: "LAYOFF", meldId: 1, cards: ["8Ha"] }]);
    const l = act(t, { type: "LAYOFF", meldId: 1, cards: ["8Ha"] }).state;
    expect(l.melds[0]!.cards).toEqual(["5Ha", "6Ha", "7Ha", "8Ha"]);
    expect(ok(l, { type: "DISCARD", card: "5Sb" })).toBe(true);
  });
});

describe("реми: долепване и смяна на жокер", () => {
  it("долепя към своя и към чужда комбинация (серия в двата края, група до 4)", () => {
    const s = makeState({
      hands: [["4Ha", "8Ha", "KCa", "2Sa"], ["3Ha"]],
      melds: [meld(1, 1, "run", ["5Ha", "6Ha", "7Ha"]), meld(2, 0, "set", ["KHa", "KSa", "KDa"])],
      opened: [true, true],
    });
    const r1 = act(s, { type: "LAYOFF", meldId: 1, cards: ["4Ha", "8Ha"] }).state;
    expect(r1.melds[0]!.cards).toEqual(["4Ha", "5Ha", "6Ha", "7Ha", "8Ha"]);
    const r2 = act(r1, { type: "LAYOFF", meldId: 2, cards: ["KCa"] }).state;
    expect(r2.melds[1]!.cards).toHaveLength(4);
    expect(extendMeld(r2.melds[1]!, ["KHb"])).toBeNull(); // група е най-много 4
  });

  it("серия расте до високо асо, но не завърта", () => {
    const m = meld(1, 0, "run", ["JSa", "QSa", "KSa"]);
    expect(extendMeld(m, ["ASa"])).toEqual(["JSa", "QSa", "KSa", "ASa"]);
    expect(extendMeld(meld(2, 0, "run", ["QSa", "KSa", "ASa"]), ["2Sa"])).toBeNull();
  });

  it("не може да долепи последната си карта (трябва да хвърли)", () => {
    const s = makeState({
      hands: [["8Ha"], ["3Ha"]],
      melds: [meld(1, 1, "run", ["5Ha", "6Ha", "7Ha"])],
      opened: [true, true],
    });
    expect(ok(s, { type: "LAYOFF", meldId: 1, cards: ["8Ha"] })).toBe(false);
  });

  it("сменя жокер с истинската карта; жокерът трябва да се използва преди хвърляне", () => {
    const s = makeState({
      hands: [["6Ha", "9Ca", "TCa", "2Sa"], ["3Ha"]],
      melds: [meld(1, 1, "run", ["5Ha", "*1", "7Ha"])],
      opened: [true, true],
    });
    expect(ok(s, { type: "SWAP", meldId: 1, card: "9Ca" })).toBe(false); // грешна карта
    const r = act(s, { type: "SWAP", meldId: 1, card: "6Ha" }).state;
    expect(r.melds[0]!.cards).toEqual(["5Ha", "6Ha", "7Ha"]);
    expect(r.hands[0]).toContain("*1");
    expect(r.mustUse).toEqual(["*1"]);
    expect(ok(r, { type: "DISCARD", card: "2Sa" })).toBe(false);
    const m = act(r, { type: "MELD", cards: ["9Ca", "TCa", "*1"] }).state;
    expect(m.mustUse).toEqual([]);
    expect(ok(m, { type: "DISCARD", card: "2Sa" })).toBe(true);
  });

  it("сменя жокер в група с карта от липсваща боя", () => {
    const s = makeState({
      hands: [["9Ca", "9Ha", "4Sa", "5Sa"], ["3Ha"]],
      melds: [meld(1, 1, "set", ["9Sa", "9Da", "*2"]), meld(2, 1, "run", ["6Sa", "7Sa", "8Sa"])],
      opened: [true, true],
    });
    expect(ok(s, { type: "SWAP", meldId: 1, card: "9Ca" })).toBe(true);
    const neutral = makeState({ ...s, opened: [false, true] });
    expect(ok(neutral, { type: "SWAP", meldId: 1, card: "9Ca" })).toBe(false); // неотворен
  });
});

describe("реми: край на рунда и точкуване", () => {
  it("излезлият получава 0, отворените — сбора в ръка, неотворените — 100", () => {
    const s = makeState({
      seats: 3,
      hands: [["5Sb"], ["ASa", "*1", "QDa"], ["2Ca", "3Ca"]],
      opened: [true, true, false],
      scores: [0, 0, 0],
      melds: [meld(1, 0, "set", ["KHa", "KSa", "KDa"])],
    });
    const r = act(s, { type: "DISCARD", card: "5Sb" });
    expect(r.events).toContainEqual({
      type: "ROUND_END",
      seat: 0,
      hand: false,
      exhausted: false,
      penalties: [0, 71, 100],
      scores: [0, 71, 100],
    });
    expect(r.state.round).toBe(2);
    expect(r.state.firstSeat).toBe(1);
    expect(r.state.hands[1]).toHaveLength(15);
    expect(r.state.lastRound?.hands[1]).toEqual(["ASa", "*1", "QDa"]);
  });

  it("„Ръка“ (отваряне и излизане в един ход) удвоява наказанията", () => {
    const s = makeState({
      hands: [["KHa", "KSa", "KDa", "QCa", "JCa", "TCa", "5Sb"], ["7Ha", "8Ha"]],
      opened: [false, true],
    });
    const o = act(s, { type: "OPEN", melds: [["KHa", "KSa", "KDa"], ["TCa", "JCa", "QCa"]] }).state;
    const r = act(o, { type: "DISCARD", card: "5Sb" });
    expect(r.events).toContainEqual(expect.objectContaining({ type: "ROUND_END", hand: true, penalties: [0, 30] }));
    expect(roundPenalties([[], ["2Ca"]], [true, false], 0, true)).toEqual([0, 200]);
  });

  it("отваряне в по-ранен ход и излизане по-късно НЕ е „Ръка“", () => {
    const s = makeState({ hands: [["5Sb"], ["7Ha", "8Ha"]], opened: [true, true] });
    const r = act(s, { type: "DISCARD", card: "5Sb" });
    expect(r.events).toContainEqual(expect.objectContaining({ type: "ROUND_END", hand: false, penalties: [0, 15] }));
  });

  it("свършено тесте приключва рунда без излязъл", () => {
    const s = makeState({ hands: [["5Sb", "6Sa"], ["7Ha"]], opened: [true, false], stock: [] });
    const r = act(s, { type: "DISCARD", card: "5Sb" });
    expect(r.events).toContainEqual(expect.objectContaining({ type: "ROUND_END", exhausted: true, penalties: [6, 100] }));
  });

  it("мачът свършва при 501+, печели най-малкият резултат", () => {
    const s = makeState({
      seats: 3,
      hands: [["5Sb"], ["2Ca"], ["3Ca"]],
      opened: [true, false, true],
      scores: [200, 450, 300],
    });
    const r = act(s, { type: "DISCARD", card: "5Sb" });
    expect(r.state.done).toBe(true);
    expect(r.state.scores).toEqual([200, 550, 303]);
    expect(r.state.scores[1]!).toBeGreaterThanOrEqual(RUMMY_LIMIT);
    expect(r.state.winners).toEqual([0]);
    expect(rummyEngine.isTerminal(r.state)).toBe(true);
    expect(rummyEngine.score(r.state).map((x) => x.result)).toEqual(["win", "loss", "loss"]);
    expect(r.events).toContainEqual({ type: "MATCH", seat: 0, winners: [0] });
  });
});

describe("реми: сигурност и бот", () => {
  it("validate отхвърля деформиран вход и чужд ход", () => {
    const s = makeState({ hands: [["5Sb", "6Sa"], ["7Ha"]], opened: [true, true] });
    const bad = [null, {}, { type: "MELD" }, { type: "MELD", cards: "x" }, { type: "DISCARD", card: "ZZ" },
      { type: "LAYOFF", meldId: "1", cards: ["5Sb"] }, { type: "MELD", cards: new Array(40).fill("5Sb") }];
    for (const a of bad) expect(rummyEngine.validate!(s, 0, a as RummyAction)).toBe(false);
    expect(rummyEngine.validate!(s, 1, { type: "DISCARD", card: "7Ha" })).toBe(false);
    expect(rummyEngine.validate!(s, 0, { type: "DISCARD", card: "7Ha" })).toBe(false); // не е в ръката
  });

  it("redact скрива чуждите ръце и тестето", () => {
    const s = rummyEngine.init({ seats: 3 }, rng());
    const r = rummyEngine.redact(s, 1);
    expect(r.hands[1]).toEqual(s.hands[1]);
    expect(r.hands[0]!.every((c) => c === "?")).toBe(true);
    expect(r.stock.every((c) => c === "?")).toBe(true);
  });

  it.each([2, 3, 4])("ботът играе само легални ходове, отваря и завършва мача (%i играчи)", (seats) => {
    const r = new SeededRng(`bot-${seats}`);
    let s = rummyEngine.init({ seats }, r);
    let opens = 0;
    let steps = 0;
    while (!s.done && steps < 20_000) {
      const a = rummyEngine.bot!(s, s.turn, r)!;
      expect(a).not.toBeNull();
      expect(rummyEngine.validate!(s, s.turn, a)).toBe(true);
      const res = rummyEngine.reduce(s, a, r);
      opens += res.events.filter((e) => e.type === "OPEN").length;
      s = res.state;
      steps++;
    }
    expect(s.done).toBe(true);
    expect(opens).toBeGreaterThan(0);
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(RUMMY_LIMIT);
  });

  it("ботът хвърля най-безполезната карта (самотна висока, не жокер)", () => {
    const s = makeState({ hands: [["5Ha", "6Ha", "*1", "KCa", "9Sa", "9Da"], ["3Ha"]], opened: [false, false] });
    expect(rummyEngine.bot!(s, 0, rng())).toEqual({ type: "DISCARD", card: "KCa" });
  });
});
