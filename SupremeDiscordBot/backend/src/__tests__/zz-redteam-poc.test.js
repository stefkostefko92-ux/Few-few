// RED-BEFORE-GREEN артефакт (червен екип, 07.08.2026) — v40 agency seat.
// Твърди ЖЕЛАНОТО поведение: пада ПРЕДИ поправката, минава СЛЕД нея.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = { server: new Map() };
const prismaMock = {
  server: {
    findUnique: vi.fn(async ({ where }) => store.server.get(where.id) ?? null),
    findMany: vi.fn(async ({ where }) =>
      [...store.server.values()].filter((s) => s.agencyId === where.agencyId).map((s) => ({ id: s.id }))),
    update: vi.fn(async ({ where, data }) => Object.assign(store.server.get(where.id), data)),
  },
};
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const { syncServerPaidFlag, getServerTier } = await import("../lib/premium.js");

const seed = (rows) => { store.server.clear(); for (const r of rows) store.server.set(r.id, { agency: null, ...r }); };
beforeEach(() => vi.clearAllMocks());

// Цикълът attach→detach, който вдига колоната и после проверява дали пада.
async function seatCycle(id) {
  const s = store.server.get(id);
  s.agencyId = "ag1"; s.agency = { active: true };
  await syncServerPaidFlag(id);
  s.agencyId = null; s.agency = null;
  return syncServerPaidFlag(id);
}

describe("R1 · grandfather гардът е fail-OPEN спрямо непокрити статуси", () => {
  // Всеки от тези статуси значи „НЕ плаща“, но липсва в TERMINATED_STRIPE_STATUSES
  // (premium.js:316) → attach→detach го възкресява като безплатен white-label.
  for (const status of ["paused", "incomplete", "trial_ended_unknown", ""]) {
    it(`статус „${status || "(празен)"}“ НЕ бива да възкресява достъпа`, async () => {
      seed([{ id: "v", isPremium: false, plan: "free", planSource: "stripe",
              stripeSubscriptionId: "sub_x", stripeStatus: status,
              accessUntil: null, gracePlan: null, trialEndsAt: null, agencyId: null, agency: null }]);
      expect(await seatCycle("v")).toBe(false);
      expect(store.server.get("v").isPremium).toBe(false);
      expect((await getServerTier("v")).plan).toBe("free");
    });
  }
});

describe("R2 · ЖИВИЯТ гратис (v40) е платено състояние за syncServerPaidFlag", () => {
  it("detach по време на accessUntil в бъдещето ЗАПАЗВА isPremium=true", async () => {
    seed([{ id: "g", isPremium: true, plan: "free", planSource: null, stripeSubscriptionId: null,
            stripeStatus: "canceled", accessUntil: new Date(Date.now() + 20 * 864e5),
            gracePlan: "whitelabel", trialEndsAt: null, agencyId: "ag1", agency: { active: true } }]);
    const s = store.server.get("g");
    s.agencyId = null; s.agency = null;
    expect(await syncServerPaidFlag("g")).toBe(true);      // платил е до края на периода
    expect(store.server.get("g").isPremium).toBe(true);
    expect((await getServerTier("g")).plan).toBe("whitelabel"); // колона ↔ tier съгласувани
  });

  it("ИЗТЕКЪЛ гратис не пази нищо", async () => {
    seed([{ id: "e", isPremium: true, plan: "free", planSource: null, stripeSubscriptionId: null,
            stripeStatus: "canceled", accessUntil: new Date(Date.now() - 864e5),
            gracePlan: "whitelabel", trialEndsAt: null, agencyId: null, agency: null }]);
    expect(await syncServerPaidFlag("e")).toBe(false);
  });
});
