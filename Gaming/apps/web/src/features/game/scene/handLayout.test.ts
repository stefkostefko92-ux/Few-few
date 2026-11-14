import { describe, expect, it } from "vitest";
import { handTargetFor, handWidth } from "./handLayout";

/** Felt width on a phone: viewport − stage (2×16) − rail (2×20). */
const felt = (vw: number): number => vw - 72;

describe("hand fan — fits the felt on every screen", () => {
  it.each([360, 375, 390, 412, 430])(
    "%ipx phone: 6 (Сантасе) and 8 (Белот) cards stay inside the felt",
    (vw) => {
      const target = handTargetFor(vw);
      expect(target).toBeLessThanOrEqual(felt(vw));
      expect(handWidth(6, "md", target)).toBeLessThanOrEqual(felt(vw));
      expect(handWidth(8, "md", target)).toBeLessThanOrEqual(felt(vw));
    },
  );

  it("390px phone: a 13-card bridge hand fits too", () => {
    expect(handWidth(13, "md", handTargetFor(390))).toBeLessThanOrEqual(felt(390));
  });

  it("desktop and tablet keep the wide fan (600px cap)", () => {
    expect(handTargetFor(1366)).toBe(600);
    expect(handTargetFor(768)).toBe(600);
    expect(handTargetFor(700)).toBe(574);
  });
});
