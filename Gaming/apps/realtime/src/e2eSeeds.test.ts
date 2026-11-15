import { describe, expect, it } from "vitest";
import { parseE2eSeeds } from "./e2eSeeds.js";

describe("parseE2eSeeds — фиксирани раздавания за e2e стека", () => {
  it("чете по един seed на игра", () => {
    const seeds = parseE2eSeeds("SANTASE=e2e-santase-1734, KENT = e2e-kent-411", "test");
    expect(seeds.get("SANTASE")).toBe("e2e-santase-1734");
    expect(seeds.get("KENT")).toBe("e2e-kent-411");
    expect(seeds.size).toBe(2);
  });

  it("пропуска непознати игри и счупени части", () => {
    const seeds = parseE2eSeeds("NOPE=x,BELOTE=,=y,BRIDGE,BRIDGE=b=c", "test");
    expect([...seeds]).toEqual([["BRIDGE", "b=c"]]);
  });

  it("fail-closed: само NODE_ENV=test включва seed-овете (production, staging, development, празно — не)", () => {
    for (const env of ["production", "staging", "development", "", undefined, "Test"]) {
      expect(parseE2eSeeds("SANTASE=fixed", env).size).toBe(0);
    }
    expect(parseE2eSeeds("SANTASE=fixed", "test").get("SANTASE")).toBe("fixed");
  });

  it("името на играта не зависи от регистъра", () => {
    const seeds = parseE2eSeeds("rummy=e2e-rummy-1, war = w-7", "test");
    expect(seeds.get("RUMMY")).toBe("e2e-rummy-1");
    expect(seeds.get("WAR")).toBe("w-7");
  });

  it("без променлива — празно", () => {
    expect(parseE2eSeeds(undefined, "test").size).toBe(0);
    expect(parseE2eSeeds("", "test").size).toBe(0);
  });
});
