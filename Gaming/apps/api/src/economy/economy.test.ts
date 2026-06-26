import { describe, expect, it } from "vitest";
import { levelFromXp, xpForLevel, dailyReward } from "@aso/shared";
import { productBySku, CATALOG } from "./catalog.js";

describe("economy math", () => {
  it("xp curve is monotonic and level resolution round-trips", () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    // 0 xp => level 1, 0 into level
    expect(levelFromXp(0)).toMatchObject({ level: 1, intoLevel: 0 });
    // exactly enough for level 2
    const l2 = levelFromXp(xpForLevel(1));
    expect(l2.level).toBe(2);
    expect(l2.intoLevel).toBe(0);
  });

  it("daily reward grows to day 7 and caps", () => {
    expect(dailyReward(1).chips).toBe(100);
    expect(dailyReward(7).chips).toBe(700);
    expect(dailyReward(7).gems).toBe(5);
    expect(dailyReward(99)).toEqual(dailyReward(7));
  });

  it("catalog skus resolve and VIP products carry a tier", () => {
    expect(CATALOG.length).toBeGreaterThan(0);
    expect(productBySku("gems_small")?.grantGems).toBe(100);
    expect(productBySku("vip_gold")?.vipTier).toBe("GOLD");
    expect(productBySku("nope")).toBeUndefined();
  });
});
