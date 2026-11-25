// backend/src/__tests__/analyticsLeaderboardNames.test.js
// Класацията на екипа в Analytics носи ИМЕТО на човека. Визуалният одит от
// 07.10.2026 намери, че таблото показваше `<@123456789012345678>` — Discord
// синтаксис, който в браузъра е само цифри. Името идва от users (екипът е
// влизал в таблото); който няма ред, остава без име (UI показва кратко id).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => {
  const pass = (_req, _res, next) => next();
  return { requireAuth: pass, loadUser: pass, requireServerAdmin: pass };
});

const { default: router } = await import("../routes/analytics.js");
const app = express();
app.use("/api/analytics", router);

beforeEach(() => vi.resetAllMocks());

describe("GET /api/analytics/:serverId/leaderboard", () => {
  it("всеки ред носи username от users; непознатият — null", async () => {
    prismaMock.ticket.groupBy
      .mockResolvedValueOnce([{ assigneeId: "111111111111111111", _count: { _all: 5 } }, { assigneeId: "222222222222222222", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ assigneeId: "111111111111111111", _count: { _all: 4 } }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "111111111111111111", username: "kai.dev" }]);
    const res = await request(app).get("/api/analytics/900000000000000001/leaderboard");
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([
      { userId: "111111111111111111", claimed: 5, closed: 4, username: "kai.dev" },
      { userId: "222222222222222222", claimed: 2, closed: 0, username: null },
    ]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["111111111111111111", "222222222222222222"] } }, select: { id: true, username: true } });
  });
});

describe("таблото не показва Discord синтаксис", () => {
  it("AnalyticsPage не рендерира <@id>", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../frontend/src/pages/AnalyticsPage.jsx"), "utf8");
    expect(src).not.toMatch(/&lt;@\{s\.userId\}&gt;/);
  });
});
