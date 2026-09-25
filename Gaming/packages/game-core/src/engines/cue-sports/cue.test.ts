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
    // WPA: разбиващият продължава (без фал) — няма бяла в ръка.
    expect(n.turn).toBe(0);
    expect(n.ballInHand).toBe(false);
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
    // Законно разбиване (ботът предлага само законни — WPA: ≥4 топки до борд или вкарана).
    const brk = nineBallEngine.legalActions(s0, 0)[0]!;
    const s1 = nineBallEngine.reduce(s0, brk, rng()).state;
    expect(s1.message).not.toBe("illegalBreak");
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
    // На своя спот, или — ако бялата е спряла върху него — на най-високия
    // свободен спот (тук черният; WPBSA 3.4).
    const blue = find(n, 5);
    const onSpot = (id: number) =>
      Math.abs(blue.x - SNOOKER_SPOTS[id]![0]) < 1e-9 && Math.abs(blue.y - SNOOKER_SPOTS[id]![1]) < 1e-9;
    expect(onSpot(5) || onSpot(7)).toBe(true);
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
    expect(n.miss).toBe(true);
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
    // Кой играе първи — жребий от SeededRng (първото int(2) на потока).
    expect(n.turn).toBe(rng().int(2));

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

// ── Поправки по правилата (WPA / WPBSA) ─────────────────────────────────────

// Права линия под наклон 0.8 към ъгъла (2,1): бяла → A → B → джоб. Комбинация.
const DIAG_CUE: [number, number] = [1.45, 0.56];
const DIAG_MID: [number, number] = [1.575, 0.66];
const DIAG_TGT: [number, number] = [1.7, 0.76];
const redsOff = (n: number): Ball[] => Array.from({ length: n }, (_, i) => ball(11 + i, 0.15 + 0.07 * i, 0.93));
const pottedBall = (id: number): Ball => ({ ...ball(id, -1, -1), potted: true });

describe("EIGHTBALL — поправки", () => {
  it("последна своя + осмицата в един удар (първо осмицата) е загуба, не победа", () => {
    // Seat 0 (плътни) има още 1-цата — НЕ е на осмицата преди удара.
    const s: CueStateX = {
      ...eightBallEngine.init({ seats: 2 }, rng()),
      shotNo: 10,
      open: false,
      groups: ["solids", "stripes"],
      ballInHand: false,
      balls: [ball(0, 0.8556, 0.4499), ball(1, 0.2101, 0.2841), ball(8, 1.5537, 0.8795), ball(9, 0.05, 0.5)],
    };
    const out = eightBallEngine.reduce(s, { type: "SHOOT", angle: 0.3578, power: 1 }, rng());
    const shot = out.events.find((e) => e.type === "SHOT");
    expect(shot && shot.type === "SHOT" ? shot.potted : []).toEqual(expect.arrayContaining([8, 1]));
    expect(out.state.message).toBe("eightLoss");
    expect(out.state.winner).toBe(1);
  });

  it("удар първо в осмицата, докато имаш своя топка, е фал", () => {
    const s: CueStateX = {
      ...eightBallEngine.init({ seats: 2 }, rng()),
      shotNo: 6,
      open: false,
      groups: ["solids", "stripes"],
      ballInHand: false,
      balls: [ball(0, 0.5, 0.5), ball(8, 1.0, 0.5), ball(1, 0.2, 0.9), ball(9, 0.2, 0.1)],
    };
    const out = eightBallEngine.reduce(s, aimAt(find(s, 0), find(s, 8), 0.4), rng());
    expect(out.state.message).toBe("wrongBall");
    expect(out.state.turn).toBe(1);
  });

  it("незаконно разбиване: фал, входящият приема масата без бяла в ръка", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    const out = eightBallEngine.reduce(s0, { type: "SHOOT", angle: 0, power: 0.3 }, rng());
    expect(out.state.message).toBe("illegalBreak");
    expect(out.state.turn).toBe(1);
    expect(out.state.ballInHand).toBe(false);
    expect(out.events.some((e) => e.type === "FOUL")).toBe(true);
  });

  it("ботът разбива законно", () => {
    const s0 = eightBallEngine.init({ seats: 2 }, rng());
    const a = eightBallEngine.legalActions(s0, 0)[0]!;
    expect(eightBallEngine.validate!(s0, 0, a)).toBe(true);
    expect(eightBallEngine.reduce(s0, a, rng()).state.message).not.toBe("illegalBreak");
  });
});

describe("NINEBALL — поправки", () => {
  it("незаконно разбиване: фал, бяла в ръка, без push-out", () => {
    const s0 = nineBallEngine.init({ seats: 2 }, rng());
    const out = nineBallEngine.reduce(s0, { type: "SHOOT", angle: 0, power: 0.3 }, rng());
    expect(out.state.message).toBe("illegalBreak");
    expect(out.state.turn).toBe(1);
    expect(out.state.ballInHand).toBe(true);
    expect(out.state.pushAvail).toBe(false);
  });

  it("вкарана при фал 9-ка се връща на foot spot (върха на рака)", () => {
    // Първо ударена е 9-ката (най-ниската е 1) → фал; 9-ката пада и се връща.
    const s: CueStateX = {
      ...nineBallEngine.init({ seats: 2 }, rng()),
      shotNo: 5,
      ballInHand: false,
      balls: [ball(0, ...DIAG_CUE), ball(9, ...DIAG_TGT), ball(1, 0.2, 0.2)],
    };
    const out = nineBallEngine.reduce(s, aimAt(find(s, 0), find(s, 9), 0.9), rng());
    expect(out.state.message).toBe("lowestFirst");
    const nine = find(out.state, 9);
    expect(nine.potted).toBe(false);
    expect(nine.x).toBeCloseTo(rackNineBall().find((b) => b.id === 1)!.x, 6);
    expect(nine.y).toBeCloseTo(TABLE.h / 2, 6);
  });

  it("предупреждение „twoFouls“ след втория пореден фал", () => {
    const s: CueStateX = {
      ...(nineBallEngine.init({ seats: 2 }, rng()) as CueStateX),
      shotNo: 3,
      ballInHand: false,
      turn: 0,
      fouls: [1, 0],
      balls: [ball(0, 0.5, 0.5), ball(1, 1.8, 0.9), ball(9, 1.9, 0.9)],
    };
    const out = nineBallEngine.reduce(s, { type: "SHOOT", angle: Math.PI / 2, power: 0.05 }, rng());
    expect(out.events).toContainEqual({ type: "WARNING", seat: 0, reason: "twoFouls" });
    const first = nineBallEngine.reduce({ ...s, fouls: [0, 0] }, { type: "SHOOT", angle: Math.PI / 2, power: 0.05 }, rng());
    expect(first.events.some((e) => e.type === "WARNING")).toBe(false);
  });
});

describe("SNOOKER — поправки", () => {
  const allColours = (skip: number[] = []) =>
    [2, 3, 4, 5, 6, 7].filter((id) => !skip.includes(id)).map((id) => ball(id, SNOOKER_SPOTS[id]![0], SNOOKER_SPOTS[id]![1]));
  const onlyBlackState = (scores: [number, number]) =>
    snookerState([ball(0, 0.3, 0.5), ball(7, 1.75, 0.5), ...[2, 3, 4, 5, 6].map(pottedBall)], {
      expect: "colour",
      scores,
      turn: 0,
    });
  // Бялата се търкулва назад в бордa и не докосва нищо → noContact (7 т.).
  const noContact: CueActionX = { type: "SHOOT", angle: Math.PI, power: 0.3 };

  it("само черната: фалът приключва фрейма", () => {
    const out = snookerEngine.reduce(onlyBlackState([60, 50]), noContact, rng());
    expect(out.state.message).toBe("noContact");
    expect(out.state.scores).toEqual([60, 57]);
    expect(out.state.phase).toBe("DONE");
    expect(out.state.winner).toBe(0); // водещият печели, въпреки фала
  });

  it("само черната: фал до равенство → повторна черна, жребий, бяла в ръка", () => {
    const out = snookerEngine.reduce(onlyBlackState([60, 53]), noContact, rng());
    const n = out.state;
    expect(n.scores).toEqual([60, 60]);
    expect(n.phase).toBe("PLAY");
    expect(n.message).toBe("respotBlack");
    expect(out.events).toContainEqual({ type: "FOUL", seat: 0, reason: "noContact" });
    expect(n.ballInHand).toBe(true);
    expect(n.turn).toBe(rng().int(2));
    expect(find(n, 7).x).toBeCloseTo(SNOOKER_SPOTS[7]![0], 6);
  });

  it("жребият при повторна черна дава и двата изхода при различни seed-ове", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const out = snookerEngine.reduce(onlyBlackState([60, 53]), noContact, new SeededRng(`toss-${i}`));
      seen.add(out.state.turn);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it("цветна по избор: вкарана цветна ≠ първо ударената → фал за по-високата", () => {
    // Удар в жълтата, жълтата вкарва черната (комбинация) — фал 7, не +7.
    const s = snookerState(
      [ball(0, ...DIAG_CUE), ball(2, ...DIAG_MID), ball(7, ...DIAG_TGT), ...redsOff(3)],
      { expect: "colour", turn: 0 },
    );
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 2), 0.9), rng());
    const shot = out.events.find((e) => e.type === "SHOT");
    expect(shot && shot.type === "SHOT" ? shot.potted : []).toContain(7);
    expect(out.state.message).toBe("wrongPot");
    expect(out.state.scores).toEqual([0, 7]);
    expect(find(out.state, 7).potted).toBe(false); // връща се
  });

  it("цветна по избор: наказанието е max(4, ударената) — червена вместо цветна при бяла в джоба", () => {
    // Удар в червена при цветна по избор → needColour, 4 (червената е 1).
    const s = snookerState([ball(0, 0.5, 0.5), ball(11, 1.0, 0.5), ball(12, 0.2, 0.93), ...allColours()], {
      expect: "colour",
      turn: 0,
    });
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 11), 0.3), rng());
    expect(out.state.message).toBe("needColour");
    expect(out.state.scores).toEqual([0, 4]);
  });

  it("свободна топка на червени: вкарана друга цветна (не свободната) е фал", () => {
    const s = snookerState(
      [ball(0, ...DIAG_CUE), ball(5, ...DIAG_MID), ball(6, ...DIAG_TGT), ...redsOff(2)],
      { expect: "red", freeBall: true, turn: 0 },
    );
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 5), 0.9), rng());
    expect(out.state.message).toBe("wrongPot");
    expect(out.state.scores).toEqual([0, 6]);
  });

  it("свободна топка на червени: вкараната свободна носи 1 т. и се връща", () => {
    const s = snookerState([ball(0, ...DIAG_CUE), ball(5, ...DIAG_TGT), ...redsOff(2)], {
      expect: "red",
      freeBall: true,
      turn: 0,
    });
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 5), 0.9), rng());
    expect(out.state.message).toBe("+1");
    expect(out.state.scores).toEqual([1, 0]);
    expect(find(out.state, 5).potted).toBe(false);
    expect(out.state.expect).toBe("colour");
  });

  it("свободна топка в крайната фаза: стойността на топката на ход, свободната се връща", () => {
    // На жълтата (2); свободна топка = зелената (3) → +2, зелената се връща.
    const s = snookerState([ball(0, ...DIAG_CUE), ball(3, ...DIAG_TGT), ...allColours([3])], {
      expect: "colour",
      freeBall: true,
      turn: 0,
    });
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 3), 0.9), rng());
    expect(out.state.message).toBe("+2");
    expect(out.state.scores).toEqual([2, 0]);
    expect(find(out.state, 3).potted).toBe(false);
    expect(find(out.state, 2).potted).toBe(false); // топката на ход още е на масата
  });

  it("снукериран за свободна топка = НЕ може да удари И двата ръба", () => {
    // Синята закрива само единия ръб на червената → вече е снукериран.
    const s = snookerState(
      [ball(0, 0.5, 0.5), ball(5, 1.0, 0.53), ball(11, 1.5, 0.5), ...[2, 3, 4, 6, 7].map(pottedBall)],
      { turn: 0 },
    );
    const out = snookerEngine.reduce(s, { type: "SHOOT", angle: Math.PI, power: 0.05 }, rng());
    expect(out.state.message).toBe("noContact");
    expect(out.state.freeBall).toBe(true);
  });

  it("повторно поставяне: зает собствен спот → най-високият свободен спот", () => {
    // Синият спот е зает от червена, черният и розовият — от своите топки →
    // синята отива на кафявия спот (следващият най-висок свободен).
    const s = snookerState(
      [
        ball(0, ...DIAG_CUE),
        ball(5, ...DIAG_TGT),
        ball(11, SNOOKER_SPOTS[5]![0], SNOOKER_SPOTS[5]![1]),
        ball(6, SNOOKER_SPOTS[6]![0], SNOOKER_SPOTS[6]![1]),
        ball(7, SNOOKER_SPOTS[7]![0], SNOOKER_SPOTS[7]![1]),
      ],
      { expect: "red", turn: 0 },
    );
    const out = snookerEngine.reduce(s, aimAt(find(s, 0), find(s, 5), 0.9), rng());
    expect(out.state.message).toBe("needRed");
    const blue = find(out.state, 5);
    expect(blue.potted).toBe(false);
    expect(blue.x).toBeCloseTo(SNOOKER_SPOTS[4]![0], 6);
    expect(blue.y).toBeCloseTo(SNOOKER_SPOTS[4]![1], 6);
  });

  it("разбиването е от ръка в „D“; ботът поставя бялата в „D“", () => {
    const s0 = snookerEngine.init({ seats: 2 }, rng());
    expect(s0.ballInHand).toBe(true);
    const a = snookerEngine.legalActions(s0, 0)[0]!;
    expect(a.type === "SHOOT" && a.cueX !== undefined && a.cueX <= 0.42 + 1e-9).toBe(true);
    expect(snookerEngine.validate!(s0, 0, a)).toBe(true);
  });

  it("бяла в ръка: удар без поставяне е валиден само ако бялата вече е в „D“", () => {
    const base = snookerState([ball(0, 0.6, 0.5), ...allColours(), ...redsOff(2)], { ballInHand: true });
    const shoot: CueActionX = { type: "SHOOT", angle: 0, power: 0.5 };
    expect(snookerEngine.validate!(base, 0, shoot)).toBe(false); // извън D
    const inD = { ...base, balls: base.balls.map((b) => (b.id === 0 ? { ...b, x: 0.35, y: 0.5 } : b)) };
    expect(snookerEngine.validate!(inD, 0, shoot)).toBe(true);
  });

  it("след влизане бялата се поставя ВЪТРЕ в „D“ (кафявата пречи на центъра)", () => {
    const s = snookerState([ball(0, 1.9, 0.9), ...allColours(), ...redsOff(2)], { turn: 0 });
    const out = snookerEngine.reduce(s, { type: "SHOOT", angle: Math.atan2(0.1, 0.1), power: 0.5 }, rng());
    const n = out.state;
    expect(n.message).toBe("scratch");
    expect(n.ballInHand).toBe(true);
    const cue = find(n, 0);
    expect(cue.x).toBeLessThanOrEqual(0.42 + 1e-9);
    expect((cue.x - 0.42) ** 2 + (cue.y - 0.5) ** 2).toBeLessThanOrEqual(0.18 ** 2 + 1e-9);
    expect(snookerEngine.validate!(n, n.turn, { type: "SHOOT", angle: 0, power: 0.5 })).toBe(true);
  });

  it("фал и пропуск: входящият избира — играй пак (PASS) или върни топките (REPLAY)", () => {
    const s = snookerState([ball(0, 0.5, 0.5), ball(11, 1.8, 0.2)], { turn: 0 });
    const n = snookerEngine.reduce(s, { type: "SHOOT", angle: -Math.PI / 2, power: 0.05 }, rng()).state;
    expect(n.miss).toBe(true);
    expect(n.foulChoice).toBe(true);
    expect(n.turn).toBe(1);
    expect(snookerEngine.validate!(n, 0, { type: "REPLAY" })).toBe(false); // не е негов ред
    expect(snookerEngine.validate!(n, 1, { type: "REPLAY" })).toBe(true);
    expect(snookerEngine.validate!(n, 1, { type: "PASS" })).toBe(true);

    const replay = snookerEngine.reduce(n, { type: "REPLAY" }, rng()).state;
    expect(replay.turn).toBe(0);
    expect(replay.message).toBe("missReplay");
    expect(replay.scores).toEqual([0, 4]); // наказанието остава
    expect(find(replay, 0).x).toBeCloseTo(0.5, 9); // бялата — където беше
    expect(find(replay, 0).y).toBeCloseTo(0.5, 9);
    expect(replay.foulChoice).toBe(false);
    expect(snookerEngine.validate!(replay, 0, { type: "REPLAY" })).toBe(false);

    const again = snookerEngine.reduce(n, { type: "PASS" }, rng()).state;
    expect(again.turn).toBe(0);
    expect(again.message).toBe("playAgain");
    expect(find(again, 0).y).toBeCloseTo(find(n, 0).y, 9); // масата както е
    expect(again.foulChoice).toBe(false);

    // Входящият може и просто да удари — изборът изчезва.
    const played = snookerEngine.reduce(n, aimAt(find(n, 0), find(n, 11), 0.7), rng()).state;
    expect(played.message).not.toBe("noContact");
    expect(played.foulChoice).toBe(false);
  });

  it("фал без пропуск (снукериран): само „играй пак“, без REPLAY", () => {
    const s = snookerState([ball(0, 0.5, 0.5), ball(7, 1.2, 0.5), ball(11, 1.9, 0.5)], { turn: 0 });
    const n = snookerEngine.reduce(s, { type: "SHOOT", angle: Math.PI / 2, power: 0.05 }, rng()).state;
    expect(n.miss).toBe(false);
    expect(n.foulChoice).toBe(true);
    expect(n.missReplay).toBeNull();
    expect(snookerEngine.validate!(n, 1, { type: "REPLAY" })).toBe(false);
    // „Играй пак“ оттегля свободната топка.
    const again = snookerEngine.reduce(n, { type: "PASS" }, rng()).state;
    expect(again.freeBall).toBe(false);
  });

  it("PASS в 8-ball / REPLAY извън снукър са невалидни", () => {
    const s8 = eightBallEngine.init({ seats: 2 }, rng());
    expect(eightBallEngine.validate!(s8, 0, { type: "PASS" })).toBe(false);
    expect(eightBallEngine.validate!(s8, 0, { type: "REPLAY" })).toBe(false);
    expect(eightBallEngine.validate!(s8, 0, { type: "SHOOT", angle: 0, power: "0.5" } as unknown as CueActionX)).toBe(false);
  });
});

// ── Симулация: ботове играят пълни игри до край ──────────────────────────────

describe.each([
  ["EIGHTBALL", eightBallEngine, 400],
  ["NINEBALL", nineBallEngine, 400],
  ["SNOOKER", snookerEngine, 900],
] as const)("%s — бот срещу бот до край", (_name, engine, cap) => {
  it("8 игри с различни seed-ове свършват, всички удари са валидни", () => {
    for (let g = 0; g < 8; g++) {
      const r = new SeededRng(`sim-${_name}-${g}`);
      let s = engine.init({ seats: 2 }, r) as CueStateX;
      let n = 0;
      for (; n < cap && !engine.isTerminal(s); n++) {
        const acts = engine.legalActions(s, s.turn);
        const a = acts[r.int(acts.length)]!;
        expect(engine.validate!(s, s.turn, a)).toBe(true);
        s = engine.reduce(s, a, r).state;
      }
      expect(engine.isTerminal(s)).toBe(true);
    }
  }, 120_000);
});
