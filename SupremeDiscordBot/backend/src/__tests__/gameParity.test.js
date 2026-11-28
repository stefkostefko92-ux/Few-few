// backend/src/__tests__/gameParity.test.js
// „Каквото може ботът, да го има в таблото“ — играта (одит на Дискорджията, 28.11.2026):
//   Г1 trivia сега (/trivia source) — същото createRound, ботът публикува (/internal/game-trivia)
//   Г2 спътник сега (/spawn) — същото createSpawn, ботът публикува (/internal/game-spawn)
// Ако ботът не публикува, кръгът/появата се затварят веднага — иначе каналът остава
// „зает“ с нещо, което никой не вижда.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const writeAudit = vi.fn(async () => true);
vi.mock("../lib/auditLog.js", () => ({ writeAudit: (...a) => writeAudit(...a) }));
const notifyBotVerbose = vi.fn();
vi.mock("../services/botNotifier.js", () => ({ notifyBotVerbose: (...a) => notifyBotVerbose(...a), notifyBot: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
const createRound = vi.fn();
vi.mock("../lib/game/trivia.js", async (orig) => ({ ...(await orig()), createRound: (...a) => createRound(...a) }));
const createSpawn = vi.fn();
vi.mock("../lib/game/companionOps.js", async (orig) => ({ ...(await orig()), createSpawn: (...a) => createSpawn(...a) }));
const getGameSettings = vi.fn();
vi.mock("../lib/game/xp.js", async (orig) => ({ ...(await orig()), getGameSettings: (...a) => getGameSettings(...a) }));

const gameRouter = (await import("../routes/game.js")).default;
const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/game", gameRouter);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
};
const SID = "333333333333333333";
const CH = "900000000000000001";
const audited = (action) => writeAudit.mock.calls.map(([e]) => e).filter((e) => e.action === action);

beforeEach(() => {
  vi.resetAllMocks();
  writeAudit.mockResolvedValue(true);
  getGameSettings.mockResolvedValue({ enabled: true });
  notifyBotVerbose.mockResolvedValue({ ok: true });
  prismaMock.triviaRound.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.companionSpawn.updateMany.mockResolvedValue({ count: 1 });
});

describe("Г1 trivia сега от таблото", () => {
  const go = (body) => request(app()).post(`/api/game/${SID}/trivia/start`).send(body);
  it("без канал → 400", async () => {
    expect((await go({})).status).toBe(400);
    expect(createRound).not.toHaveBeenCalled();
  });
  it("същото createRound като /trivia; ботът публикува; одит", async () => {
    createRound.mockResolvedValue({ ok: true, round: { id: "r1", channelId: CH } });
    const r = await go({ channelId: CH, source: "KB" });
    expect(r.status).toBe(201);
    expect(createRound).toHaveBeenCalledWith(SID, CH, { source: "KB" });
    expect(notifyBotVerbose).toHaveBeenCalledWith("GAME_TRIVIA", { event: "POST", serverId: SID, round: { id: "r1", channelId: CH } });
    expect(audited("GAME_TRIVIA_STARTED")).toHaveLength(1);
  });
  it("играта е изключена / кръг вече тече → отказ с кода, без бота", async () => {
    createRound.mockResolvedValue({ ok: false, code: "ROUND_OPEN" });
    const r = await go({ channelId: CH });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ROUND_OPEN");
    expect(notifyBotVerbose).not.toHaveBeenCalled();
  });
  it("ботът не публикува → кръгът се затваря веднага (каналът не остава зает) и 502", async () => {
    createRound.mockResolvedValue({ ok: true, round: { id: "r1", channelId: CH } });
    notifyBotVerbose.mockResolvedValue({ ok: false, reason: "no-channel" });
    const r = await go({ channelId: CH });
    expect(r.status).toBe(502);
    expect(prismaMock.triviaRound.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "r1", serverId: SID, closedAt: null } });
  });
});

describe("Г2 спътник сега от таблото", () => {
  const go = (body) => request(app()).post(`/api/game/${SID}/spawn`).send(body);
  it("играта е изключена → 403, без createSpawn", async () => {
    getGameSettings.mockResolvedValue({ enabled: false });
    const r = await go({ channelId: CH });
    expect(r.status).toBe(403);
    expect(createSpawn).not.toHaveBeenCalled();
  });
  it("същото createSpawn като /spawn (ръчно); ботът публикува в канала на този сървър", async () => {
    const out = { ok: true, spawn: { id: "s1", expiresAt: new Date().toISOString() }, companion: { id: "lime-blip" } };
    createSpawn.mockResolvedValue(out);
    const r = await go({ channelId: CH });
    expect(r.status).toBe(201);
    expect(createSpawn).toHaveBeenCalledWith(SID, CH, { manual: true, companionId: null });
    expect(notifyBotVerbose).toHaveBeenCalledWith("GAME_SPAWN", { serverId: SID, channelId: CH, data: JSON.parse(JSON.stringify(out)) });
    expect(audited("GAME_SPAWN_MANUAL")).toHaveLength(1);
  });
  it("невалиден спътник → 400", async () => {
    expect((await go({ channelId: CH, companionId: "../x" })).status).toBe(400);
  });
  it("ботът не публикува → появата изтича веднага и 502", async () => {
    createSpawn.mockResolvedValue({ ok: true, spawn: { id: "s1" } });
    notifyBotVerbose.mockResolvedValue({ botError: "Missing Access" });
    const r = await go({ channelId: CH });
    expect(r.status).toBe(502);
    expect(prismaMock.companionSpawn.updateMany.mock.calls[0][0].where).toMatchObject({ id: "s1", serverId: SID });
  });
});
