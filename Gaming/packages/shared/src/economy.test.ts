import { describe, expect, it } from "vitest";
import { BGN_PER_EUR, bgnCents, formatDualPrice } from "./index.js";

describe("двойно обозначаване на цени (ЗВЕРБ)", () => {
  it("превалутира по фиксирания курс 1.95583 със закръгляне до стотинка", () => {
    expect(BGN_PER_EUR).toBe(1.95583);
    expect(bgnCents(199)).toBe(389); // €1.99 → 3.8921… → 3.89 лв.
    expect(bgnCents(399)).toBe(780); // €3.99 → 7.8038… → 7.80 лв.
    expect(bgnCents(499)).toBe(976); // €4.99 → 9.7596… → 9.76 лв.
    expect(bgnCents(999)).toBe(1954); // €9.99 → 19.5387… → 19.54 лв.
    expect(bgnCents(1999)).toBe(3910); // €19.99 → 39.0970… → 39.10 лв.
  });

  it("показва двете цени с еднаква видимост в един низ", () => {
    expect(formatDualPrice(399)).toBe("€3.99 / 7.80 лв.");
    expect(formatDualPrice(1999)).toBe("€19.99 / 39.10 лв.");
    expect(formatDualPrice(0)).toBe("€0.00 / 0.00 лв.");
  });
});
