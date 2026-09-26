import { describe, expect, it, vi } from "vitest";
import { levelFromXp, xpForLevel, dailyReward } from "@aso/shared";
import { productBySku, CATALOG, toProductView, vipTierForSku } from "./catalog.js";
import { grantProduct, snapshotFromMetadata } from "./grants.js";

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

describe("каталог от Product реда", () => {
  it("vipTierForSku разпознава vip_<ниво>[_...] и отказва останалото", () => {
    expect(vipTierForSku("vip_gold")).toBe("GOLD");
    expect(vipTierForSku("vip_platinum_promo")).toBe("PLATINUM");
    expect(vipTierForSku("vip_golden")).toBeUndefined();
    expect(vipTierForSku("gems_small")).toBeUndefined();
  });

  it("toProductView взима цена/награда от реда, заглавие от seed или SKU", () => {
    const base = { gems: null, chips: null, cosmeticId: null };
    expect(toProductView({ ...base, sku: "gems_small", kind: "GEMS", priceCents: 250, gems: 120 })).toEqual({
      sku: "gems_small",
      kind: "GEMS",
      title: "Шепа скъпоценни камъни",
      priceCents: 250,
      grantGems: 120,
    });
    expect(toProductView({ ...base, sku: "vip_gold_x", kind: "VIP_SUB", priceCents: 799 })).toMatchObject({
      title: "vip_gold_x",
      vipTier: "GOLD",
    });
  });
});

describe("grantProduct", () => {
  function fakeTx(product: Record<string, unknown> | null, owner: Record<string, unknown> | null = { id: "u1", deletedAt: null }) {
    return {
      product: { findUnique: async () => product },
      user: { findUnique: async () => owner, update: vi.fn(async () => ({})) },
      inventoryItem: { upsert: vi.fn(async () => ({})) },
    };
  }
  type Tx = Parameters<typeof grantProduct>[0];

  it("без снимка чете реда в Product (и деактивиран) — не статичния CATALOG", async () => {
    const tx = fakeTx({ kind: "GEMS", gems: 555, chips: null, cosmeticId: null, active: false });
    await grantProduct(tx as unknown as Tx, "u1", "gems_small");
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { gems: { increment: 555 } } });
  });

  it("снимката от сесията има предимство пред текущия ред", async () => {
    const tx = fakeTx({ kind: "GEMS", gems: 999, chips: null, cosmeticId: null, active: true });
    await grantProduct(tx as unknown as Tx, "u1", "gems_small", { kind: "GEMS", gems: 120, chips: 0, cosmeticId: null });
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { gems: { increment: 120 } } });
  });

  it("непознат SKU без снимка → нищо не се измисля", async () => {
    const tx = fakeTx(null);
    await grantProduct(tx as unknown as Tx, "u1", "ghost");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("изтрит (GDPR) или липсващ акаунт → нищо не се начислява, без хвърляне", async () => {
    const snap = { kind: "GEMS", gems: 120, chips: 0, cosmeticId: null };
    const erased = fakeTx(null, { id: "u1", deletedAt: new Date() });
    await grantProduct(erased as unknown as Tx, "u1", "gems_small", snap);
    expect(erased.user.update).not.toHaveBeenCalled();
    const missing = fakeTx(null, null);
    await grantProduct(missing as unknown as Tx, "u1", "gems_small", snap);
    expect(missing.user.update).not.toHaveBeenCalled();
  });

  it("snapshotFromMetadata: само наши снимки, отрицателни/боклук → 0", () => {
    expect(snapshotFromMetadata({ sku: "x" })).toBeNull();
    expect(snapshotFromMetadata({ snap: "1", kind: "GEMS", gems: "-5", chips: "abc", cosmeticId: "" })).toEqual({
      kind: "GEMS",
      gems: 0,
      chips: 0,
      cosmeticId: null,
    });
  });
});
