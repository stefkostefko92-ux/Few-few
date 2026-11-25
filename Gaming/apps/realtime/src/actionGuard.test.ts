import { describe, expect, it } from "vitest";
import { MAX_ACTION_DEPTH, actionShapeOk } from "./actionGuard.js";

/** Build `[[[…]]]` nested `depth` levels deep. */
function nested(depth: number): unknown {
  const root: unknown[] = [];
  let cur = root;
  for (let i = 1; i < depth; i++) {
    const next: unknown[] = [];
    cur.push(next);
    cur = next;
  }
  return root;
}

describe("actionShapeOk — realtime DoS guard (2026-09-14 audit)", () => {
  it("rejects the 6 KB nested-array payload that crashed the node, without recursing", () => {
    const wire = JSON.stringify(nested(3000));
    expect(wire.length).toBeLessThan(16_384); // fits under the socket byte cap
    expect(() => actionShapeOk(JSON.parse(wire))).not.toThrow();
    expect(actionShapeOk(JSON.parse(wire))).toBe(false);
  });

  it("rejects anything deeper than the cap and accepts the cap itself", () => {
    expect(actionShapeOk(nested(MAX_ACTION_DEPTH))).toBe(true);
    expect(actionShapeOk(nested(MAX_ACTION_DEPTH + 1))).toBe(false);
  });

  it("rejects wide payloads (many nodes) even when shallow", () => {
    expect(actionShapeOk({ cards: Array.from({ length: 5000 }, (_, i) => i) })).toBe(false);
  });

  it("accepts every realistic action shape", () => {
    for (const a of [
      { type: "PASS" },
      { type: "PLAY", card: "QS" },
      { type: "MOVE", from: "e2", to: "e4", promotion: null },
      { type: "SHOT", angle: 1.2, power: 0.8, spin: { x: 0.1, y: -0.2 } },
      { type: "MELD", cards: ["7H", "8H", "9H"] },
      "PASS",
      3,
      null,
    ]) {
      expect(actionShapeOk(a)).toBe(true);
    }
  });
});
