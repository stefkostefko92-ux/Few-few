// backend/src/__tests__/launchGuards.test.js
// Поток З (стръв, роли, дневник) — бекенд частта: З8, З10, З11, З13 и
// маршрутът за З3 от docs/LAUNCH_READINESS_SPEC.md.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "u1" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));
vi.mock("../lib/premium.js", () => ({
  getServerTier: vi.fn(async () => ({ isPremium: true, hasWhiteLabel: false, plan: "premium", limits: { verificationPanels: 5 } })),
  validatePremiumFields: vi.fn(),
  planHasFeature: vi.fn(() => true),
}));
vi.mock("../lib/discordRest.js", () => ({ fetchUserGuilds: vi.fn() }));
vi.mock("../lib/memberNames.js", () => ({ fetchMemberNames: vi.fn() }));
vi.mock("../lib/crypto.js", () => ({ encrypt: (x) => x, decrypt: (x) => x, decryptSafe: (x) => x }));
vi.mock("../services/botNotifier.js", () => ({ notifyBot: vi.fn(async () => ({})), notifyBotVerbose: vi.fn(async () => ({})) }));
const fireWebhooks = vi.fn(async () => {});
vi.mock("../services/webhooks.js", () => ({ fireWebhooks: (...a) => fireWebhooks(...a), VALID_EVENTS: [] }));
vi.mock("../lib/bruteForce.js", () => ({
  check: vi.fn(async () => ({ blocked: false, retryAfterSec: 0 })),
  recordFailure: vi.fn(async () => {}),
  recordSuccess: vi.fn(async () => {}),
}));
vi.mock("../lib/game/xp.js", () => ({ grantXpOnce: vi.fn(async () => {}), XP_REWARDS: { VERIFIED: 1 } }));

const { default: serversRouter } = await import("../routes/servers.js");
const { default: verificationRouter } = await import("../routes/verification.js");
const { check } = await import("../lib/bruteForce.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/servers", serversRouter);
  a.use("/api/verification", verificationRouter);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
}

const SID = "222222222222222222";
const ROLE = "111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.server.findUnique.mockResolvedValue({ id: SID });
  prismaMock.server.update.mockImplementation(async ({ data }) => ({ id: SID, ...data }));
  prismaMock.memberRoleSnapshot.deleteMany.mockResolvedValue({ count: 2 });
});

// ─── З8 ─────────────────────────────────────────────────────────────────────
describe("З8 — PATCH /api/servers/:id валидира роли, текстове и цвят", () => {
  const patch = (body) => request(app()).patch(`/api/servers/${SID}`).send(body);

  it("autoroleIds: не-snowflake елемент → 400, нищо не се записва", async () => {
    const res = await patch({ autoroleIds: [ROLE, "not-a-role"] });
    expect(res.status).toBe(400);
    expect(prismaMock.server.update).not.toHaveBeenCalled();
  });
  it("autoroleIds: над 20 роли → 400; точно 20 → 200", async () => {
    const mk = (n) => Array.from({ length: n }, (_, i) => String(100000000000000000n + BigInt(i)));
    expect((await patch({ autoroleIds: mk(21) })).status).toBe(400);
    expect((await patch({ autoroleIds: mk(20) })).status).toBe(200);
  });
  it("autoroleBotIds: същите правила", async () => {
    expect((await patch({ autoroleBotIds: ["x"] })).status).toBe(400);
    expect((await patch({ autoroleBotIds: [ROLE] })).status).toBe(200);
  });
  it("welcomerMessage и welcomerDmMessage: над 2000 → 400, до 2000 → 200", async () => {
    expect((await patch({ welcomerMessage: "a".repeat(2001) })).status).toBe(400);
    expect((await patch({ welcomerDmMessage: "a".repeat(2001) })).status).toBe(400);
    expect((await patch({ welcomerMessage: "a".repeat(2000), welcomerDmMessage: "b".repeat(2000) })).status).toBe(200);
  });
  it("welcomerEmbedColor: само hex", async () => {
    expect((await patch({ welcomerEmbedColor: "red" })).status).toBe(400);
    expect((await patch({ welcomerEmbedColor: "#12345" })).status).toBe(400);
    expect((await patch({ welcomerEmbedColor: "#8fe600" })).status).toBe(200);
    expect((await patch({ welcomerEmbedColor: "" })).status).toBe(200);
  });
  it("невалидният вход не стига до базата (нито findUnique)", async () => {
    await patch({ welcomerMessage: "a".repeat(5000) });
    expect(prismaMock.server.findUnique).not.toHaveBeenCalled();
  });
});

// ─── З10 ────────────────────────────────────────────────────────────────────
describe("З10 — изключване на „запазване на роли“ трие снимките", () => {
  it("stickyRolesEnabled:false → deleteMany по serverId от пътя", async () => {
    const res = await request(app()).patch(`/api/servers/${SID}`).send({ stickyRolesEnabled: false, serverId: "999999999999999999" });
    expect(res.status).toBe(200);
    expect(prismaMock.memberRoleSnapshot.deleteMany).toHaveBeenCalledWith({ where: { serverId: SID } });
  });
  it("stickyRolesEnabled:true или неспоменато → снимките остават", async () => {
    await request(app()).patch(`/api/servers/${SID}`).send({ stickyRolesEnabled: true });
    await request(app()).patch(`/api/servers/${SID}`).send({ welcomerEnabled: true });
    expect(prismaMock.memberRoleSnapshot.deleteMany).not.toHaveBeenCalled();
  });
});

// ─── З11 + З13 ──────────────────────────────────────────────────────────────
const PANEL = { id: "vp1", serverId: SID, maxAttempts: 3, cooldownMinutes: 10, grantRoleIds: [ROLE], removeRoleIds: [], logChannelId: null, dmOnSuccess: false };

describe("З11 — опитите за верификация са атомарни спрямо maxAttempts", () => {
  function serializedDb() {
    // Имитира реалния Postgres advisory lock: транзакциите по един ключ вървят
    // една след друга. Без транзакция в кода заявките се преплитат.
    const attempts = [];
    let chain = Promise.resolve();
    const tx = {
      $executeRaw: vi.fn(async () => {}),
      verificationAttempt: {
        count: vi.fn(async () => { await Promise.resolve(); return attempts.length; }),
        create: vi.fn(async ({ data }) => { await new Promise((r) => setTimeout(r, 1)); attempts.push(data); return data; }),
      },
    };
    prismaMock.verificationPanel.findUnique.mockResolvedValue(PANEL);
    prismaMock.verificationPanel.update.mockResolvedValue(PANEL);
    prismaMock.verificationAttempt.count.mockImplementation(tx.verificationAttempt.count);
    prismaMock.verificationAttempt.create.mockImplementation(tx.verificationAttempt.create);
    prismaMock.$transaction.mockImplementation((fn) => {
      const run = chain.then(() => fn(tx));
      chain = run.catch(() => {});
      return run;
    });
    return { attempts, tx };
  }

  it("10 паралелни опита при maxAttempts=3 → точно 3 записа и 7 пъти 429", async () => {
    const db = serializedDb();
    const reqs = Array.from({ length: 10 }, () =>
      request(app()).post("/api/verification/bot/vp1/attempt").send({ userId: "333333333333333333", success: false }));
    const res = await Promise.all(reqs);
    expect(res.filter((r) => r.status === 200)).toHaveLength(3);
    expect(res.filter((r) => r.status === 429)).toHaveLength(7);
    expect(db.attempts).toHaveLength(3);
    expect(res.find((r) => r.status === 429).body.code).toBe("VERIFICATION_COOLDOWN");
  });

  it("заключването е ПРЕДИ броенето в транзакцията", async () => {
    const db = serializedDb();
    const order = [];
    db.tx.$executeRaw.mockImplementation(async () => { order.push("lock"); });
    db.tx.verificationAttempt.count.mockImplementation(async () => { order.push("count"); return 0; });
    await request(app()).post("/api/verification/bot/vp1/attempt").send({ userId: "333333333333333333", success: true });
    expect(order.slice(0, 2)).toEqual(["lock", "count"]);
  });

  it("ескалирана блокировка → 429 без запис на опит", async () => {
    const db = serializedDb();
    check.mockResolvedValueOnce({ blocked: true, retryAfterSec: 600 });
    const res = await request(app()).post("/api/verification/bot/vp1/attempt").send({ userId: "333333333333333333", success: false });
    expect(res.status).toBe(429);
    expect(db.attempts).toHaveLength(0);
  });
});

describe("З13 — webhook за верификация", () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.verificationPanel.findUnique.mockResolvedValue(PANEL);
    prismaMock.verificationPanel.update.mockResolvedValue(PANEL);
    prismaMock.verificationAttempt.count.mockResolvedValue(0);
    prismaMock.verificationAttempt.create.mockResolvedValue({});
  });
  const attempt = (success) => request(app()).post("/api/verification/bot/vp1/attempt").send({ userId: "333333333333333333", success });

  it("успех → VERIFICATION_SUCCESS със serverId от панела", async () => {
    const res = await attempt(true);
    expect(res.status).toBe(200);
    expect(fireWebhooks).toHaveBeenCalledWith(SID, "VERIFICATION_SUCCESS", expect.objectContaining({ panelId: "vp1", userId: "333333333333333333" }));
  });
  it("провал → VERIFICATION_FAILURE", async () => {
    await attempt(false);
    expect(fireWebhooks).toHaveBeenCalledWith(SID, "VERIFICATION_FAILURE", expect.objectContaining({ panelId: "vp1" }));
  });
  it("отказ заради лимит не пуска webhook", async () => {
    prismaMock.verificationAttempt.count.mockResolvedValue(3);
    const res = await attempt(false);
    expect(res.status).toBe(429);
    expect(fireWebhooks).not.toHaveBeenCalled();
  });
  it("срив на webhook-а не чупи отговора към бота", async () => {
    fireWebhooks.mockRejectedValueOnce(new Error("boom"));
    expect((await attempt(true)).status).toBe(200);
  });
  it("имената на събитията са в VALID_EVENTS на услугата", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../services/webhooks.js", import.meta.url), "utf8");
    expect(src).toContain('"VERIFICATION_SUCCESS"');
    expect(src).toContain('"VERIFICATION_FAILURE"');
  });
});

// ─── З3: маршрут за ботa ────────────────────────────────────────────────────
describe("З3 — GET /api/verification/bot/server/:serverId/roles", () => {
  it("връща само id-та на роли, скоупнато по serverId", async () => {
    prismaMock.verificationPanel.findMany.mockResolvedValue([{ grantRoleIds: [ROLE], removeRoleIds: ["444444444444444444"], name: "secret" }]);
    const res = await request(app()).get(`/api/verification/bot/server/${SID}/roles`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ panels: [{ grantRoleIds: [ROLE], removeRoleIds: ["444444444444444444"] }] });
    expect(prismaMock.verificationPanel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serverId: SID } }));
  });
  it("невалиден serverId → 400", async () => {
    expect((await request(app()).get("/api/verification/bot/server/abc/roles")).status).toBe(400);
  });
});
