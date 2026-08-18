// backend/src/__tests__/applicationHistory.test.js
// Историята на кандидата се СКОУПВА по сървър — и се брои честно.
//
// ЗАЩО (заявка на собственика, 11.08.2026): ревюващият трябва да вижда
// предишните кандидатури на човека („вече отказван два пъти"), вместо да съди
// всяка като първа. Точно тук обаче дебне мултинаемният теч: същият Discord
// потребител кандидатства в ДЕСЕТКИ сървъра, а `userId` сам по себе си НЕ е
// скоуп. История от чужд сървър, показана на този админ, е изтичане на данни
// между наематели — затова тестът гейтва точно формата на заявката, не само
// че „нещо се връща".
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "admin1", globalRole: "USER" }; next(); },
  requireServerAdmin: (req, _res, next) => next(),
  requireBotSecret: (req, _res, next) => next(),
}));

const { default: applicationsRouter } = await import("../routes/applications.js");

const APP = {
  id: "a-current", serverId: "s1", userId: "u1", formId: "f1",
  status: "PENDING", answers: {}, createdAt: new Date("2026-08-11"),
};

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/applications", applicationsRouter);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.application.findFirst.mockResolvedValue({ ...APP });
  prismaMock.application.findMany.mockResolvedValue([]);
});

describe("GET /api/applications/:serverId/:appId — история на кандидата", () => {
  it("скоупва историята по serverId И userId — чужд сървър не изтича", async () => {
    await request(app()).get("/api/applications/s1/a-current");

    const call = prismaMock.application.findMany.mock.calls.at(-1);
    expect(call, "историята изобщо не е заявена").toBeTruthy();
    expect(call[0].where).toMatchObject({ serverId: "s1", userId: "u1" });
  });

  it("изключва самата текуща кандидатура от историята ѝ", async () => {
    await request(app()).get("/api/applications/s1/a-current");
    const where = prismaMock.application.findMany.mock.calls.at(-1)[0].where;
    expect(where.id).toEqual({ not: "a-current" });
  });

  it("НЕ изнася отговорите на предишните кандидатури (само резюме)", async () => {
    await request(app()).get("/api/applications/s1/a-current");
    const select = prismaMock.application.findMany.mock.calls.at(-1)[0].select;
    expect(select, "историята трябва да минава през allowlist select").toBeTruthy();
    expect(select.answers).toBeUndefined();
  });

  it("брои по статус и връща най-новите първи", async () => {
    prismaMock.application.findMany.mockResolvedValue([
      { id: "a3", status: "DENIED",   createdAt: new Date("2026-07-01"), form: { id: "f1", name: "Staff" } },
      { id: "a2", status: "APPROVED", createdAt: new Date("2026-06-01"), form: { id: "f1", name: "Staff" } },
      { id: "a1", status: "DENIED",   createdAt: new Date("2026-05-01"), form: { id: "f2", name: "Builder" } },
    ]);

    const res = await request(app()).get("/api/applications/s1/a-current");

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(3);
    expect(res.body.historyMeta.counts).toMatchObject({ APPROVED: 1, DENIED: 2, PENDING: 0 });
    expect(res.body.historyMeta.total).toBe(3);
    expect(res.body.historyMeta.truncated).toBe(false);
    expect(prismaMock.application.findMany.mock.calls.at(-1)[0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("първа кандидатура → празна история, не грешка", async () => {
    const res = await request(app()).get("/api/applications/s1/a-current");
    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
    expect(res.body.historyMeta.counts).toMatchObject({ APPROVED: 0, DENIED: 0, PENDING: 0 });
  });

  it("при таван от 50 казва честно, че е отрязана", async () => {
    prismaMock.application.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: `a${i}`, status: "DENIED", createdAt: new Date("2026-05-01"), form: { id: "f1", name: "Staff" },
      })),
    );
    const res = await request(app()).get("/api/applications/s1/a-current");
    expect(res.body.historyMeta.truncated).toBe(true);
    expect(prismaMock.application.findMany.mock.calls.at(-1)[0].take).toBe(50);
  });

  it("несъществуваща кандидатура си остава 404 (историята не я възкресява)", async () => {
    prismaMock.application.findFirst.mockResolvedValue(null);
    const res = await request(app()).get("/api/applications/s1/nope");
    expect(res.status).toBe(404);
    expect(prismaMock.application.findMany).not.toHaveBeenCalled();
  });
});
