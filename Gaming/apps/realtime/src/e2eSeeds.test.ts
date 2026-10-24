import { describe, expect, it } from "vitest";
import { parseE2eSeeds } from "./e2eSeeds.js";

describe("parseE2eSeeds", () => {
  it("maps games to pinned seeds", () => {
    const m = parseE2eSeeds("RUMMY=e2e-rummy-1, war = w-7");
    expect(m.get("RUMMY")).toBe("e2e-rummy-1");
    expect(m.get("WAR")).toBe("w-7");
    expect(m.size).toBe(2);
  });

  it("is empty when unset — every match gets a fresh random seed", () => {
    expect(parseE2eSeeds(undefined).size).toBe(0);
    expect(parseE2eSeeds("").size).toBe(0);
  });

  it("ignores unknown games, empty seeds and junk", () => {
    const m = parseE2eSeeds("HOLDEM=x,RUMMY=,=y,garbage,DOMINO=d=1");
    expect([...m.keys()]).toEqual(["DOMINO"]);
    expect(m.get("DOMINO")).toBe("d=1");
  });
});
