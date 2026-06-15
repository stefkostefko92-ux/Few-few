import { describe, expect, it } from "vitest";
import { BOARD, type MagnatState, type MagnatAction } from "@aso/shared";
import { magnatEngine, magnatBot } from "./magnat.js";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";

const init = (seats = 4) => magnatEngine.init({ seats }, new SeededRng(`m-${seats}`));

describe("МАГНАТ — setup", () => {
  it("builds a 40-tile board with 28 ownable tiles", () => {
    expect(BOARD).toHaveLength(40);
    const ownable = BOARD.filter((t) => ["prop", "station", "utility"].includes(t.type));
    expect(ownable).toHaveLength(28);
  });

  it("starts every player on Старт with 1500 and nothing owned", () => {
    const s = init(4);
    expect(s.cash).toEqual([1500, 1500, 1500, 1500]);
    expect(s.pos.every((p) => p === 0)).toBe(true);
    expect(s.owner.every((o) => o === -1)).toBe(true);
    expect(s.phase).toBe("ROLL");
  });

  it("clamps seats to 2..6", () => {
    expect(magnatEngine.init({ seats: 1 }, new SeededRng("a")).seats).toBe(2);
    expect(magnatEngine.init({ seats: 9 }, new SeededRng("b")).seats).toBe(6);
  });
});

describe("МАГНАТ — buying & rent", () => {
  it("BUY transfers cash and sets ownership", () => {
    const s: MagnatState = { ...init(2), phase: "BUY", pendingBuy: 1, turn: 0 };
    const { state } = magnatEngine.reduce(s, { type: "BUY" }, new SeededRng("x"));
    expect(state.owner[1]).toBe(0);
    expect(state.cash[0]).toBe(1500 - BOARD[1]!.price);
    expect(state.phase).toBe("MANAGE");
  });

  it("DECLINE with auctions off leaves the tile unowned and moves to MANAGE", () => {
    const base = magnatEngine.init({ seats: 2, config: { auctions: false } }, new SeededRng("na"));
    const s: MagnatState = { ...base, phase: "BUY", pendingBuy: 1, turn: 0 };
    const { state } = magnatEngine.reduce(s, { type: "DECLINE" }, new SeededRng("x"));
    expect(state.owner[1]).toBe(-1);
    expect(state.phase).toBe("MANAGE");
  });

  it("DECLINE with auctions on opens an auction for the tile", () => {
    const s: MagnatState = { ...init(2), phase: "BUY", pendingBuy: 1, turn: 0 };
    const { state, events } = magnatEngine.reduce(s, { type: "DECLINE" }, new SeededRng("x"));
    expect(state.phase).toBe("AUCTION");
    expect(state.auction?.tile).toBe(1);
    expect(events.some((e) => e.type === "AUCTION_START")).toBe(true);
  });

  it("only offers BUY when the player can afford it", () => {
    const poor: MagnatState = { ...init(2), phase: "BUY", pendingBuy: 39, turn: 0, cash: [100, 1500] };
    const acts = magnatEngine.legalActions(poor, 0).map((a) => a.type);
    expect(acts).toContain("DECLINE");
    expect(acts).not.toContain("BUY");
  });
});

describe("МАГНАТ — building (even-build rule)", () => {
  function ownGroup0(): MagnatState {
    const s = init(2);
    const owner = s.owner.slice();
    owner[1] = 0;
    owner[3] = 0; // both brown properties (group 0)
    return { ...s, owner, phase: "MANAGE", turn: 0, cash: [1500, 1500] };
  }

  it("can build on a full monopoly, then enforces even build", () => {
    const s = ownGroup0();
    let acts = magnatEngine.legalActions(s, 0);
    expect(acts.some((a) => a.type === "BUILD" && a.tile === 1)).toBe(true);

    const after = magnatEngine.reduce(s, { type: "BUILD", tile: 1 }, new SeededRng("b")).state;
    expect(after.houses[1]).toBe(1);
    acts = magnatEngine.legalActions(after, 0);
    // tile 1 already has a house; even-build forbids a 2nd until tile 3 catches up.
    expect(acts.some((a) => a.type === "BUILD" && a.tile === 1)).toBe(false);
    expect(acts.some((a) => a.type === "BUILD" && a.tile === 3)).toBe(true);
  });

  it("cannot build without the full colour group", () => {
    const s = init(2);
    const owner = s.owner.slice();
    owner[1] = 0; // only one of the two brown tiles
    const partial: MagnatState = { ...s, owner, phase: "MANAGE", turn: 0 };
    expect(magnatEngine.legalActions(partial, 0).some((a) => a.type === "BUILD")).toBe(false);
  });
});

describe("МАГНАТ — session config", () => {
  it("honours a custom starting cash", () => {
    const s = magnatEngine.init({ seats: 3, config: { startingCash: 4000 } }, new SeededRng("c"));
    expect(s.cash).toEqual([4000, 4000, 4000]);
    expect(s.config.startingCash).toBe(4000);
  });

  it("falls back to defaults when no config is given", () => {
    const s = init(2);
    expect(s.config.startingCash).toBe(1500);
    expect(s.config.auctions).toBe(true);
  });

  it("routes a tax fee into the free-parking pot", () => {
    // Find a roll that lands seat 0 on the income-tax tile (4), then assert the
    // 200 fee went into the pot rather than vanishing to the bank.
    for (let k = 0; k < 300; k++) {
      const base = magnatEngine.init({ seats: 2, config: { freeParkingPot: true } }, new SeededRng("pot"));
      const { state } = magnatEngine.reduce(base, { type: "ROLL" }, new SeededRng(`r-${k}`));
      if (state.pos[0] === 4) {
        expect(state.pot).toBe(BOARD[4]!.tax);
        return;
      }
    }
    throw new Error("no income-tax landing produced in 300 seeds");
  });
});

describe("МАГНАТ — auctions", () => {
  function auctionState(): MagnatState {
    const s: MagnatState = { ...init(3), phase: "BUY", pendingBuy: 5, turn: 0, cash: [1000, 1000, 1000] };
    return magnatEngine.reduce(s, { type: "DECLINE" }, new SeededRng("a")).state;
  }
  it("awards the tile to the last remaining bidder and charges them", () => {
    let s = auctionState();
    expect(s.phase).toBe("AUCTION");
    // current bidder bids, the others pass → bidder wins.
    const bidder = s.turn;
    s = magnatEngine.reduce(s, { type: "BID", amount: 120 }, new SeededRng("b")).state;
    // remaining seats pass until resolution
    let guard = 0;
    while (s.phase === "AUCTION" && guard++ < 10) {
      s = magnatEngine.reduce(s, { type: "PASS_BID" }, new SeededRng("p")).state;
    }
    expect(s.phase).toBe("MANAGE");
    expect(s.owner[5]).toBe(bidder);
    expect(s.cash[bidder]).toBe(1000 - 120);
  });

  it("leaves the tile unsold if everyone passes", () => {
    let s = auctionState();
    let guard = 0;
    while (s.phase === "AUCTION" && guard++ < 10) {
      s = magnatEngine.reduce(s, { type: "PASS_BID" }, new SeededRng("p")).state;
    }
    expect(s.owner[5]).toBe(-1);
    expect(s.phase).toBe("MANAGE");
  });
});

describe("МАГНАТ — trading", () => {
  it("transfers tiles + cash on an accepted offer", () => {
    const base = init(2);
    const owner = base.owner.slice();
    owner[1] = 0; // seat 0 owns Дупница
    owner[6] = 1; // seat 1 owns Монтана
    const s: MagnatState = { ...base, owner, phase: "MANAGE", turn: 0, cash: [1000, 1000] };
    const offered = magnatEngine.reduce(
      s,
      { type: "TRADE_OFFER", to: 1, give: { cash: 50, tiles: [1] }, want: { cash: 0, tiles: [6] } },
      new SeededRng("t"),
    ).state;
    expect(offered.phase).toBe("TRADE");
    expect(offered.turn).toBe(1); // recipient responds
    const done = magnatEngine.reduce(offered, { type: "TRADE_ACCEPT" }, new SeededRng("t")).state;
    expect(done.owner[1]).toBe(1);
    expect(done.owner[6]).toBe(0);
    expect(done.cash[0]).toBe(950);
    expect(done.cash[1]).toBe(1050);
    expect(done.phase).toBe("MANAGE");
    expect(done.turn).toBe(0); // back to the offerer
  });

  it("rejects an offer of a property with houses in its group", () => {
    const base = init(2);
    const owner = base.owner.slice();
    owner[1] = 0;
    owner[3] = 0; // full brown group
    const houses = base.houses.slice();
    houses[1] = 1; // a house exists in the group
    const s: MagnatState = { ...base, owner, houses, phase: "MANAGE", turn: 0 };
    expect(
      magnatEngine.validate!(s, 0, { type: "TRADE_OFFER", to: 1, give: { cash: 0, tiles: [3] }, want: { cash: 0, tiles: [] } }),
    ).toBe(false);
  });
});

describe("МАГНАТ — jail", () => {
  it("paying bail frees the player and keeps them in the roll phase", () => {
    const s: MagnatState = { ...init(2), turn: 0, phase: "ROLL", inJail: [true, false] };
    const acts = magnatEngine.legalActions(s, 0).map((a) => a.type);
    expect(acts).toContain("JAIL_PAY");
    const { state } = magnatEngine.reduce(s, { type: "JAIL_PAY" }, new SeededRng("j"));
    expect(state.inJail[0]).toBe(false);
    expect(state.cash[0]).toBe(1500 - 50);
    expect(magnatEngine.legalActions(state, 0)).toEqual([{ type: "ROLL" }]);
  });
});

describe("МАГНАТ — termination & scoring", () => {
  it("reaches a terminal state with exactly one winner under random play", () => {
    for (let g = 0; g < 12; g++) {
      const { state, terminal } = playRandom(magnatEngine, {
        seed: `mag-${g}`,
        botSeed: `magb-${g}`,
        seats: 4,
        maxSteps: 200_000,
      });
      expect(terminal).toBe(true);
      const score = magnatEngine.score(state as MagnatState);
      expect(score).toHaveLength(4);
      expect(score.filter((s) => s.result === "win")).toHaveLength(1);
    }
  });

  it("is deterministic for identical seeds", () => {
    const a = playRandom(magnatEngine, { seed: "det", botSeed: "detb", seats: 4 });
    const b = playRandom(magnatEngine, { seed: "det", botSeed: "detb", seats: 4 });
    expect(a.state).toEqual(b.state);
    expect(a.steps).toBe(b.steps);
  });

  it("redacts the unseen card order", () => {
    const view = magnatEngine.redact(init(2), 0);
    expect(view.chance).toEqual([]);
    expect(view.chest).toEqual([]);
  });

  it("never emits more than one BANKRUPT per seat in a single reduce", () => {
    // Drive many full games and assert each reduce yields at most one bankruptcy
    // per seat (regression for the missing already-bankrupt guard in charge()).
    for (let g = 0; g < 30; g++) {
      const rng = new SeededRng(`bk-${g}`);
      let s = init(4);
      let steps = 0;
      while (!magnatEngine.isTerminal(s) && steps++ < 200_000) {
        const action = magnatBot(s, s.turn, rng);
        if (!action) break;
        const { state, events } = magnatEngine.reduce(s, action as MagnatAction, rng);
        const perSeat = new Map<number, number>();
        for (const e of events) {
          if (e.type === "BANKRUPT") perSeat.set(e.seat, (perSeat.get(e.seat) ?? 0) + 1);
        }
        for (const count of perSeat.values()) expect(count).toBeLessThanOrEqual(1);
        s = state;
      }
    }
  });
});

describe("МАГНАТ — heuristic bot", () => {
  it("drives a full game to one winner and actually acquires property", () => {
    const rng = new SeededRng("bot-drive");
    let s = init(4);
    let steps = 0;
    while (!magnatEngine.isTerminal(s) && steps++ < 200_000) {
      const action = magnatBot(s, s.turn, rng);
      if (!action) break;
      s = magnatEngine.reduce(s, action as MagnatAction, rng).state;
    }
    expect(magnatEngine.isTerminal(s)).toBe(true);
    expect(magnatEngine.score(s).filter((x) => x.result === "win")).toHaveLength(1);
    // bots buy aggressively, so most of the 28 ownable tiles end up owned.
    const owned = s.owner.filter((o) => o >= 0).length;
    expect(owned).toBeGreaterThan(14);
  });

  it("buys a property it can comfortably afford", () => {
    const s: MagnatState = { ...init(2), phase: "BUY", pendingBuy: 1, turn: 0, cash: [1500, 1500] };
    expect(magnatBot(s, 0, new SeededRng("b"))).toEqual({ type: "BUY" });
  });

  it("declines a purchase that would drain its cash", () => {
    const s: MagnatState = { ...init(2), phase: "BUY", pendingBuy: 39, turn: 0, cash: [410, 1500] };
    expect(magnatBot(s, 0, new SeededRng("b"))).toEqual({ type: "DECLINE" });
  });
});
