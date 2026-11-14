import { describe, expect, it } from "vitest";
import { beloteSeatPos } from "./seats";

describe("Белот: местата обикалят обратно на часовниковата стрелка", () => {
  it("след мен е играчът вдясно, срещу мен — партньорът, преди мен — вляво", () => {
    expect(beloteSeatPos(0, 0)).toBe("bottom");
    expect(beloteSeatPos(1, 0)).toBe("right");
    expect(beloteSeatPos(2, 0)).toBe("top");
    expect(beloteSeatPos(3, 0)).toBe("left");
  });

  it("важи от всяко място: seat+1 винаги е вдясно", () => {
    for (let me = 0; me < 4; me++) {
      expect(beloteSeatPos((me + 1) % 4, me)).toBe("right");
      expect(beloteSeatPos((me + 2) % 4, me)).toBe("top");
      expect(beloteSeatPos((me + 3) % 4, me)).toBe("left");
    }
  });
});
