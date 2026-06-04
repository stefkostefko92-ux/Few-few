import { describe, expect, it } from "vitest";
import { GAME_KEYS } from "@aso/shared";
import { GAME_CATALOG } from "./games";

describe("lobby catalog", () => {
  it("lists all 22 games exactly once", () => {
    expect(GAME_CATALOG).toHaveLength(22);
    const keys = GAME_CATALOG.map((g) => g.key);
    expect(new Set(keys).size).toBe(22);
  });

  it("only references valid game keys from the shared roster", () => {
    for (const game of GAME_CATALOG) {
      expect(GAME_KEYS).toContain(game.key);
    }
  });
});
