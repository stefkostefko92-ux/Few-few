// backend/src/__tests__/ticketParity.test.js
// „Каквото може ботът, да го има в таблото“ (собственикът, 28.11.2026).
// Одитът на Дискорджията намери действия с тикети, които се правеха САМО с команда в Discord:
//   П1 приоритет (/ticket priority)       П3 премести в панел (/escalate)
//   П2 преименуване (/rename)             П4 добави/махни човек (/ticket add|remove)
//   П5 търсене на член за П4 (иначе таблото иска Discord ID на ръка)
// Правилата са същите като в командите: rename и escalate са Premium; действието в Discord
// става ПРЕДИ записа — ако ботът не може, нищо не се записва.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const writeAudit = vi.fn(async () => true);
vi.mock("../lib/auditLog.js", () => ({ writeAudit: (...a) => writeAudit(...a) }));
const notifyBotVerbose = vi.fn();
vi.mock("../services/botNotifier.js", () => ({ notifyBotVerbose: (...a) => notifyBotVerbose(...a), notifyBot: vi.fn(), sendTicketReply: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = { id: "111111111111111111", globalRole: "USER" }; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
}));
const getServerTier = vi.fn();
// requirePremium вика ВЪТРЕШНИЯ getServerTier на модула — затова гардът се подменя с един, който
// пита мока. Самият гард е покрит в своите тестове; тук се проверява, че маршрутът го слага.
vi.mock("../lib/premium.js", async (orig) => ({
  ...(await orig()),
  getServerTier: (...a) => getServerTier(...a),
  requirePremium: (feature) => async (req, res, next) => {
    const tier = await getServerTier(req.params.serverId);
    if (!tier?.isPremium) return res.status(403).json({ code: "PREMIUM_REQUIRED", feature });
    next();
  },
}));

const ticketsRouter = (await import("../routes/tickets.js")).default;
const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/tickets", ticketsRouter);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
};

const SID = "333333333333333333";
const TID = "ticket1";
const ticket = (o = {}) => ({ id: TID, serverId: SID, status: "OPEN", channelId: "900000000000000001", panelId: "p1", priority: "NORMAL", creatorId: "222222222222222222", ...o });
const audited = (action) => writeAudit.mock.calls.map(([e]) => e).filter((e) => e.action === action);
const botCalls = (action) => notifyBotVerbose.mock.calls.filter(([ev, d]) => ev === "TICKET_MANAGE" && d.action === action).map(([, d]) => d);

beforeEach(() => {
  vi.resetAllMocks();
  writeAudit.mockResolvedValue(true);
  getServerTier.mockResolvedValue({ plan: "premium", isPremium: true });
  prismaMock.ticket.findFirst.mockResolvedValue(ticket());
  prismaMock.ticket.findUnique.mockResolvedValue(ticket());
  prismaMock.ticket.updateMany.mockResolvedValue({ count: 1 });
  notifyBotVerbose.mockResolvedValue({ ok: true });
});

describe("П1 приоритет от таблото", () => {
  const go = (priority) => request(app()).patch(`/api/tickets/${SID}/${TID}/priority`).send({ priority });
  it("невалиден → 400, без запис", async () => {
    expect((await go("SUPER")).status).toBe(400);
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
  });
  it("чужд тикет → 404 (търси се по сървъра)", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue(null);
    expect((await go("HIGH")).status).toBe(404);
    expect(prismaMock.ticket.findFirst.mock.calls[0][0].where).toMatchObject({ id: TID, serverId: SID });
  });
  it("затворен тикет → 409", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue(ticket({ status: "CLOSED" }));
    expect((await go("HIGH")).status).toBe(409);
  });
  it("записва условно, одитира и казва в канала (като командата)", async () => {
    const r = await go("URGENT");
    expect(r.status).toBe(200);
    const q = prismaMock.ticket.updateMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ id: TID, serverId: SID, status: { in: ["OPEN", "CLAIMED"] } });
    expect(q.data.priority).toBe("URGENT");
    expect(audited("TICKET_PRIORITY_CHANGED")[0]).toMatchObject({ actorId: "111111111111111111", metadata: { priority: "URGENT", from: "NORMAL", via: "dashboard" } });
    expect(botCalls("priority")[0]).toMatchObject({ serverId: SID, channelId: "900000000000000001", priority: "URGENT" });
  });
});

describe("П2 преименуване (Premium, като /rename)", () => {
  const go = (name) => request(app()).post(`/api/tickets/${SID}/${TID}/rename`).send({ name });
  it("Free → 403 PREMIUM_REQUIRED, без бота", async () => {
    getServerTier.mockResolvedValue({ plan: "free", isPremium: false });
    const r = await go("vip");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("PREMIUM_REQUIRED");
    expect(notifyBotVerbose).not.toHaveBeenCalled();
  });
  it("името се чисти като в командата (малки латински букви, цифри, тирета; без тире в краищата)", async () => {
    await go("VIP Support!!");
    expect(botCalls("rename")[0]).toMatchObject({ name: "vip-support" });
  });
  it("празно след чистене → 400", async () => {
    expect((await go("!!!")).status).toBe(400);
    expect((await go("")).status).toBe(400);
  });
  it("ботът не успя в Discord → 502 и нищо не се записва", async () => {
    notifyBotVerbose.mockResolvedValue({ botError: "Missing Permissions" });
    const r = await go("vip");
    expect(r.status).toBe(502);
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
    expect(audited("TICKET_RENAMED")).toEqual([]);
  });
  it("успех → запис и одит", async () => {
    const r = await go("vip");
    expect(r.status).toBe(200);
    expect(audited("TICKET_RENAMED")[0]).toMatchObject({ metadata: { newName: "vip", via: "dashboard" } });
  });
});

describe("П3 премести в друг панел (Premium, като /escalate)", () => {
  const go = (panelId) => request(app()).post(`/api/tickets/${SID}/${TID}/move`).send({ panelId });
  it("панел от друг сървър → 404", async () => {
    prismaMock.panel.findFirst.mockResolvedValue(null);
    expect((await go("p9")).status).toBe(404);
    expect(prismaMock.panel.findFirst.mock.calls[0][0].where).toMatchObject({ id: "p9", serverId: SID });
    expect(notifyBotVerbose).not.toHaveBeenCalled();
  });
  it("същият панел → 409", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", name: "A", supportRoleIds: [], categoryOpenId: null, categoryId: null });
    expect((await go("p1")).status).toBe(409);
  });
  it("ботът получава ролите на двата панела; после записът", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p2", name: "Billing", supportRoleIds: ["r2"], categoryOpenId: "c2", categoryId: null });
    prismaMock.panel.findUnique.mockResolvedValue({ id: "p1", name: "General", supportRoleIds: ["r1"], categoryOpenId: "c1", categoryId: null });
    const r = await go("p2");
    expect(r.status).toBe(200);
    expect(botCalls("move")[0]).toMatchObject({
      currentPanel: { supportRoleIds: ["r1"], categoryOpenId: "c1" },
      targetPanel: { supportRoleIds: ["r2"], categoryOpenId: "c2" },
    });
    const q = prismaMock.ticket.updateMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ id: TID, serverId: SID, panelId: "p1" });
    expect(q.data.panelId).toBe("p2");
    expect(audited("TICKET_ESCALATED")[0]).toMatchObject({ metadata: { fromPanelId: "p1", toPanelId: "p2", via: "dashboard" } });
  });
});

describe("П4 добави или махни човек", () => {
  const go = (body) => request(app()).post(`/api/tickets/${SID}/${TID}/members`).send(body);
  it("невалиден ID или действие → 400", async () => {
    expect((await go({ userId: "abc", action: "add" })).status).toBe(400);
    expect((await go({ userId: "444444444444444444", action: "kick" })).status).toBe(400);
  });
  it("добавяне → ботът в Discord, после одит", async () => {
    const r = await go({ userId: "444444444444444444", action: "add" });
    expect(r.status).toBe(200);
    expect(botCalls("add")[0]).toMatchObject({ serverId: SID, channelId: "900000000000000001", userId: "444444444444444444" });
    expect(audited("TICKET_MEMBER_ADDED")).toHaveLength(1);
  });
  it("ботът не успя → 502, без одит", async () => {
    notifyBotVerbose.mockResolvedValue({ botError: "Missing Permissions" });
    const r = await go({ userId: "444444444444444444", action: "remove" });
    expect(r.status).toBe(502);
    expect(audited("TICKET_MEMBER_REMOVED")).toEqual([]);
  });
});

describe("П5 търсене на член (без да се пише Discord ID на ръка)", () => {
  it("кратка заявка → 400", async () => {
    expect((await request(app()).get(`/api/tickets/${SID}/member-search?q=a`)).status).toBe(400);
  });
  it("пита бота само за този сървър и връща само име и ID", async () => {
    notifyBotVerbose.mockResolvedValue({ ok: true, members: [{ id: "444444444444444444", name: "Иван", username: "ivan", avatar: "x", email: "never" }] });
    const r = await request(app()).get(`/api/tickets/${SID}/member-search?q=iva`);
    expect(r.status).toBe(200);
    expect(notifyBotVerbose).toHaveBeenCalledWith("MEMBER_SEARCH", { guildId: SID, q: "iva" });
    expect(r.body.members).toEqual([{ id: "444444444444444444", name: "Иван", username: "ivan" }]);
  });
});
