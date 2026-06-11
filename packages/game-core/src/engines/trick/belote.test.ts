import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { beloteEngine, type BeloteState } from "./belote.js";

const init = (seed = "bel"): BeloteState => beloteEngine.init({ seats: 4 }, new SeededRng(seed));

describe("belote engine", () => {
  it("deals four hands of 8 from a 32-card deck", () => {
    const s = init();
    expect(s.hands).toHaveLength(4);
    for (const h of s.hands) expect(h).toHaveLength(8);
    const all = new Set(s.hands.flat());
    expect(all.size).toBe(32);
    expect(s.phase).toBe("BID");
  });

  it("offers pass + four suit calls during bidding", () => {
    const s = init();
    const actions = beloteEngine.legalActions(s, s.turn);
    expect(actions.map((a) => a.type).sort()).toEqual(["CALL", "CALL", "CALL", "CALL", "PASS"]);
    expect(beloteEngine.legalActions(s, ((s.turn + 1) % 4) as 0)).toEqual([]);
  });

  it("a call starts the play phase with a trump and declarer", () => {
    let s = init();
    s = beloteEngine.reduce(s, { type: "CALL", suit: "H" }, new SeededRng("r")).state;
    expect(s.phase).toBe("PLAY");
    expect(s.trump).toBe("H");
    expect(s.declarer).not.toBeNull();
  });

  it("forces a contract if everyone passes", () => {
    let s = init();
    const rng = new SeededRng("r");
    for (let i = 0; i < 4; i++) s = beloteEngine.reduce(s, { type: "PASS" }, rng).state;
    expect(s.phase).toBe("PLAY");
    expect(s.trump).not.toBeNull();
  });

  it("enforces follow-suit during play", () => {
    let s = init();
    s = beloteEngine.reduce(s, { type: "CALL", suit: "S" }, new SeededRng("r")).state;
    const leader = s.turn;
    const lead = beloteEngine.legalActions(s, leader)[0]!;
    s = beloteEngine.reduce(s, lead, new SeededRng("r")).state;
    const leadSuit = (lead as { card: string }).card.slice(-1);
    const responder = s.turn;
    const hasSuit = s.hands[responder]!.some((c) => c.endsWith(leadSuit));
    if (hasSuit) {
      const actions = beloteEngine.legalActions(s, responder) as Array<{ card: string }>;
      expect(actions.every((a) => a.card.endsWith(leadSuit))).toBe(true);
    }
  });

  it("plays full random games to a winning team", () => {
    for (let g = 0; g < 40; g++) {
      const { state, terminal } = playRandom(beloteEngine, {
        seed: `m${g}`,
        botSeed: `b${g}`,
        seats: 4,
      });
      expect(terminal).toBe(true);
      const score = beloteEngine.score(state);
      expect(score.filter((x) => x.result === "win")).toHaveLength(2);
      expect(score.filter((x) => x.result === "loss")).toHaveLength(2);
      // Total points = 162 card points (152 + 10 last trick) + declaration points.
      const decl = state.declPoints[0] + state.declPoints[1];
      expect(state.teamPoints[0] + state.teamPoints[1]).toBe(162 + decl);
    }
  });

  it("is deterministic for identical seeds", () => {
    const a = playRandom(beloteEngine, { seed: "x", botSeed: "y", seats: 4 });
    const b = playRandom(beloteEngine, { seed: "x", botSeed: "y", seats: 4 });
    expect(a.state).toEqual(b.state);
  });

  it("applies declarations to team points once the contract is set", () => {
    // Find a seed whose deal yields at least one declaration, then verify the
    // engine added exactly those points on top of card points.
    for (let g = 0; g < 60; g++) {
      const { state } = playRandom(beloteEngine, { seed: `d${g}`, botSeed: `b${g}`, seats: 4 });
      const decl = state.declPoints[0] + state.declPoints[1];
      if (decl > 0) {
        expect(state.declarations.length).toBeGreaterThan(0);
        expect(state.teamPoints[0] + state.teamPoints[1]).toBe(162 + decl);
        return;
      }
    }
    throw new Error("expected at least one deal with declarations across 60 games");
  });
});
