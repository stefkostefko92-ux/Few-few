import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { ball, runShot, TABLE, type Ball } from "@aso/shared";
import { rackEightBall, rackNineBall, SNOOKER_SPOTS } from "./racks.js";
import {
  eightBallEngine,
  nineBallEngine,
  snookerEngine,
  type CueAction,
  type CueActionX,
  type CueState,
  type CueStateX,
} from "./cue.js";

const rng = () => new SeededRng("cue-test");

/** Aim from `from` straight at `to`. */
const aimAt = (from: { x: number; y: number }, to: { x: number; y: number }, power: number): CueActionX => ({
  type: "SHOOT",
  angle: Math.atan2(to.y - from.y, to.x - from.x),
  power,
});

const find = (s: CueStateX, id: number): Ball => s.balls.find((b) => b.id === id)!;

describe("billiard physics", () => {
  it("is deterministic for identical inputs", () => {
    const balls = rackNineBall();
    const a = runShot(balls, { angle: 0.02, power: 0.9 });
    const b = runShot(balls, { angle: 0.02, power: 0.9 });
    expect(a.finalBalls.map((x) => [x.id, x.x, x.y, x.potted])).toEqual(
      b.finalBalls.map((x) => [x.id, x.x, x.y, x.potted]),
    );
    expect(a.frames.length).toBe(b.frames.length);
  });

  it("does not mutate the input balls and keeps balls in bounds", () => {
    const balls = rackNineBall();
    const before = JSON.stringify(balls);
    const res = runShot(balls, { angle: 0.1, power: 1 });
    expect(JSON.stringify(balls)).toBe(before); // pure
    for (const b of res.finalBalls) {
      if (b.potted) continue;
      expect(b.x).toBeGreaterThanOrEqual(TABLE.ballR - 1e-6);
      expect(b.x).toBeLessThanOrEqual(TABLE.w - TABLE.ballR + 1e-6);
      expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
    }
  });

  it("a hard break contacts the rack", () => {
    const res = runShot(rackNineBall(), { angle: 0, power: 1 });
    expect(res.firstContact).not.toBeNull();
  });
});

describe.each([
  ["EIGHTBALL", eightBallEngine],
  ["NINEBALL", nineBallEngine],
  ["SNOOKER", snookerEngine],
] as const)("%s engine", (_name, engine) => {
  it("rejects out-of-turn / malformed shots and accepts bot candidates", () => {
    const s = engine.init({ seats: 2 }, rng()) as CueState;
    expect(engine.validate!(s, 1, { type: "SHOOT", angle: 0, power: 0.5 })).toBe(false); // not their turn
    expect(engine.validate!(s, 0, { type: "SHOOT", angle: 0, power: 0 } as CueAction)).toBe(false); // no power
    const cand = engine.legalActions(s, 0);
    expect(cand.length).toBeGreaterThan(0);
    expect(engine.validate!(s, 0, cand[0]!)).toBe(true);
  });

  it("bots aim and sink balls (make progress)", () => {
    let s = engine.init({ seats: 2 }, rng()) as CueState;
    const onTable = (st: CueState) => st.balls.filter((b) => !b.potted && b.id !== 0).length;
    const start = onTable(s);
    let minSeen = start;
    for (let i = 0; i < 80 && !engine.isTerminal(s); i++) {
      const a = engine.legalActions(s, s.turn)[0]!; // best-ranked ghost-ball shot
      s = engine.reduce(s, a, rng()).state as CueState;
      minSeen = Math.min(minSeen, onTable(s));
    }
    // With real aiming the best shot pots a meaningful share over 80 attempts.
    expect(minSeen).toBeLessThan(start - 1);
  });

  it("plays many bot shots without throwing and conserves the ball set", () => {
    let s = engine.init({ seats: 2 }, rng()) as CueState;
    const ballCount = (st: CueState) => st.balls.length;
    const count0 = ballCount(s);
    for (let i = 0; i < 120 && !engine.isTerminal(s); i++) {
      const seat = s.turn;
      const actions = engine.legalActions(s, seat);
      const a = actions[i % actions.length]!;
      const out = engine.reduce(s, a, rng());
      s = out.state as CueState;
      expect(out.events.some((e) => e.type === "SHOT")).toBe(true);
      expect(ballCount(s)).toBe(count0); // balls are re-spotted, never lost from the array
      expect(s.turn === 0 || s.turn === 1).toBe(true);
    }
    const score = engine.score(s);
    expect(score).toHaveLength(2);
  });
});

// ── 8-ball rules ─────────────────────────────────────────────────────────────

describe("EIGHTBALL rack (WPA)", () => {
  it("places the 8 in the exact centre of the rack", () => {
    const balls = rackEightBall();
    const eight = balls.find((b) => b.id === 8)!;
    const rows = balls.filter((b) => b.id !== 0);
    const apex = rows.reduce((m, b) => (b.x < m.x ? b : m), rows[0]!);
    // Centre ball sits on the table's mid-line, two rows back from the apex.
    expect(eight.y).toBeCloseTo(TABLE.h / 2, 6);
    expect(eight.x).toBeGreaterThan(apex.x);
    // Back-row corners must split one solid (1–7) / one stripe (9–15).
    const backX = Math.max(...rows.map((b) => b.x));
    const back = rows.filter((b) => Math.abs(b.x - backX) < 1e-6).sort((a, b) => a.y - b.y);
    const corners = [back[0]!.id, back[back.length - 1]!.id];
    const solids = corners.filter((id) => id <= 7).length;
    expect(solids).toBe(1); // exactly one solid corner, one stripe corner
  });
});

describe("EIGHTBALL rules", () => {
  it("re-spots the 8 on the break instead of ending the game", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    // Break layout crafted so the 8 goes straight into the (2,1) corner.
    const s: CueStateX = {
      ...s0,
      balls: [ball(0, 1.0, 0.5), ball(8, 1.5, 0.75), ball(1, 0.2, 0.2)],
    };
    const out = eightBallEngine.reduce(s, aimAt(find(s, 0), find(s, 8), 0.9), rng());
    const n = out.state;
    expect(n.winner).toBeNull();
    expect(n.phase).toBe("PLAY");
    expect(find(n, 8).potted).toBe(false); // back on the foot spot
    expect(find(n, 8).x).toBeCloseTo(1.35, 1);
    expect(n.message).toBe("eightBreakRespot");
  });

  it("potting the 8 illegally mid-game still loses", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    const s: CueStateX = {
      ...s0,
      shotNo: 3,
      ballInHand: false,
      balls: [ball(0, 1.0, 0.5), ball(8, 1.5, 0.75), ball(1, 0.2, 0.2)],
    };
    const out = eightBallEngine.reduce(s, aimAt(find(s, 0), find(s, 8), 0.9), rng());
    expect(out.state.winner).toBe(1); // shooter 0 loses
    expect(out.state.message).toBe("eightLoss");
  });

  it("potting the 8 legally wins", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    const s: CueStateX = {
      ...s0,
      shotNo: 9,
      open: false,
      groups: ["solids", "stripes"],
      ballInHand: false,
      // all solids gone: shooter 0 is on the 8
      balls: [ball(0, 1.0, 0.5), ball(8, 1.5, 0.75), ball(9, 0.2, 0.2)],
    };
    const out = eightBallEngine.reduce(s, aimAt(find(s, 0), find(s, 8), 0.9), rng());
    expect(out.state.winner).toBe(0);
    expect(out.state.message).toBe("eightWin");
  });

  it("does not assign groups on a foul while the table is open", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    // cue → 8 (illegal first contact on an open table) → combo pots the 1.
    const s: CueStateX = {
      ...s0,
      shotNo: 2,
      ballInHand: false,
      balls: [ball(0, 1.0, 0.5), ball(8, 1.4, 0.7), ball(1, 1.7, 0.85), ball(9, 0.2, 0.8)],
    };
    const out = eightBallEngine.reduce(s, aimAt(find(s, 0), find(s, 8), 1), rng());
    const n = out.state;
    expect(find(n, 1).potted).toBe(true); // the combo pot stands…
    expect(n.message).toBe("eightFirstOpen"); // …but the shot is a foul
    expect(n.open).toBe(true); // fouls never lock groups
    expect(n.groups).toEqual([null, null]);
    expect(n.turn).toBe(1);
    expect(n.ballInHand).toBe(true);
  });

  it("restricts the break placement to behind the head string (pool only)", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    const shot = (cueX: number, cueY: number): CueActionX => ({ type: "SHOOT", angle: 0, power: 0.8, cueX, cueY });
    expect(eightBallEngine.validate!(s0, 0, shot(1.2, 0.5))).toBe(false); // past the line
    expect(eightBallEngine.validate!(s0, 0, shot(0.3, 0.5))).toBe(true); // behind the line
    // Mid-game ball-in-hand is full table.
    const mid: CueStateX = { ...s0, shotNo: 4, ballInHand: true };
    expect(eightBallEngine.validate!(mid, 0, shot(1.2, 0.5))).toBe(true);
  });

  it("stores the shot's animation length for server pacing", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    const out = eightBallEngine.reduce(s0, { type: "SHOOT", angle: 0, power: 1 }, rng());
    expect(out.state.lastShotMs).toBeGreaterThan(500);
  });
});

// ── 9-ball rules ─────────────────────────────────────────────────────────────

describe("NINEBALL push-out", () => {
  it("offers a push-out on the shot after the break, then lets the opponent pass", () => {
    const s0 = nineBallEngine.init({ seats: 2 }, rng());
    const s1 = nineBallEngine.reduce(s0, { type: "SHOOT", angle: 0.013, power: 0.95 }, rng()).state;
    expect(s1.winner).toBeNull();
    expect(s1.pushAvail).toBe(true);

    const pusher = s1.turn;
    // A gentle nudge away from the pack: normally a "no contact" foul, but
    // legal as a push-out.
    const push: CueActionX = { type: "SHOOT", angle: Math.PI, power: 0.1, pushOut: true };
    expect(nineBallEngine.validate!(s1, pusher, push)).toBe(true);
    const s2 = nineBallEngine.reduce(s1, push, rng()).state;
    expect(s2.message).toBe("pushOut");
    expect(s2.ballInHand).toBe(false); // NOT a foul
    expect(s2.turn).toBe(pusher === 0 ? 1 : 0);
    expect(s2.pushDecision).toBe(true);
    expect(s2.pushAvail).toBe(false); // only the one shot after the break

    // The opponent may hand the shot right back.
    expect(nineBallEngine.validate!(s2, s2.turn, { type: "PASS" })).toBe(true);
    const s3 = nineBallEngine.reduce(s2, { type: "PASS" }, rng()).state;
    expect(s3.turn).toBe(pusher);
    expect(s3.pushDecision).toBe(false);
    // No new shot to animate: same shotNo, zero animation time.
    expect(s3.shotNo).toBe(s2.shotNo);
    expect(s3.lastShotMs).toBe(0);
    // A second push-out is not available.
    expect(nineBallEngine.validate!(s3, pusher, push)).toBe(false);
  });

  it("rejects PASS outside a push-out decision", () => {
    const s0 = nineBallEngine.init({ seats: 2 }, rng());
    expect(nineBallEngine.validate!(s0, 0, { type: "PASS" })).toBe(false);
  });

  it("fouls use machine codes (hitting nothing → noContact + ball in hand)", () => {
    const s0 = nineBallEngine.init({ seats: 2 }, rng());
    const s: CueStateX = {
      ...s0,
      shotNo: 3,
      ballInHand: false,
      balls: [ball(0, 0.5, 0.5), ball(1, 1.5, 0.5), ball(9, 1.8, 0.5)],
    };
    const out = nineBallEngine.reduce(s, { type: "SHOOT", angle: Math.PI / 2, power: 0.1 }, rng());
    expect(out.state.message).toBe("noContact");
    expect(out.state.turn).toBe(1);
    expect(out.state.ballInHand).toBe(true);
  });
});

describe("NINEBALL three-foul rule (WPA)", () => {
  // A gentle sideways nudge that contacts nothing → a "no contact" foul.
  const miss: CueActionX = { type: "SHOOT", angle: Math.PI / 2, power: 0.05 };
  const foulState = (fouls: [number, number]): CueStateX => ({
    ...(nineBallEngine.init({ seats: 2 }, rng()) as CueStateX),
    shotNo: 3,
    ballInHand: false,
    turn: 0,
    fouls,
    balls: [ball(0, 0.5, 0.5), ball(1, 1.8, 0.9), ball(9, 1.9, 0.9)],
  });

  it("loses the rack on the third consecutive foul", () => {
    const o1 = nineBallEngine.reduce(foulState([0, 0]), miss, rng());
    expect(o1.state.message).toBe("noContact");
    expect(o1.state.fouls).toEqual([1, 0]);
    expect(o1.state.winner).toBeNull();

    const o2 = nineBallEngine.reduce(foulState([1, 0]), miss, rng());
    expect(o2.state.fouls).toEqual([2, 0]); // the second foul is the warning
    expect(o2.state.winner).toBeNull();

    const o3 = nineBallEngine.reduce(foulState([2, 0]), miss, rng());
    expect(o3.state.fouls).toEqual([3, 0]);
    expect(o3.state.winner).toBe(1); // opponent wins the rack outright
    expect(o3.state.message).toBe("threeFoul");
    expect(o3.state.phase).toBe("DONE");
    expect(o3.events.some((e) => e.type === "WIN" && e.seat === 1)).toBe(true);
  });

  it("resets a seat's foul count after a legal shot", () => {
    // Seat 0 sits on two fouls, then legally pots the 1 → counter back to zero.
    const s: CueStateX = {
      ...(nineBallEngine.init({ seats: 2 }, rng()) as CueStateX),
      shotNo: 3,
      ballInHand: false,
      turn: 0,
      fouls: [2, 0],
      balls: [ball(0, 1.0, 0.5), ball(1, 1.5, 0.75), ball(9, 0.2, 0.2)],
    };
    const out = nineBallEngine.reduce(s, aimAt(find(s, 0), find(s, 1), 0.9), rng());
    expect(find(out.state, 1).potted).toBe(true);
    expect(out.state.fouls).toEqual([0, 0]);
    expect(out.state.winner).toBeNull();
    expect(out.state.turn).toBe(0); // continues after a legal pot
  });
});

// ── Snooker rules ────────────────────────────────────────────────────────────

const snookerState = (balls: Ball[], patch: Partial<CueStateX> = {}): CueStateX => ({
  ...(snookerEngine.init({ seats: 2 }, rng()) as CueStateX),
  ballInHand: false,
  shotNo: 4,
  balls,
  ...patch,
});

describe("SNOOKER rules", () => {
  it("re-spots a colour potted on a foul (frame keeps its ball set)", () => {
    // On a red, but the blue is potted straight in: foul, worth 5, blue returns.
    const s = snookerState([ball(0, 0.6, 0.3), ball(5, 1.0, 0.5), ball(11, 0.2, 0.9)]);
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 5), 1), rng());
    const n = out.state;
    expect(n.message).toBe("needRed");
    expect(n.scores).toEqual([0, 5]); // max(4, value of the blue)
    expect(find(n, 5).potted).toBe(false); // re-spotted
    // On (or right next to) its spot — the cue may rest against the spot, in
    // which case respot() slides to the nearest free point.
    expect(Math.abs(find(n, 5).x - SNOOKER_SPOTS[5]![0])).toBeLessThan(0.1);
    expect(find(n, 5).y).toBeCloseTo(SNOOKER_SPOTS[5]![1], 5);
    expect(n.turn).toBe(1);
    expect(n.expect).toBe("red"); // reds remain
  });

  it("gives a colour of choice after the last red, re-spotting it", () => {
    // Cue → target → the (2,1) corner on a 0.8-slope diagonal (clean pot).
    const cueAt: [number, number] = [1.45, 0.56];
    const targetAt: [number, number] = [1.7, 0.76];

    // Shot 1: pot the LAST red → the striker stays on and is on a free colour.
    const colours = [2, 3, 4, 5, 6, 7].map((id) => ball(id, SNOOKER_SPOTS[id]![0], SNOOKER_SPOTS[id]![1]));
    const s1 = snookerState([ball(0, ...cueAt), ball(11, ...targetAt), ...colours]);
    const o1 = snookerEngine.reduce(s1, aimAt(find(s1, 0), find(s1, 11), 0.9), rng());
    const n1 = o1.state;
    expect(find(n1, 11).potted).toBe(true);
    expect(n1.scores).toEqual([1, 0]);
    expect(n1.turn).toBe(0); // continues
    expect(n1.expect).toBe("colour");
    expect(n1.freeColour).toBe(true);

    // Shot 2: the BLACK is a legal choice — it scores 7 and comes back up.
    const others = [2, 3, 4, 5, 6].map((id) => ball(id, SNOOKER_SPOTS[id]![0], SNOOKER_SPOTS[id]![1]));
    const s2 = snookerState([ball(0, ...cueAt), ball(7, ...targetAt), ...others], {
      expect: "colour",
      freeColour: true,
      turn: 0,
    });
    const o2 = snookerEngine.reduce(s2, aimAt(find(s2, 0), find(s2, 7), 0.9), rng());
    const n2 = o2.state;
    expect(n2.message).toBe("+7");
    expect(n2.scores).toEqual([7, 0]);
    expect(find(n2, 7).potted).toBe(false); // re-spotted
    expect(find(n2, 7).x).toBeCloseTo(SNOOKER_SPOTS[7]![0], 5);
    expect(n2.freeColour).toBe(false); // one shot only
    expect(n2.expect).toBe("colour"); // end-game starts at yellow

    // Shot 3 (end-game, no free colour): the black is now the WRONG ball.
    const s3 = snookerState([ball(0, ...cueAt), ball(7, ...targetAt), ...others], { expect: "colour", turn: 0 });
    const o3 = snookerEngine.reduce(s3, aimAt(find(s3, 0), find(s3, 7), 0.9), rng());
    expect(o3.state.message).toBe("wrongBall");
    expect(o3.state.scores).toEqual([0, 7]); // foul worth the black
    expect(find(o3.state, 7).potted).toBe(false); // re-spotted after the foul
  });

  it("restricts ball-in-hand to the D", () => {
    const s = { ...(snookerEngine.init({ seats: 2 }, rng()) as CueStateX), ballInHand: true };
    const shot = (cueX: number, cueY: number): CueActionX => ({ type: "SHOOT", angle: 0, power: 0.5, cueX, cueY });
    expect(snookerEngine.validate!(s, 0, shot(0.35, 0.5))).toBe(true); // inside the D
    expect(snookerEngine.validate!(s, 0, shot(0.6, 0.5))).toBe(false); // past baulk
    expect(snookerEngine.validate!(s, 0, shot(0.42, 0.9))).toBe(false); // baulk line, outside the D arc
  });

  it("awards a free ball when a foul leaves the striker snookered", () => {
    // The black sits dead between the cue and the only red.
    const s = snookerState([ball(0, 0.5, 0.5), ball(7, 1.2, 0.5), ball(11, 1.9, 0.5)], { turn: 0 });
    // Shooter 0 nudges the cue sideways, touching nothing: foul.
    const o1 = snookerEngine.reduce(s, { type: "SHOOT", angle: Math.PI / 2, power: 0.05 }, rng());
    const n1 = o1.state;
    expect(n1.message).toBe("noContact");
    expect(n1.scores).toEqual([0, 4]);
    expect(n1.freeBall).toBe(true); // seat 1 cannot see the red

    // Seat 1 may now legally strike the black first (free ball).
    const o2 = snookerEngine.reduce(n1, aimAt(find(n1, 0), find(n1, 7), 0.4), rng());
    const n2 = o2.state;
    expect(n2.scores).toEqual([0, 4]); // no foul points conceded
    expect(n2.message).toBe(""); // legal shot, nothing potted
    expect(n2.freeBall).toBe(false); // one stroke only
    expect(n2.turn).toBe(0);
  });

  it("calls a foul and a miss when the striker hits no ball on", () => {
    // On a red, the cue is nudged into empty space — no contact at all.
    const s = snookerState([ball(0, 0.5, 0.5), ball(11, 1.8, 0.2)], { turn: 0 });
    const out = snookerEngine.reduce(s, { type: "SHOOT", angle: -Math.PI / 2, power: 0.05 }, rng());
    const n = out.state;
    expect(n.message).toBe("noContact");
    expect(n.miss).toBe(true); // referee/host can offer the standard replay
    expect(out.events.some((e) => e.type === "FOUL")).toBe(true);
    expect(n.scores).toEqual([0, 4]);
  });

  it("does not flag a miss on a legal shot", () => {
    // Cleanly pot a red on a 0.8-slope diagonal into the (2,1) corner.
    const cueAt: [number, number] = [1.45, 0.56];
    const targetAt: [number, number] = [1.7, 0.76];
    const colours = [2, 3, 4, 5, 6, 7].map((id) => ball(id, SNOOKER_SPOTS[id]![0], SNOOKER_SPOTS[id]![1]));
    const s = snookerState([ball(0, ...cueAt), ball(11, ...targetAt), ...colours], { turn: 0 });
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 11), 0.9), rng());
    expect(find(out.state, 11).potted).toBe(true);
    expect(out.state.miss).toBe(false);
  });

  it("re-spots the black instead of ending level (no draws)", () => {
    // Potting the final black would level the frame 30–30.
    const s = snookerState([ball(0, 1.65, 0.7), ball(7, 1.75, 0.5)], {
      expect: "colour",
      scores: [23, 30],
      turn: 0,
    });
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 7), 0.9), rng());
    const n = out.state;
    expect(n.phase).toBe("PLAY");
    expect(n.winner).toBeNull();
    expect(n.message).toBe("respotBlack");
    expect(n.scores).toEqual([30, 30]);
    expect(find(n, 7).potted).toBe(false); // black back on its spot
    expect(n.ballInHand).toBe(true); // incoming striker plays from the D
    expect(n.turn).toBe(1);

    // With a lead the same clearance ends the frame.
    const s2 = snookerState([ball(0, 1.65, 0.7), ball(7, 1.75, 0.5)], {
      expect: "colour",
      scores: [30, 23],
      turn: 0,
    });
    const o2 = snookerEngine.reduce(s2, aimAt(find(s2, 0), find(s2, 7), 0.9), rng());
    expect(o2.state.winner).toBe(0);
    expect(o2.state.message).toBe("cleared");
  });
});
