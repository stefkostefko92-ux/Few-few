// backend/src/__tests__/honeypot.test.js
// v52 — капан за спам ботове: правилата за записа (включен капан иска канал,
// логът не е самият капан, смяна на канала нулира предупреждението) и
// маршрутите за бота (секрет, брояч, предупреждение само за текущия канал).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const writeAudit = vi.fn();
vi.mock("../lib/auditLog.js", () => ({ writeAudit: (...a) => writeAudit(...a) }));

const { saveHoneypot, publicHoneypot, honeypotSchema } = await import("../lib/honeypot.js");
const { default: botRouter } = await import("../routes/bot_honeypot.js");

const SID = "222222222222222222";
const TRAP = "444444444444444444";
const LOG = "555555555555555555";

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
}

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.honeypotConfig.upsert.mockImplementation(async ({ create, update }) => ({ serverId: SID, ...create, ...update }));
});

describe("правилата за записа", () => {
  it("включен капан без канал → CHANNEL_REQUIRED, нищо не се записва", async () => {
    prismaMock.honeypotConfig.findUnique.mockResolvedValue(null);
    const out = await saveHoneypot(SID, { enabled: true });
    expect(out).toEqual({ ok: false, code: "CHANNEL_REQUIRED" });
    expect(prismaMock.honeypotConfig.upsert).not.toHaveBeenCalled();
  });

  it("канал за лог = самият капан → LOG_IS_TRAP (иначе логът би хващал хора)", async () => {
    prismaMock.honeypotConfig.findUnique.mockResolvedValue(null);
    expect(await saveHoneypot(SID, { enabled: true, channelId: TRAP, logChannelId: TRAP })).toEqual({ ok: false, code: "LOG_IS_TRAP" });
  });

  it("смяна на канала нулира предупреждението; същият канал — не", async () => {
    prismaMock.honeypotConfig.findUnique.mockResolvedValue({ serverId: SID, enabled: true, channelId: TRAP, warningMessageId: "666666666666666666" });
    await saveHoneypot(SID, { channelId: "777777777777777777" });
    expect(prismaMock.honeypotConfig.upsert.mock.calls[0][0].update.warningMessageId).toBeNull();
    await saveHoneypot(SID, { channelId: TRAP, action: "ban" });
    expect(prismaMock.honeypotConfig.upsert.mock.calls[1][0].update).not.toHaveProperty("warningMessageId");
  });

  it("схемата: само трите действия и снежинки, без непознати полета", () => {
    expect(honeypotSchema.safeParse({ action: "kick" }).success).toBe(false);
    expect(honeypotSchema.safeParse({ channelId: "abc" }).success).toBe(false);
    expect(honeypotSchema.safeParse({ caughtCount: 999 }).success).toBe(false);
    expect(honeypotSchema.safeParse({ enabled: true, channelId: TRAP, action: "timeout", logChannelId: LOG, dmUser: false }).success).toBe(true);
  });

  it("публичният вид пада на softban при непознато действие", () => {
    expect(publicHoneypot({ action: "nuke" }).action).toBe("softban");
  });
});

describe("маршрутите за бота", () => {
  it("без секрет → 401/403", async () => {
    const res = await request(app()).get(`/api/bot/honeypot/${SID}`);
    expect([401, 403]).toContain(res.status);
  });

  it("GET без ред → изключен капан с подразбиращите се", async () => {
    prismaMock.honeypotConfig.findUnique.mockResolvedValue(null);
    const res = await request(app()).get(`/api/bot/honeypot/${SID}`).set("x-bot-secret", "test-bot-secret");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, action: "softban", dmUser: true, caughtCount: 0 });
  });

  it("PUT от /honeypot setup → запис + одит с човека", async () => {
    prismaMock.honeypotConfig.findUnique.mockResolvedValue(null);
    const res = await request(app()).put(`/api/bot/honeypot/${SID}`).set("x-bot-secret", "test-bot-secret")
      .send({ enabled: true, channelId: TRAP, action: "ban", actorId: "333333333333333333" });
    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({ enabled: true, channelId: TRAP, action: "ban" });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "HONEYPOT_UPDATED", serverId: SID, actorId: "333333333333333333" }));
  });

  it("брояч: +1 и новата стойност; без настройки → 404", async () => {
    prismaMock.honeypotConfig.update.mockResolvedValueOnce({ caughtCount: 7 });
    let res = await request(app()).post(`/api/bot/honeypot/${SID}/caught`).set("x-bot-secret", "test-bot-secret");
    expect(res.body).toEqual({ caughtCount: 7 });
    expect(prismaMock.honeypotConfig.update.mock.calls[0][0].data.caughtCount).toEqual({ increment: 1 });
    prismaMock.honeypotConfig.update.mockRejectedValueOnce(Object.assign(new Error("nf"), { code: "P2025" }));
    res = await request(app()).post(`/api/bot/honeypot/${SID}/caught`).set("x-bot-secret", "test-bot-secret");
    expect(res.status).toBe(404);
  });

  it("предупреждението се записва само за текущия канал", async () => {
    prismaMock.honeypotConfig.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app()).patch(`/api/bot/honeypot/${SID}/warning`).set("x-bot-secret", "test-bot-secret")
      .send({ messageId: "666666666666666666", channelId: TRAP });
    expect(res.body.ok).toBe(true);
    expect(prismaMock.honeypotConfig.updateMany).toHaveBeenCalledWith({ where: { serverId: SID, channelId: TRAP }, data: { warningMessageId: "666666666666666666" } });
    const bad = await request(app()).patch(`/api/bot/honeypot/${SID}/warning`).set("x-bot-secret", "test-bot-secret").send({ messageId: "x" });
    expect(bad.status).toBe(400);
  });
});
