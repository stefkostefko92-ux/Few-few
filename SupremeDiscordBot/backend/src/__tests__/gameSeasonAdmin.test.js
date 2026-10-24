// backend/src/__tests__/gameSeasonAdmin.test.js
// v50 — Server Season: сезонът се управлява от админ конзолата (Season), не от
// кода. Гейтва: четене за staff с MFA; създаване/промяна = MAIN_OWNER + свеж
// втори фактор; валидация; дубликат → 409; каталогът маркира сезонните.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "bot-secret-test";
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/redisClient.js", () => ({ getRedis: () => null }));

let USER, SESSION;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = SESSION; next(); },
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  requireSuperUser: (req, res, next) => (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole) ? next() : res.status(403).json({ error: "no" })),
  requireMainOwner: (req, res, next) => (req.user?.globalRole === "MAIN_OWNER" ? next() : res.status(403).json({ error: "Main Owner access required" })),
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));
vi.mock("axios", () => ({ default: Object.assign(vi.fn(), { get: vi.fn() }), __esModule: true }));

const seasons = await import("../lib/game/seasons.js");
const router = (await import("../routes/adminOps.js")).default;
const app = express();
app.use(express.json());
app.use("/api/admin", router);

const fresh = () => ({ mfaVerifiedAt: Date.now() - 1000, mfaLastActivity: Date.now() });
const stale = () => ({ mfaVerifiedAt: Date.now() - 20 * 60 * 1000, mfaLastActivity: Date.now() });
const S1 = { id: "x1", code: "S1", name: "Season 1 — First Light", startsAt: new Date("2026-09-21T00:00:00Z"), endsAt: new Date("2026-12-14T00:00:00Z"), companionIds: ["gold-midas", "cobalt-stellaris"] };

beforeEach(() => {
  vi.resetAllMocks();
  seasons.invalidateSeasonCache();
  USER = { id: "owner", username: "stefan", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date() };
  SESSION = fresh();
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.gameSeason.findMany.mockResolvedValue([S1]);
});

describe("GET /api/admin/game/season", () => {
  it("staff с MFA вижда текущия сезон, историята и каталога с отметка кой е сезонен; без MFA → 403", async () => {
    const r = await request(app).get("/api/admin/game/season");
    expect(r.status).toBe(200);
    expect(r.body.current).toMatchObject({ code: "S1", companionIds: ["gold-midas", "cobalt-stellaris"] });
    expect(r.body.seasons).toHaveLength(1);
    expect(r.body.catalog).toHaveLength(60);
    expect(r.body.catalog.find((c) => c.id === "gold-midas").seasonal).toBe(true);
    expect(r.body.catalog.find((c) => c.id === "lime-blip").seasonal).toBe(false);
    SESSION = {};
    expect((await request(app).get("/api/admin/game/season")).status).toBe(403);
  });
});

describe("POST /api/admin/game/season", () => {
  const body = { code: "S2", name: "Season 2 — Frost", startsAt: "2026-12-14T00:00:00Z", endsAt: "2027-03-14T00:00:00Z", companionIds: ["ice-borealis"] };
  it("остаряло потвърждение → MFA_STEP_UP; SUPER_USER → 403; нищо не се записва", async () => {
    SESSION = stale();
    let r = await request(app).post("/api/admin/game/season").send(body);
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_STEP_UP");
    SESSION = fresh(); USER.globalRole = "SUPER_USER";
    r = await request(app).post("/api/admin/game/season").send(body);
    expect(r.status).toBe(403);
    expect(prismaMock.gameSeason.create).not.toHaveBeenCalled();
  });
  it("валиден → 201 + одит; край преди старта / непознат спътник → 400; дубликат → 409", async () => {
    prismaMock.gameSeason.create.mockImplementationOnce(async ({ data }) => ({ id: "x2", ...data }));
    let r = await request(app).post("/api/admin/game/season").send(body);
    expect(r.status).toBe(201); expect(r.body).toMatchObject({ code: "S2", companionIds: ["ice-borealis"] });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "GAME_SEASON_CREATED", targetId: "S2" }) }));
    r = await request(app).post("/api/admin/game/season").send({ ...body, endsAt: "2026-12-01T00:00:00Z" });
    expect(r.status).toBe(400);
    r = await request(app).post("/api/admin/game/season").send({ ...body, companionIds: ["not-a-companion"] });
    expect(r.status).toBe(400);
    r = await request(app).post("/api/admin/game/season").send({ name: "x" });
    expect(r.status).toBe(400);
    prismaMock.gameSeason.create.mockRejectedValueOnce({ code: "P2002" });
    r = await request(app).post("/api/admin/game/season").send({ ...body, code: "S1" });
    expect(r.status).toBe(409);
  });
});

describe("PUT /api/admin/game/season/:code", () => {
  it("променя име/дати/сезонни спътници и инвалидира кеша; непознат код → 404", async () => {
    await seasons.getCurrentSeason(); // напълни кеша
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce(S1);
    prismaMock.gameSeason.update.mockImplementationOnce(async ({ data }) => ({ ...S1, ...data }));
    const r = await request(app).put("/api/admin/game/season/S1").send({ name: "Season 1 — Renamed", companionIds: ["gold-midas"] });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ code: "S1", name: "Season 1 — Renamed", companionIds: ["gold-midas"] });
    expect(prismaMock.gameSeason.update.mock.calls[0][0]).toMatchObject({ where: { code: "S1" }, data: { name: "Season 1 — Renamed", companionIds: ["gold-midas"] } });
    // кешът е изхвърлен → следващото четене пита базата отново
    prismaMock.gameSeason.findMany.mockClear();
    await seasons.getCurrentSeason();
    expect(prismaMock.gameSeason.findMany).toHaveBeenCalledTimes(1);
    prismaMock.gameSeason.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).put("/api/admin/game/season/S9").send({ name: "x" })).status).toBe(404);
  });
});
