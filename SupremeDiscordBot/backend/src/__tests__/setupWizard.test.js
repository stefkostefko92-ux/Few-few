// backend/src/__tests__/setupWizard.test.js
// `/setup wizard` записва избора (собственикът, 28.11.2026: „направи и поправи всичко нужно“).
// Досега съветникът само показваше избраното и пращаше към таблото — нищо не се пазеше.
// Сега „Създай панел“ прави ЧЕРНОВА на панел (не е публикувана):
//   С1 избраните роли, категория и лог канал влизат в панела; един бутон; без канал/съобщение
//   С2 @everyone (ID = ID на сървъра) НИКОГА не става роля за поддръжка — иначе всеки вижда тикетите
//   С3 невалидни ID-та или повече от 5 роли → 400, нищо не се създава
//   С4 лимитът на плана важи (Free 1, Premium 50) — същият като в таблото, атомарно
//   С5 непознат сървър или махнат бот → 404
//   С6 одит PANEL_CREATED с човека от Discord
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const writeAudit = vi.fn(async () => true);
vi.mock("../lib/auditLog.js", () => ({ writeAudit: (...a) => writeAudit(...a) }));
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (_req, _res, next) => next(),
  requireAuth: (_req, _res, next) => next(),
  loadUser: (_req, _res, next) => next(),
  requireServerAdmin: (_req, _res, next) => next(),
}));
const getServerTier = vi.fn();
vi.mock("../lib/premium.js", async (orig) => ({ ...(await orig()), getServerTier: (...a) => getServerTier(...a) }));

const router = (await import("../routes/bot_setup.js")).default;
const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", router);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
};

const SID = "333333333333333333";
const USER = "111111111111111111";
const ROLE_A = "555555555555555551";
const ROLE_B = "555555555555555552";
const CAT = "700000000000000001";
const LOG = "800000000000000001";
const TEXT = { name: "Support", title: "Support", description: "Click below to open a ticket.", buttonLabel: "Open ticket" };
const go = (body, sid = SID) => request(app()).post(`/api/bot/setup-wizard/${sid}`).send(body);
const good = (over = {}) => ({ userId: USER, roleIds: [ROLE_A, ROLE_B], categoryId: CAT, logChannelId: LOG, ...TEXT, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  writeAudit.mockResolvedValue(true);
  prismaMock.$transaction.mockImplementation(async (arg) => (typeof arg === "function" ? arg(prismaMock) : Promise.all(arg)));
  prismaMock.server.findUnique.mockResolvedValue({ id: SID, botRemovedAt: null });
  getServerTier.mockResolvedValue({ isPremium: false, plan: "FREE" });
  prismaMock.panel.count.mockResolvedValue(0);
  prismaMock.panel.create.mockImplementation(async ({ data }) => ({ id: "cpanel000000000000000001", ...data }));
});

describe("С1 записът", () => {
  it("създава чернова с избраните роли, категория и лог канал — не е публикувана", async () => {
    const r = await go(good());
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: "cpanel000000000000000001", name: "Support" });
    const { data } = prismaMock.panel.create.mock.calls[0][0];
    expect(data).toMatchObject({
      serverId: SID,
      name: "Support",
      title: "Support",
      description: "Click below to open a ticket.",
      supportRoleIds: [ROLE_A, ROLE_B],
      categoryOpenId: CAT,
      logChannelId: LOG,
    });
    expect(data.channelId).toBeUndefined();
    expect(data.messageId).toBeUndefined();
    expect(data.buttons.create).toEqual([{ label: "Open ticket", style: "PRIMARY" }]);
  });
  it("пропуснати стъпки → празни полета, панелът пак се прави", async () => {
    const r = await go(good({ roleIds: [], categoryId: null, logChannelId: null }));
    expect(r.status).toBe(201);
    const { data } = prismaMock.panel.create.mock.calls[0][0];
    expect(data.supportRoleIds).toEqual([]);
    expect(data.categoryOpenId).toBeNull();
    expect(data.logChannelId).toBeNull();
  });
});

describe("С2 @everyone", () => {
  it("ID на сървъра (= @everyone) се маха от ролите за поддръжка", async () => {
    const r = await go(good({ roleIds: [SID, ROLE_A] }));
    expect(r.status).toBe(201);
    expect(prismaMock.panel.create.mock.calls[0][0].data.supportRoleIds).toEqual([ROLE_A]);
  });
  it("повторени роли — веднъж", async () => {
    await go(good({ roleIds: [ROLE_A, ROLE_A] }));
    expect(prismaMock.panel.create.mock.calls[0][0].data.supportRoleIds).toEqual([ROLE_A]);
  });
});

describe("С3 проверка на входа", () => {
  for (const [label, over] of [
    ["роля, която не е Discord ID", { roleIds: ["abc"] }],
    ["повече от 5 роли", { roleIds: ["1".repeat(18), "2".repeat(18), "3".repeat(18), "4".repeat(18), "5".repeat(18), "6".repeat(18)] }],
    ["категория, която не е Discord ID", { categoryId: "x" }],
    ["лог канал, който не е Discord ID", { logChannelId: "1; DROP" }],
    ["без човек", { userId: undefined }],
    ["празно име", { name: "" }],
    ["твърде дълъг надпис на бутона", { buttonLabel: "x".repeat(81) }],
  ]) {
    it(`${label} → 400, нищо не се създава`, async () => {
      const r = await go(good(over));
      expect(r.status).toBe(400);
      expect(prismaMock.panel.create).not.toHaveBeenCalled();
    });
  }
  it("невалиден сървър в пътя → 400", async () => {
    expect((await go(good(), "not-a-guild")).status).toBe(400);
  });
});

describe("С4 лимитът на плана", () => {
  it("Free с един панел → 403 LIMIT_REACHED, нищо не се създава", async () => {
    prismaMock.panel.count.mockResolvedValue(1);
    const r = await go(good());
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "LIMIT_REACHED", limit: 1 });
    expect(prismaMock.panel.create).not.toHaveBeenCalled();
  });
  it("Premium — лимитът е 50", async () => {
    getServerTier.mockResolvedValue({ isPremium: true, plan: "PREMIUM" });
    prismaMock.panel.count.mockResolvedValue(49);
    expect((await go(good())).status).toBe(201);
    prismaMock.panel.count.mockResolvedValue(50);
    const r = await go(good());
    expect(r.status).toBe(403);
    expect(r.body.limit).toBe(50);
  });
  it("броенето и създаването са в една сериализуема транзакция", async () => {
    await go(good());
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
});

describe("С5 сървърът", () => {
  it("непознат сървър → 404", async () => {
    prismaMock.server.findUnique.mockResolvedValue(null);
    expect((await go(good())).status).toBe(404);
    expect(prismaMock.panel.create).not.toHaveBeenCalled();
  });
  it("ботът е махнат от сървъра → 404", async () => {
    prismaMock.server.findUnique.mockResolvedValue({ id: SID, botRemovedAt: new Date() });
    expect((await go(good())).status).toBe(404);
    expect(prismaMock.panel.create).not.toHaveBeenCalled();
  });
});

describe("С6 одит", () => {
  it("PANEL_CREATED с човека от Discord и пътя на създаване", async () => {
    await go(good());
    const e = writeAudit.mock.calls.map(([x]) => x).find((x) => x.action === "PANEL_CREATED");
    expect(e).toMatchObject({ actorId: USER, serverId: SID, targetId: "cpanel000000000000000001", metadata: { name: "Support", via: "setup-wizard" } });
  });
});
