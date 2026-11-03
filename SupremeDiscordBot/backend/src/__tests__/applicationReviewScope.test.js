// bot.js /application/:appId/review: serverId е задължителен низ.
// Prisma маха филтъра при undefined -> findFirst({ id, serverId: undefined })
// би намерил кандидатура от ВСЕКИ сървър (cross-tenant).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_q, _s, n) => n(), loadUser: (_q, _s, n) => n(),
  requireServerAdmin: (_q, _s, n) => n(), requireBotSecret: (_q, _s, n) => n(),
}));

const { default: botRouter } = await import("../routes/bot.js");
function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  a.use((err, _q, res, _n) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.application.findFirst.mockResolvedValue({ id: "a1", status: "PENDING" });
});

describe("POST /application/:appId/review", () => {
  for (const [name, body] of [["липсващ", {}], ["обект", { serverId: { not: "" } }], ["празен", { serverId: "" }]]) {
    it(`${name} serverId -> 400, без заявка към базата`, async () => {
      const res = await request(app()).post("/api/bot/application/a1/review").send({ action: "approve", ...body });
      expect(res.status).toBe(400);
      expect(prismaMock.application.findFirst).not.toHaveBeenCalled();
    });
  }
});
