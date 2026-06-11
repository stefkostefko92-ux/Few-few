import { describe, expect, it } from "vitest";
import { GAME_ENGINE, GAME_KEYS, isGameKey } from "./games.js";

describe("game roster", () => {
  it("has all 22 games", () => {
    expect(GAME_KEYS).toHaveLength(22);
  });

  it("maps every game to an engine pattern", () => {
    for (const key of GAME_KEYS) {
      expect(GAME_ENGINE[key]).toBeTruthy();
    }
  });

  it("recognises valid game keys", () => {
    expect(isGameKey("CHESS")).toBe(true);
    expect(isGameKey("NOPE")).toBe(false);
  });
});
