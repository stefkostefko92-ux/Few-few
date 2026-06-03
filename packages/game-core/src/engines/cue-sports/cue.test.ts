import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { runShot, TABLE } from "@aso/shared";
import { rackNineBall } from "./racks.js";
import { eightBallEngine, nineBallEngine, snookerEngine, type CueAction, type CueState } from "./cue.js";

const rng = () => new SeededRng("cue-test");

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
