import { describe, expect, it } from "vitest";
import {
  COSMETICS,
  cosmeticById,
  cosmeticsForGame,
  gameHasCosmetics,
  isCustomCosmeticId,
  makeCustomCosmeticId,
  parseCosmetic,
  VIP_PERKS,
  VIP_RANK,
} from "./index.js";

describe("cosmetics catalog", () => {
  it("has unique, well-formed, game-scoped ids", () => {
    const ids = new Set(COSMETICS.map((c) => c.id));
    expect(ids.size).toBe(COSMETICS.length);
    for (const c of COSMETICS) {
      expect(c.id).toBe(`${c.game}.${c.type}.${c.id.split(".")[2]}`);
      expect(c.gemPrice).toBeGreaterThan(0);
    }
  });

  it("resolves by id and lists per game", () => {
    const first = COSMETICS[0]!;
    expect(cosmeticById(first.id)).toEqual(first);
    expect(cosmeticById("nope.NONE.x")).toBeUndefined();

    const belote = cosmeticsForGame("BELOTE");
    expect(belote.length).toBeGreaterThan(0);
    expect(belote.every((c) => c.game === "BELOTE")).toBe(true);
    expect(gameHasCosmetics("BELOTE")).toBe(true);
    expect(gameHasCosmetics("CHESS")).toBe(true);
  });

  it("offers some VIP-exclusive items", () => {
    expect(COSMETICS.some((c) => c.vipExclusive)).toBe(true);
  });
});

describe("custom palettes", () => {
  it("round-trips a custom id into colours (VIP perk)", () => {
    const id = makeCustomCosmeticId("BELOTE", "FELT", "#173A63", "#0b0f24");
    expect(id).toBe("BELOTE.FELT.custom-173a63-0b0f24");
    expect(isCustomCosmeticId(id)).toBe(true);
    const c = parseCosmetic(id)!;
    expect(c.game).toBe("BELOTE");
    expect(c.type).toBe("FELT");
    expect(c.colors).toEqual({ a: "#173a63", b: "#0b0f24" });
    expect(c.vipExclusive).toBe(true);
  });

  it("parseCosmetic resolves catalog ids too, and rejects junk", () => {
    expect(parseCosmetic(COSMETICS[0]!.id)).toEqual(COSMETICS[0]);
    expect(parseCosmetic("BELOTE.FELT.custom-zzzzzz-000000")).toBeUndefined();
    expect(parseCosmetic("NOPE.FELT.custom-111111-222222")).toBeUndefined();
    expect(isCustomCosmeticId("BELOTE.FELT.sapphire")).toBe(false);
  });
});

describe("VIP tiers", () => {
  it("entry tier (BRONZE) removes ads but has no gem stipend or exclusives", () => {
    expect(VIP_PERKS.BRONZE.adsRemoved).toBe(true);
    expect(VIP_PERKS.BRONZE.monthlyGems).toBe(0);
    expect(VIP_PERKS.BRONZE.exclusiveCosmetics).toBe(false);
  });

  it("higher tiers monotonically improve key perks", () => {
    const order = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;
    for (let i = 1; i < order.length; i++) {
      const lo = VIP_PERKS[order[i - 1]!];
      const hi = VIP_PERKS[order[i]!];
      expect(VIP_RANK[order[i]!]).toBeGreaterThan(VIP_RANK[order[i - 1]!]);
      expect(hi.dailyChipMultiplier).toBeGreaterThanOrEqual(lo.dailyChipMultiplier);
      expect(hi.monthlyGems).toBeGreaterThanOrEqual(lo.monthlyGems);
    }
  });

  it("exclusive cosmetics begin at SILVER", () => {
    expect(VIP_PERKS.SILVER.exclusiveCosmetics).toBe(true);
  });
});
