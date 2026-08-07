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

// ─── Изтичане на приходи през grandfather гарда (червен екип, 07.08.2026) ─────
// Гардът беше добавен, за да НЕ сваля заварени абонати (isPremium=true при
// plan="free"). Но условието му беше „има stripeSubscriptionId ИЛИ planSource",
// а прекратеният абонамент оставя и двете. Понеже самият sync вдига isPremium
// при закачане на agency seat, се получаваше самозахранващ се цикъл:
//   закачаш сървър с МЪРТЪВ абонамент на агенция → isPremium=true
//   сваляш seat-а → гардът вижда „isPremium + subscription id" → остава платен
// завинаги, безплатно. Разбивача го доказа с PoC; тук го заковаваме.
describe("grandfather гардът не възкресява прекратен абонамент", () => {
  const TERMINATED = ["canceled", "cancelled", "incomplete_expired", "disputed", "unpaid"];

  for (const status of TERMINATED) {
    it(`статус „${status}" → сваляне от agency seat връща сървъра на безплатен`, async () => {
      seed([{
        id: "victim", isPremium: false, plan: "free",
        planSource: "stripe", stripeSubscriptionId: "sub_dead", stripeStatus: status,
        agencyId: null, agency: null,
      }]);
      const s = store.server.get("victim");

      s.agencyId = "ag1"; s.agency = { active: true };
      expect(await syncServerPaidFlag("victim")).toBe(true);

      s.agencyId = null; s.agency = null;
      expect(await syncServerPaidFlag("victim")).toBe(false);
      expect(store.server.get("victim").isPremium).toBe(false);
    });
  }

  it("ЖИВ абонамент в дунинг (past_due) НЕ се сваля — гратисът е нарочен", async () => {
    seed([{
      id: "grace", isPremium: true, plan: "free",
      planSource: "stripe", stripeSubscriptionId: "sub_live", stripeStatus: "past_due",
      agencyId: null, agency: null,
    }]);
    expect(await syncServerPaidFlag("grace")).toBe(true);
  });

  it("заварен ред БЕЗ статус остава платен — това е първоначалната цел на гарда", async () => {
    seed([{
      id: "legacy", isPremium: true, plan: "free",
      planSource: "stripe", stripeSubscriptionId: "sub_old", stripeStatus: null,
      agencyId: null, agency: null,
    }]);
    expect(await syncServerPaidFlag("legacy")).toBe(true);
  });
});
