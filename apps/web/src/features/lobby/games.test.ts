import { describe, expect, it } from "vitest";
import { GAME_KEYS } from "@aso/shared";
import { GAME_CATALOG } from "./games";

describe("lobby catalog", () => {
  it("lists all 18 games exactly once", () => {
    expect(GAME_CATALOG).toHaveLength(18);
    const keys = GAME_CATALOG.map((g) => g.key);
    expect(new Set(keys).size).toBe(18);
  });

  it("only references valid game keys from the shared roster", () => {
    for (const game of GAME_CATALOG) {
      expect(GAME_KEYS).toContain(game.key);
    }
  });
});
