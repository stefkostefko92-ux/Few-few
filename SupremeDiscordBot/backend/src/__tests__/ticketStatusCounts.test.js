// backend/src/__tests__/ticketStatusCounts.test.js
// Табовете на страницата „Тикети“ (концепцията, 10.10.2026) показват колко са
// отворените/поетите/затворените. Броячите идват от същия маршрут:
//   • същите филтри като списъка, но БЕЗ статуса (иначе табът „Всички“ би
//     показал само броя на избрания статус);
//   • винаги ограничени до сървъра от адреса — чужди тикети не влизат в броя.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));

const router = (await import("../routes/tickets.js")).default;
const app = express();
app.use(express.json());
app.use("/api/tickets", router);

const SID = "222222222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.ticket.findMany.mockResolvedValue([]);
  prismaMock.ticket.count.mockResolvedValue(3);
  prismaMock.ticket.groupBy.mockResolvedValue([
    { status: "OPEN", _count: { _all: 3 } },
    { status: "CLOSED", _count: { _all: 5 } },
  ]);
});

describe("броячите по статус за табовете", () => {
  it("връща statusCounts, преброени по статус", async () => {
    const res = await request(app).get(`/api/tickets/${SID}`);
    expect(res.status).toBe(200);
    expect(res.body.statusCounts).toEqual({ OPEN: 3, CLOSED: 5 });
  });

  it("при избран статус броячите са без него, но със същите останали филтри и сървъра", async () => {
    await request(app).get(`/api/tickets/${SID}?status=OPEN&priority=HIGH`);
    const listWhere = prismaMock.ticket.findMany.mock.calls[0][0].where;
    const countWhere = prismaMock.ticket.groupBy.mock.calls[0][0].where;
    expect(listWhere).toMatchObject({ serverId: SID, status: "OPEN", priority: "HIGH" });
    expect(countWhere).toMatchObject({ serverId: SID, priority: "HIGH" });
    expect(countWhere).not.toHaveProperty("status");
    expect(prismaMock.ticket.groupBy.mock.calls[0][0].by).toEqual(["status"]);
  });
});
