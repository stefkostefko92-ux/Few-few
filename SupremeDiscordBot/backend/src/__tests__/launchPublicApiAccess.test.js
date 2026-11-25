// backend/src/__tests__/launchPublicApiAccess.test.js
// Публичният REST API: какво връща и колко бързо го дава (сверка на Летописеца с кода,
// 13.11.2026).
//
//  1. Таблото и началната страница обещават 300 заявки в минута НА КЛЮЧ. Преди
//     автентикацията обаче стоеше лимит 60/мин по IP, който броеше и успешните
//     заявки — от един адрес обещаните 300 бяха недостижими.
//  2. „Един тикет“ връщаше целия ред от базата: шифрования транскрипт (`archiveHtml`)
//     и токена за архива (`archiveToken`) — вътрешни полета, които не са част от API-то.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "node:crypto";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/premium.js", async (orig) => ({
  ...(await orig()),
  getServerTier: vi.fn(async () => ({ plan: "premium", isPremium: true })),
  requirePremium: () => (_q, _s, n) => n(),
}));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_q, _s, n) => n(), loadUser: (_q, _s, n) => n(), requireServerAdmin: (_q, _s, n) => n(),
}));
vi.mock("../lib/redisClient.js", () => ({ getRedis: () => null }));

const { default: publicApi } = await import("../routes/publicApi.js");
const { default: v1 } = await import("../routes/v1.js");

const SID = "222222222222222222";
const KEY = "bpk_live_" + "a".repeat(48);
const HASH = crypto.createHash("sha256").update(KEY).digest("hex");
const row = { id: "k1", serverId: SID, scopes: ["tickets:read"], revokedAt: null, expiresAt: null, keyHash: HASH };
const ticket = {
  id: "t1", serverId: SID, number: 7, status: "CLOSED", creatorId: "333333333333333333", channelId: "444444444444444444",
  closeReason: "готово", archiveHtml: "v1:ШИФРОВАН-ТРАНСКРИПТ", archiveToken: "ТАЕН-ТОКЕН-ЗА-АРХИВА", archiveUrl: "https://x/archive/t1?token=…",
};

function app() {
  const a = express();
  a.set("trust proxy", true);
  a.use(express.json());
  a.use("/public/v1", publicApi);
  a.use("/api/v1", v1);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
}
const get = (a, url, { key = KEY, ip = "198.51.100.7" } = {}) =>
  request(a).get(url).set("Authorization", `Bearer ${key}`).set("X-Forwarded-For", ip);

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.apiKey.findUnique.mockImplementation(async ({ where }) => (where.keyHash === HASH ? row : null));
  prismaMock.apiKey.update.mockResolvedValue({});
  prismaMock.ticket.findFirst.mockResolvedValue({ ...ticket });
  prismaMock.ticket.findMany.mockResolvedValue([]);
  prismaMock.ticket.count.mockResolvedValue(0);
});

describe("един тикет не носи вътрешните полета на архива", () => {
  it("/public/v1/tickets/:id — без archiveHtml и archiveToken; останалото е там", async () => {
    const res = await get(app(), "/public/v1/tickets/t1");
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("archiveHtml");
    expect(res.body).not.toHaveProperty("archiveToken");
    expect(JSON.stringify(res.body)).not.toContain("ТАЕН-ТОКЕН");
    expect(res.body).toMatchObject({ id: "t1", number: 7, status: "CLOSED", closeReason: "готово" });
  });

  it("/api/v1/tickets/:id — същото", async () => {
    const res = await get(app(), "/api/v1/tickets/t1", { ip: "198.51.100.8" });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("archiveHtml");
    expect(res.body).not.toHaveProperty("archiveToken");
  });

  it("/api/v1/tickets (списъкът) — и там редовете са без архивните полета", async () => {
    prismaMock.ticket.findMany.mockResolvedValue([{ ...ticket }, { ...ticket, id: "t2" }]);
    prismaMock.ticket.count.mockResolvedValue(2);
    const res = await get(app(), "/api/v1/tickets", { ip: "198.51.100.10" });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain("ТАЕН-ТОКЕН");
    expect(JSON.stringify(res.body)).not.toContain("ШИФРОВАН-ТРАНСКРИПТ");
  });

  it("чужд тикет остава 404 (скоупът по сървъра на ключа)", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue(null);
    const res = await get(app(), "/public/v1/tickets/t9", { ip: "198.51.100.9" });
    expect(res.status).toBe(404);
    expect(prismaMock.ticket.findFirst.mock.calls[0][0].where).toMatchObject({ id: "t9", serverId: SID });
  });
});

describe("лимитът е 300 в минута на ключ — както го обещаваме", () => {
  it("70 успешни заявки от един адрес минават (преди: 429 след 60-ата)", async () => {
    const a = app();
    const codes = [];
    for (let i = 0; i < 70; i++) codes.push((await get(a, "/public/v1/tickets", { ip: "203.0.113.50" })).status);
    expect(codes.filter((c) => c === 429)).toHaveLength(0);
    expect(codes.every((c) => c === 200)).toBe(true);
  });

  it("налучкването остава дроселирано: невалиден ключ не получава безкрай опити от един адрес", async () => {
    const a = app();
    const codes = [];
    for (let i = 0; i < 70; i++) codes.push((await get(a, "/public/v1/tickets", { key: "bpk_live_" + "b".repeat(48), ip: "203.0.113.60" })).status);
    expect(codes[0]).toBe(401);
    expect(codes.filter((c) => c === 429).length, "след прага опитите се отказват с 429").toBeGreaterThan(0);
    // Нито един невалиден опит не стига до данни.
    expect(prismaMock.ticket.findMany).not.toHaveBeenCalled();
  });
});
