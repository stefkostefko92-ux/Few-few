// backend/src/__tests__/adminPremium.test.js
// PATCH /api/admin/servers/:serverId/premium — manual grant/revoke, bypassing
// Stripe entirely. Regression coverage for the High finding: REVOKE must drop
// `plan` to "free" (not just flip isPremium=false), because getServerTier() is
// plan-first — leaving a stale `plan` value would let a "revoked" server keep
// its full tier.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, res, next) => next(),
  loadUser: (req, res, next) => { req.user = { id: "admin1", username: "admin", globalRole: "SUPER_USER" }; next(); },
  requireSuperUser: (req, res, next) => next(),
  requireMainOwner: (req, res, next) => next(),
}));

const adminRouter = (await import("../routes/admin.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /servers/:serverId/premium", () => {
  it("grant sets isPremium/plan/planSource=manual", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "s1", premiumSince: null, stripeStatus: null });
    prismaMock.server.update.mockResolvedValue({ id: "s1", isPremium: true, plan: "premium" });

    const res = await request(buildApp())
      .patch("/api/admin/servers/s1/premium")
      .send({ enabled: true, reason: "partner gift" });

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        isPremium: true,
        plan: "premium",
        planSource: "manual",
        archiveRetentionDays: null,
      }),
    });
    expect(prismaMock.paymentLog.create).toHaveBeenCalled();
  });

  it("grant respects an explicit whitelabel plan choice", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "s1", premiumSince: null, stripeStatus: null });
    prismaMock.server.update.mockResolvedValue({ id: "s1" });

    await request(buildApp())
      .patch("/api/admin/servers/s1/premium")
      .send({ enabled: true, plan: "whitelabel" });

    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ plan: "whitelabel", planSource: "manual" }),
    });
  });

  it("REVOKE drops plan to free and clears planSource — not just isPremium=false", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: "s1", premiumSince: new Date(), stripeStatus: "manual" });
    prismaMock.server.update.mockResolvedValue({ id: "s1", isPremium: false, plan: "free" });

    const res = await request(buildApp())
      .patch("/api/admin/servers/s1/premium")
      .send({ enabled: false, reason: "chargeback" });

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        isPremium: false,
        plan: "free",
        planSource: null,
        billingInterval: null,
        archiveRetentionDays: 30,
      }),
    });
  });

  it("400s when `enabled` is not a boolean", async () => {
    const res = await request(buildApp()).patch("/api/admin/servers/s1/premium").send({ enabled: "yes" });
    expect(res.status).toBe(400);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("404s when the server doesn't exist", async () => {
    prismaMock.server.findUnique.mockResolvedValue(null);
    const res = await request(buildApp()).patch("/api/admin/servers/s404/premium").send({ enabled: true });
    expect(res.status).toBe(404);
  });
});
