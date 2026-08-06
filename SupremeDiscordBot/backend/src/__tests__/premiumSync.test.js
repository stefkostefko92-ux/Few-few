// premiumSync.test.js — syncServerPaidFlag / syncAgencyServersPaidFlag.
// Money-critical: agency seat НЕ сетва Server.isPremium, а безброй четци
// ползват суровата колона (bot config, dashboard, panel функции). Ако
// синхронизацията сгреши, платена функция мълчи (agency клиент без premium)
// или обратно — free сървър остава premium след край на агенцията.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = { server: new Map() };
const prismaMock = {
  server: {
    findUnique: vi.fn(async ({ where }) => store.server.get(where.id) ?? null),
    findMany: vi.fn(async ({ where }) =>
      [...store.server.values()].filter((s) => s.agencyId === where.agencyId).map((s) => ({ id: s.id }))),
    update: vi.fn(async ({ where, data }) => {
      const s = store.server.get(where.id);
      Object.assign(s, data);
      return s;
    }),
  },
};
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { syncServerPaidFlag, syncAgencyServersPaidFlag } = await import("../lib/premium.js");

function seed(rows) {
  store.server.clear();
  for (const r of rows) store.server.set(r.id, { agency: null, ...r });
}
beforeEach(() => vi.clearAllMocks());

describe("syncServerPaidFlag — колоната = платено състояние (не trial)", () => {
  it("agency-покрит сървър става isPremium=true", async () => {
    seed([{ id: "s1", isPremium: false, plan: "free", agencyId: "ag1", agency: { active: true } }]);
    expect(await syncServerPaidFlag("s1")).toBe(true);
    expect(store.server.get("s1").isPremium).toBe(true);
  });

  it("собствен платен план → true, дори без агенция", async () => {
    seed([{ id: "s2", isPremium: false, plan: "whitelabel", agencyId: null, agency: null }]);
    expect(await syncServerPaidFlag("s2")).toBe(true);
  });

  it("неактивна агенция НЕ дава premium", async () => {
    seed([{ id: "s3", isPremium: true, plan: "free", agencyId: "ag1", agency: { active: false } }]);
    expect(await syncServerPaidFlag("s3")).toBe(false);
    expect(store.server.get("s3").isPremium).toBe(false);
  });

  it("разкачен сървър със собствен план ОСТАВА premium", async () => {
    seed([{ id: "s4", isPremium: true, plan: "premium", agencyId: null, agency: null }]);
    expect(await syncServerPaidFlag("s4")).toBe(true);
  });

  it("идемпотентно — не пише, ако колоната вече е вярна", async () => {
    seed([{ id: "s5", isPremium: true, plan: "free", agencyId: "ag1", agency: { active: true } }]);
    await syncServerPaidFlag("s5");
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("липсващ сървър → тихо false, без ъпдейт", async () => {
    seed([]);
    expect(await syncServerPaidFlag("nope")).toBe(false);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  // ─── ЗАВАРЕН GRANDFATHER (парично-критично) ─────────────────────────────
  // Редове отпреди въвеждането на `plan` носят isPremium=true + plan="free".
  // getServerTier ги признава за white-label абонати. Ранна версия на sync-а
  // ги броеше за неплатени и МЪЛЧАЛИВО сваляше платен достъп на реален
  // абонат (находка на одита; backfill скриптът щеше да го направи масово).
  it("заварен абонат (isPremium=true, plan=free, има stripeSubscriptionId) НЕ се сваля", async () => {
    seed([{ id: "g1", isPremium: true, plan: "free", planSource: null,
            stripeSubscriptionId: "sub_123", agencyId: null, agency: null }]);
    expect(await syncServerPaidFlag("g1")).toBe(true);
    expect(store.server.get("g1").isPremium).toBe(true);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("заварен абонат с planSource (Discord/manual) също НЕ се сваля", async () => {
    seed([{ id: "g2", isPremium: true, plan: "free", planSource: "discord",
            stripeSubscriptionId: null, agencyId: null, agency: null }]);
    expect(await syncServerPaidFlag("g2")).toBe(true);
  });

  it("но истински free сървър (без следа от абонамент) СЕ сваля", async () => {
    seed([{ id: "g3", isPremium: true, plan: "free", planSource: null,
            stripeSubscriptionId: null, agencyId: null, agency: null }]);
    expect(await syncServerPaidFlag("g3")).toBe(false);
    expect(store.server.get("g3").isPremium).toBe(false);
  });
});

describe("syncAgencyServersPaidFlag — всички покрити наведнъж", () => {
  it("активация вдига isPremium на всичките покрити сървъри", async () => {
    seed([
      { id: "a", isPremium: false, plan: "free", agencyId: "ag1", agency: { active: true } },
      { id: "b", isPremium: false, plan: "free", agencyId: "ag1", agency: { active: true } },
      { id: "c", isPremium: false, plan: "free", agencyId: "ag2", agency: { active: true } }, // друга агенция
    ]);
    const n = await syncAgencyServersPaidFlag("ag1");
    expect(n).toBe(2);
    expect(store.server.get("a").isPremium).toBe(true);
    expect(store.server.get("b").isPremium).toBe(true);
    expect(store.server.get("c").isPremium).toBe(false); // недокосната
  });
});
