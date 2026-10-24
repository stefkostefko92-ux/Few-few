import { describe, expect, it } from "vitest";
import { parseE2eSeeds } from "./e2eSeeds.js";

describe("parseE2eSeeds — фиксирани раздавания за e2e стека", () => {
  it("чете по един seed на игра", () => {
    const seeds = parseE2eSeeds("SANTASE=e2e-santase-1734, KENT = e2e-kent-411", false);
    expect(seeds.get("SANTASE")).toBe("e2e-santase-1734");
    expect(seeds.get("KENT")).toBe("e2e-kent-411");
    expect(seeds.size).toBe(2);
  });

  it("пропуска непознати игри и счупени части", () => {
    const seeds = parseE2eSeeds("NOPE=x,BELOTE=,=y,BRIDGE,BRIDGE=b=c", false);
    expect([...seeds]).toEqual([["BRIDGE", "b=c"]]);
  });

  it("в продукция винаги е празно — seed-ът остава случаен", () => {
    expect(parseE2eSeeds("SANTASE=fixed", true).size).toBe(0);
  });

  it("името на играта не зависи от регистъра", () => {
    const seeds = parseE2eSeeds("rummy=e2e-rummy-1, war = w-7", false);
    expect(seeds.get("RUMMY")).toBe("e2e-rummy-1");
    expect(seeds.get("WAR")).toBe("w-7");
  });

  it("без променлива — празно", () => {
    expect(parseE2eSeeds(undefined, false).size).toBe(0);
    expect(parseE2eSeeds("", false).size).toBe(0);
  });
});
