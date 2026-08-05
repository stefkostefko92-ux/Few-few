// backend/src/__tests__/agencySeats.test.js
// POST/DELETE /api/agency/:agencyId/servers/:serverId — Agency seat assignment.
// Money-critical: a reseller must never be able to provision more servers than
// their seatLimit pays for (double-click / scripted race), and must never grab
// a seat on an agency they don't own, or a server already claimed elsewhere.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, res, next) => next(),
  loadUser: (req, res, next) => { req.user = { id: "u1", globalRole: "USER" }; next(); },
  requireServerAdmin: (req, res, next) => next(),
}));

const agencyRouter = (await import("../routes/agency.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/agency", agencyRouter);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /:agencyId/servers/:serverId — seat assign", () => {
  it("returns FULL (409) once the seat cap is reached", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1", active: true, seatLimit: 2 });
    prismaMock.server.findUnique.mockResolvedValue({ agencyId: null });
    prismaMock.server.count.mockResolvedValue(2); // already at the limit

    const res = await request(buildApp()).post("/api/agency/ag1/servers/s3");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SEAT_LIMIT");
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("returns ALREADY when the server is already on this agency (no-op, not an error)", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1", active: true, seatLimit: 5 });
    prismaMock.server.findUnique.mockResolvedValue({ agencyId: "ag1" });

    const res = await request(buildApp()).post("/api/agency/ag1/servers/s1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, alreadyAssigned: true });
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("returns OTHER_AGENCY (409) when the server is already claimed by a different agency", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1", active: true, seatLimit: 5 });
    prismaMock.server.findUnique.mockResolvedValue({ agencyId: "ag2" });

    const res = await request(buildApp()).post("/api/agency/ag1/servers/s1");

    expect(res.status).toBe(409);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the target server doesn't exist", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1", active: true, seatLimit: 5 });
    prismaMock.server.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).post("/api/agency/ag1/servers/s404");

    expect(res.status).toBe(404);
  });

  it("assigns the seat under the free-cap path and logs the audit trail", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1", active: true, seatLimit: 5 });
    prismaMock.server.findUnique.mockResolvedValue({ agencyId: null });
    prismaMock.server.count.mockResolvedValue(1); // 1 used of 5

    const res = await request(buildApp()).post("/api/agency/ag1/servers/s2");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, seatsUsed: 2, seatLimit: 5 });
    expect(prismaMock.server.update).toHaveBeenCalledWith({ where: { id: "s2" }, data: { agencyId: "ag1" } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "AGENCY_SEAT_ADDED", serverId: "s2" }) })
    );
  });

  it("404s when the caller doesn't own the agency (never leaks whether it exists)", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "someone-else", active: true, seatLimit: 5 });

    const res = await request(buildApp()).post("/api/agency/ag1/servers/s1");

    expect(res.status).toBe(404);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /:agencyId/servers/:serverId — seat release", () => {
  it("releases the seat when the caller owns the agency and the server is on it", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1" });
    prismaMock.server.findUnique.mockResolvedValue({ agencyId: "ag1" });
    // Route chains .catch() directly on the audit-log write (fire-and-forget) —
    // a real Prisma call always returns a promise, so the mock must too.
    prismaMock.auditLog.create.mockResolvedValue({});

    const res = await request(buildApp()).delete("/api/agency/ag1/servers/s1");

    expect(res.status).toBe(200);
    expect(prismaMock.server.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { agencyId: null } });
  });

  it("404s when the server isn't on this agency", async () => {
    prismaMock.agency.findUnique.mockResolvedValue({ id: "ag1", ownerUserId: "u1" });
    prismaMock.server.findUnique.mockResolvedValue({ agencyId: "ag2" });

    const res = await request(buildApp()).delete("/api/agency/ag1/servers/s1");

    expect(res.status).toBe(404);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
});
