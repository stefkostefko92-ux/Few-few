// backend/src/__tests__/premiumTiersResolution.test.js
// getServerTier() is the single source of truth every premium gate reads from
// (webhooks, requirePremium middleware, limits). These tests lock in how the
// three access paths — own paid plan, active trial, Agency seat — combine,
// plus the legacy isPremium=true grandfather fallback and the raw Prisma
// `where` fragments used by batch/cleanup queries.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { getServerTier, effectivePremiumWhere, effectiveFreeWhere } = await import("../lib/premium.js");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getServerTier — own paid plan", () => {
  it("resolves the server's own plan with no trial/agency in play", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: true, plan: "premium", trialEndsAt: null, agencyId: null, agency: null,
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("premium");
    expect(tier.isPremium).toBe(true);
    expect(tier.hasWhiteLabel).toBe(false);
  });
});

describe("getServerTier — trial", () => {
  it("an active trial grants Premium access, NEVER white-label", async () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: false, plan: "free", trialEndsAt: future, agencyId: null, agency: null,
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("premium");
    expect(tier.isPremium).toBe(true);
    expect(tier.hasWhiteLabel).toBe(false);
    expect(tier.isTrial).toBe(true);
    expect(tier.trialDaysLeft).toBeGreaterThan(0);
  });

  it("an expired trial grants nothing", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: false, plan: "free", trialEndsAt: past, agencyId: null, agency: null,
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("free");
    expect(tier.isPremium).toBe(false);
    expect(tier.isTrial).toBe(false);
  });
});

describe("getServerTier — agency seat", () => {
  it("an active agency seat raises an otherwise-free server to the agency tier", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: false, plan: "free", trialEndsAt: null,
      agencyId: "ag1", agency: { plan: "agency10", active: true, seatLimit: 10 },
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("agency10");
    expect(tier.hasWhiteLabel).toBe(true);
    expect(tier.maxServers).toBe(10);
  });

  it("an INACTIVE agency (lapsed billing) does not cover the seat", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: false, plan: "free", trialEndsAt: null,
      agencyId: "ag1", agency: { plan: "agency10", active: false, seatLimit: 10 },
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("free");
    expect(tier.hasWhiteLabel).toBe(false);
  });

  it("a seat never demotes a server's own higher-ranked plan", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: true, plan: "whitelabel", trialEndsAt: null,
      agencyId: "ag1", agency: { plan: "agency5", active: true, seatLimit: 5 },
    });

    const tier = await getServerTier("s1");

    // whitelabel (rank 2) and agency5 (rank 3) — agency5 wins (higher rank).
    expect(tier.plan).toBe("agency5");
  });
});

describe("getServerTier — legacy grandfather fallback", () => {
  it("isPremium=true with no plan column set falls back to white-label", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: true, plan: null, trialEndsAt: null, agencyId: null, agency: null,
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("whitelabel");
    expect(tier.hasWhiteLabel).toBe(true);
  });

  it("isPremium=true with plan explicitly 'free' also grandfathers to white-label", async () => {
    prismaMock.server.findUnique.mockResolvedValue({
      isPremium: true, plan: "free", trialEndsAt: null, agencyId: null, agency: null,
    });

    const tier = await getServerTier("s1");

    expect(tier.plan).toBe("whitelabel");
  });
});

describe("effectivePremiumWhere / effectiveFreeWhere", () => {
  it("effectivePremiumWhere ORs isPremium, active trial and active agency", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(effectivePremiumWhere(now)).toEqual({
      OR: [
        { isPremium: true },
        { trialEndsAt: { gt: now } },
        { agency: { is: { active: true } } },
      ],
    });
  });

  it("effectiveFreeWhere is the AND-negation (not just !isPremium)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(effectiveFreeWhere(now)).toEqual({
      AND: [
        { isPremium: false },
        { OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
        { OR: [{ agencyId: null }, { agency: { is: { active: false } } }] },
      ],
    });
  });
});
