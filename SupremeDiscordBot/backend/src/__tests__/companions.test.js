// backend/src/__tests__/companions.test.js
// v50 — Server Season, етап 2: каталогът (60, разпределение, уникалност,
// картинка за всяка форма), жребият за поява (Free без rare+), и операциите
// като надпревари: улавяне (условен update), хранене (условен decrement),
// размяна (само получателят, застаряла = отказ).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/premium.js", async (orig) => {
  const real = await orig();
  return { ...real, getServerTier: vi.fn().mockResolvedValue({ plan: "free", isPremium: false, limits: real.BASE_LIMITS }) };
});

const cat = await import("../lib/game/companions.js");
const ops = await import("../lib/game/companionOps.js");
const premium = await import("../lib/premium.js");
const ART = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "public", "game", "companions");

beforeEach(() => vi.clearAllMocks());

describe("каталогът", () => {
  it("60 спътника, 24/16/12/6/2, уникални id и имена, 4 сезонни", () => {
    const by = {};
    for (const c of cat.COMPANIONS) by[c.rarity] = (by[c.rarity] || 0) + 1;
    expect(cat.COMPANIONS).toHaveLength(60);
    expect(by).toEqual({ common: 24, uncommon: 16, rare: 12, epic: 6, legendary: 2 });
    expect(new Set(cat.COMPANIONS.map((c) => c.id)).size).toBe(60);
    expect(new Set(cat.COMPANIONS.map((c) => c.name)).size).toBe(60);
    // Сезонните са СВОЙСТВО НА СЕЗОНА (базата), не на каталога: seed-ът S1 сочи 4 реални id-та.
    expect([...cat.DEFAULT_SEASON.companionIds].sort()).toEqual(["cobalt-stellaris", "ember-ignatius", "gold-midas", "shadow-eclipsa"]);
    for (const id of cat.DEFAULT_SEASON.companionIds) expect(cat.companionById(id), id).toBeTruthy();
    expect(cat.COMPANIONS.some((c) => "seasonId" in c)).toBe(false);
    expect(cat.isSeasonal("gold-midas", cat.DEFAULT_SEASON)).toBe(true);
    expect(cat.isSeasonal("gold-midas", null)).toBe(false);
    expect(cat.publicCompanion(cat.companionById("gold-midas"), 1, cat.DEFAULT_SEASON).seasonId).toBe("S1");
    expect(cat.publicCompanion(cat.companionById("gold-midas"), 1).seasonId).toBeNull();
  });
  it("всеки спътник има растеризирани трите форми (frontend/public/game/companions)", () => {
    const missing = [];
    for (const c of cat.COMPANIONS) for (let s = 1; s <= cat.MAX_STAGE; s++) if (!existsSync(join(ART, `${c.id}-${s}.jpg`))) missing.push(`${c.id}-${s}`);
    expect(missing, "пусни node frontend/scripts/companions-art.mjs").toEqual([]);
  });
  it("форма по нахранени искри: 0→1, 100→2, 299→2, 300→3; imageUrl носи формата", () => {
    expect([0, 100, 299, 300, 9999].map(cat.stageForFed)).toEqual([1, 2, 2, 3, 3]);
    expect(cat.imageUrl("lime-blip", 2, "https://x.test/")).toBe("https://x.test/game/companions/lime-blip-2.jpg");
    expect(cat.imageUrl("lime-blip", 9)).toMatch(/-3\.jpg$/);
  });
  it("Free сървър вижда само common/uncommon; Premium — всички по тегло; сезонните само в сезона", () => {
    const seq = [0.999, 0.5];
    let i = 0; const rand = () => seq[i++ % seq.length];
    const S = cat.DEFAULT_SEASON;
    expect(["common", "uncommon"]).toContain(cat.pickSpawn({ isPremium: false, rand, season: S }).rarity);
    const outOfSeason = new Date("2027-06-01T00:00:00Z");
    const inSeason = new Date("2026-10-01T00:00:00Z");
    for (let k = 0; k < 200; k++) {
      expect(cat.isSeasonal(cat.pickSpawn({ isPremium: true, now: outOfSeason, season: S }).id, S)).toBe(false);
    }
    // Без сезон няма понятие „сезонен“ — publicCompanion не маркира нищо (getCurrentSeason винаги дава ред: seed).
    expect(cat.publicCompanion(cat.pickSpawn({ isPremium: true, now: inSeason, season: null, rand: () => 0.999 }), 1, null).seasonId).toBeNull();
    // В сезона легендарните (и двете сезонни) се появяват при жребий „legendary“.
    expect(cat.pickSpawn({ isPremium: true, now: inSeason, season: S, rand: () => 0.999 }).rarity).toBe("legendary");
    const dist = {};
    for (let k = 0; k < 4000; k++) { const c = cat.pickSpawn({ isPremium: true, now: inSeason, season: S }); dist[c.rarity] = (dist[c.rarity] || 0) + 1; }
    expect(dist.common).toBeGreaterThan(dist.uncommon); expect(dist.uncommon).toBeGreaterThan(dist.rare); expect(dist.rare).toBeGreaterThan(dist.epic || 0);
  });
});

describe("поява", () => {
  it("жива поява → SPAWN_ACTIVE; скорошна → SPAWN_TOO_SOON; иначе създава с 5 min живот", async () => {
    const now = new Date("2026-09-18T12:00:00Z");
    prismaMock.companionSpawn.findFirst.mockResolvedValueOnce({ caughtById: null, expiresAt: new Date(now.getTime() + 60_000), createdAt: now });
    expect((await ops.createSpawn("222222222222222222", "1", { now })).code).toBe("SPAWN_ACTIVE");
    prismaMock.companionSpawn.findFirst.mockResolvedValueOnce({ caughtById: "9", expiresAt: now, createdAt: new Date(now.getTime() - 60_000) });
    expect((await ops.createSpawn("222222222222222222", "1", { now })).code).toBe("SPAWN_TOO_SOON");
    prismaMock.companionSpawn.findFirst.mockResolvedValueOnce(null);
    prismaMock.companionSpawn.create.mockImplementationOnce(async ({ data }) => ({ id: "sp1", ...data }));
    const out = await ops.createSpawn("222222222222222222", "1", { now });
    expect(out.ok).toBe(true);
    expect(out.spawn.expiresAt.getTime() - now.getTime()).toBe(cat.SPAWN_TTL_MS);
    expect(["common", "uncommon"]).toContain(out.companion.rarity);
  });
});

describe("улавяне — първият печели", () => {
  const spawn = { id: "sp1", serverId: "222222222222222222", companionId: "lime-blip", caughtById: null, expiresAt: new Date(Date.now() + 60_000) };
  it("условният update върна 0 реда → ALREADY_CAUGHT, нищо не се създава", async () => {
    prismaMock.companionSpawn.findUnique.mockResolvedValueOnce(spawn);
    prismaMock.memberCompanion.count.mockResolvedValueOnce(0);
    prismaMock.companionSpawn.updateMany.mockResolvedValueOnce({ count: 0 });
    const out = await ops.catchSpawn("sp1", "333333333333333333");
    expect(out.code).toBe("ALREADY_CAUGHT");
    expect(prismaMock.memberCompanion.create).not.toHaveBeenCalled();
  });
  it("пълна колекция (Free: 1) → COLLECTION_FULL ПРЕДИ да се пипа появата", async () => {
    prismaMock.companionSpawn.findUnique.mockResolvedValueOnce(spawn);
    prismaMock.memberCompanion.count.mockResolvedValueOnce(premium.BASE_LIMITS.companionSlots);
    const out = await ops.catchSpawn("sp1", "333333333333333333");
    expect(out.code).toBe("COLLECTION_FULL");
    expect(prismaMock.companionSpawn.updateMany).not.toHaveBeenCalled();
  });
  it("успех: спътникът се записва и става активен, ако няма активен", async () => {
    prismaMock.companionSpawn.findUnique.mockResolvedValueOnce(spawn);
    prismaMock.memberCompanion.count.mockResolvedValueOnce(0);
    prismaMock.companionSpawn.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.memberCompanion.create.mockImplementationOnce(async ({ data }) => ({ id: "mc1", stage: 1, ...data }));
    prismaMock.memberProgress.upsert.mockResolvedValueOnce({});
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    const out = await ops.catchSpawn("sp1", "333333333333333333");
    expect(out.ok).toBe(true); expect(out.companion.name).toBe("Blip");
    expect(prismaMock.memberProgress.updateMany.mock.calls[0][0].where.activeCompanionId).toBeNull();
  });
});

describe("хранене", () => {
  it("недостатъчно искри → NOT_ENOUGH_SPARKS без промяна; иначе fed расте и формата се качва на прага", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce({ id: "mc1", companionId: "lime-blip", stage: 1, fed: 80 });
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ sparks: 5 });
    const no = await ops.feedCompanion("222222222222222222", "333333333333333333", "mc1", 50);
    expect(no.code).toBe("NOT_ENOUGH_SPARKS"); expect(prismaMock.memberCompanion.update).not.toHaveBeenCalled();
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce({ id: "mc1", companionId: "lime-blip", stage: 1, fed: 80 });
    prismaMock.memberProgress.updateMany.mockResolvedValueOnce({ count: 1 });
    // Базата прилага increment върху ТЕКУЩАТА стойност (друго хранене е вдигнало
    // fed на 100 междувременно) — резултатът трябва да е 150, не 80+50.
    prismaMock.memberCompanion.update
      .mockImplementationOnce(async ({ data }) => ({ id: "mc1", companionId: "lime-blip", stage: 1, fed: 100 + data.fed.increment }))
      .mockImplementationOnce(async ({ data }) => ({ id: "mc1", companionId: "lime-blip", fed: 150, ...data }));
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ sparks: 10 });
    const yes = await ops.feedCompanion("222222222222222222", "333333333333333333", "mc1", 50);
    expect(yes).toMatchObject({ ok: true, evolved: true, stage: 2, sparksLeft: 10 });
    expect(yes.owned.fed).toBe(150);
    expect(prismaMock.memberCompanion.update.mock.calls[0][0].data).toEqual({ fed: { increment: 50 } }); // одит 25.09.2026: не абсолютна стойност
    expect(prismaMock.memberProgress.updateMany.mock.calls[1][0].where.sparks).toEqual({ gte: 50 });
  });
  it("крайна форма → MAX_STAGE; невалидна сума → INVALID_AMOUNT", async () => {
    prismaMock.memberCompanion.findFirst.mockResolvedValueOnce({ id: "mc1", companionId: "lime-blip", stage: 3, fed: 300 });
    expect((await ops.feedCompanion("222222222222222222", "333333333333333333", "mc1", 10)).code).toBe("MAX_STAGE");
    expect((await ops.feedCompanion("222222222222222222", "333333333333333333", "mc1", 0)).code).toBe("INVALID_AMOUNT");
  });
});

describe("размяна", () => {
  const trade = { id: "tr1", serverId: "222222222222222222", fromUserId: "1", toUserId: "2", fromCompanionId: "a", toCompanionId: "b", status: "PENDING", expiresAt: new Date(Date.now() + 60_000) };
  it("само получателят отговаря; изтекла се маркира EXPIRED", async () => {
    prismaMock.companionTrade.findUnique.mockResolvedValueOnce(trade);
    expect((await ops.resolveTrade("tr1", "1", true)).code).toBe("NOT_RECIPIENT");
    prismaMock.companionTrade.findUnique.mockResolvedValueOnce({ ...trade, expiresAt: new Date(Date.now() - 1) });
    expect((await ops.resolveTrade("tr1", "2", true)).code).toBe("TRADE_EXPIRED");
    expect(prismaMock.companionTrade.update.mock.calls[0][0].data.status).toBe("EXPIRED");
  });
  it("приемане: двете собствености се сменят условно; застаряла (0 реда) → TRADE_STALE", async () => {
    prismaMock.companionTrade.findUnique.mockResolvedValueOnce(trade);
    prismaMock.memberCompanion.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    prismaMock.memberProgress.updateMany.mockResolvedValue({ count: 0 });
    const ok = await ops.resolveTrade("tr1", "2", true);
    expect(ok).toMatchObject({ ok: true, status: "ACCEPTED" });
    expect(prismaMock.memberCompanion.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "a", userId: "1" }, data: { userId: "2" } });
    prismaMock.companionTrade.findUnique.mockResolvedValueOnce(trade);
    prismaMock.memberCompanion.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await ops.resolveTrade("tr1", "2", true)).code).toBe("TRADE_STALE");
  });
  it("отказ → DECLINED без пипане на собственост; самостоятелна размяна → SELF_TRADE", async () => {
    prismaMock.companionTrade.findUnique.mockResolvedValueOnce(trade);
    const d = await ops.resolveTrade("tr1", "2", false);
    expect(d).toMatchObject({ ok: true, status: "DECLINED" });
    expect(prismaMock.memberCompanion.updateMany).not.toHaveBeenCalled();
    expect((await ops.proposeTrade("222222222222222222", "1", "1", "a", "b")).code).toBe("SELF_TRADE");
  });
});


describe("регресии от одита 24.09.2026", () => {
  it("listOwned: id е на ПРИТЕЖАНИЕТО (за feed/activate/release/trade), каталожният е в companionId", async () => {
    prismaMock.memberCompanion.findMany.mockResolvedValueOnce([{ id: "own_1", serverId: "222222222222222222", userId: "333333333333333333", companionId: "lime-blip", stage: 1, fed: 0, nickname: null }]);
    prismaMock.memberProgress.findUnique.mockResolvedValueOnce({ activeCompanionId: "own_1", sparks: 5 });
    prismaMock.gameSeason.findMany.mockResolvedValue([]);
    const out = await ops.listOwned("222222222222222222", "333333333333333333");
    expect(out.companions[0]).toMatchObject({ id: "own_1", companionId: "lime-blip", name: "Blip", index: 1 });
    expect(out.activeId).toBe(out.companions[0].id);
  });
});
