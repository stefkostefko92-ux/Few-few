// backend/src/__tests__/launchPhase2Applications.test.js
// Поток Т, фаза 2: Т6 (преглед условен по PENDING; обсъждане най-много веднъж и се затваря след
// решението), Т11 (мениджърите на кандидатури могат да ревюират), Т10 (бекенд страната: pingRoleIds).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/premium.js", async (orig) => ({
  ...(await orig()),
  getServerTier: vi.fn(async () => ({ plan: "premium", isPremium: true })),
  requirePremium: () => (req, res, next) => next(),
}));
vi.mock("../services/webhooks.js", async (orig) => ({ ...(await orig()), fireWebhooks: vi.fn(() => Promise.resolve()) }));
const notifyBot = vi.fn(() => Promise.resolve(null));
vi.mock("../services/botNotifier.js", () => ({
  notifyBot, notifyBotVerbose: vi.fn(), dmUser: vi.fn(), sendTicketReply: vi.fn(), reconcileWhitelabel: vi.fn(),
}));
let ADMIN = true;
vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (req, res, next) => next(),
  requireAuth: (req, res, next) => next(),
  loadUser: (req, res, next) => { req.user = { id: "333333333333333333", username: "mgr" }; next(); },
  requireServerAdmin: (req, res, next) => (ADMIN ? next() : res.status(403).json({ error: "You need Manage Server permission to access this" })),
}));
vi.mock("../lib/auditLog.js", () => ({ writeAudit: vi.fn(async () => true) }));
vi.mock("../lib/game/xp.js", () => ({ awardTicketSlaXp: vi.fn(), grantXpOnce: vi.fn(() => Promise.resolve()), XP_REWARDS: {} }));

const GUILD = "111111111111111111";
const USER = "222222222222222222";
const { default: botRouter } = await import("../routes/bot.js");
const { default: applicationsRouter } = await import("../routes/applications.js");
function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  a.use("/api/applications", applicationsRouter);
  a.use((err, _q, res, _n) => res.status(500).json({ error: err.message }));
  return a;
}
const botPost = (u, b) => request(app()).post(`/api/bot${u}`).set("x-bot-secret", "test-bot-secret").send(b);
const dash = (u, b) => request(app()).post(`/api/applications${u}`).send(b);

const application = () => ({
  id: "a1", serverId: GUILD, userId: USER, status: "PENDING", formId: "f1", answers: [], reviewMessageId: null,
  form: { id: "f1", name: "F", questions: [], acceptRoleIds: ["r1"], denyRoleIds: [], removeRoleIds: [], managerRoleIds: ["m1"] },
  user: { id: USER, username: "u" },
});

beforeEach(() => {
  vi.resetAllMocks();
  ADMIN = true;
  notifyBot.mockResolvedValue(null);
  prismaMock.application.findFirst.mockResolvedValue(application());
  prismaMock.application.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.application.update.mockResolvedValue({ id: "a1", status: "APPROVED" });
  prismaMock.ticket.findFirst.mockResolvedValue(null);
  prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.server.findUnique.mockResolvedValue({ name: "S" });
});

describe("Т6 — преглед условен по PENDING", () => {
  it("бот: загубилият надпреварата получава 409, роли и ЛС не се пращат втори път", async () => {
    prismaMock.application.updateMany.mockResolvedValue({ count: 0 });
    const r = await botPost("/application/a1/review", { action: "approve", serverId: GUILD, reviewerId: "9" });
    expect(r.status).toBe(409);
    expect(prismaMock.application.updateMany.mock.calls[0][0].where).toMatchObject({ id: "a1", serverId: GUILD, status: "PENDING" });
    expect(notifyBot).not.toHaveBeenCalledWith("APPLICATION_APPLY_OUTCOME", expect.anything());
  });
  it("бот: печелившият дава роли и ЛС точно веднъж", async () => {
    const r = await botPost("/application/a1/review", { action: "approve", serverId: GUILD, reviewerId: "9" });
    expect(r.status).toBe(200);
    const outcomes = notifyBot.mock.calls.filter((c) => c[0] === "APPLICATION_APPLY_OUTCOME");
    expect(outcomes).toHaveLength(1);
  });
  it("табло: същото — 409 при загубена надпревара", async () => {
    prismaMock.application.updateMany.mockResolvedValue({ count: 0 });
    const r = await dash(`/${GUILD}/a1/review`, { action: "deny", note: "n" });
    expect(r.status).toBe(409);
    expect(prismaMock.application.updateMany.mock.calls[0][0].where).toMatchObject({ status: "PENDING" });
    expect(notifyBot).not.toHaveBeenCalledWith("APPLICATION_APPLY_OUTCOME", expect.anything());
  });
});

describe("Т6 — канал за обсъждане", () => {
  it("мястото в базата се заема ПРЕДИ ботът да създаде канал; загубилият не създава канал", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);
    prismaMock.ticket.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    prismaMock.ticket.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "t0", channelId: "dc0", status: "OPEN" });
    const r = await botPost("/application/a1/discuss", { serverId: GUILD, reviewerId: "9" });
    expect(notifyBot).not.toHaveBeenCalledWith("APPLICATION_DISCUSS", expect.anything());
    expect(r.body).toMatchObject({ alreadyExists: true, channelId: "dc0" });
  });
  it("успех: create → бот → update на channelId (ред)", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);
    prismaMock.ticket.create.mockResolvedValue({ id: "t1" });
    prismaMock.ticket.update.mockResolvedValue({});
    notifyBot.mockResolvedValue({ ok: true, channelId: "dc1" });
    const r = await botPost("/application/a1/discuss", { serverId: GUILD, reviewerId: "9" });
    expect(r.body).toMatchObject({ ok: true, channelId: "dc1", ticketId: "t1" });
    expect(prismaMock.ticket.create.mock.invocationCallOrder[0]).toBeLessThan(notifyBot.mock.invocationCallOrder[0]);
    expect(prismaMock.ticket.update.mock.calls[0][0]).toMatchObject({ where: { id: "t1" }, data: { channelId: "dc1" } });
  });
  it("ботът не успя → резервацията се маха (няма осиротял ред)", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(null);
    prismaMock.ticket.create.mockResolvedValue({ id: "t1" });
    prismaMock.ticket.deleteMany.mockResolvedValue({ count: 1 });
    notifyBot.mockResolvedValue(null);
    const r = await botPost("/application/a1/discuss", { serverId: GUILD, reviewerId: "9" });
    expect(r.status).toBe(502);
    expect(prismaMock.ticket.deleteMany.mock.calls[0][0].where).toMatchObject({ id: "t1" });
  });
  it("решението затваря канала за обсъждане (условно) и казва на бота", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue({ id: "t1", channelId: "dc1", status: "OPEN" });
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 1 });
    await botPost("/application/a1/review", { action: "approve", serverId: GUILD, reviewerId: "9" });
    const w = prismaMock.ticket.updateMany.mock.calls[0][0];
    expect(w.where).toMatchObject({ applicationId: "a1", serverId: GUILD, status: { in: ["OPEN", "CLAIMED"] } });
    expect(w.data).toMatchObject({ status: "CLOSED" });
    expect(notifyBot).toHaveBeenCalledWith("APPLICATION_DISCUSSION_CLOSE", expect.objectContaining({ serverId: GUILD, channelId: "dc1" }));
  });
});

describe("Т11 — мениджърите на кандидатури", () => {
  it("табло: не-админ с мениджърска роля може да одобри", async () => {
    ADMIN = false;
    notifyBot.mockImplementation(async (ev) => (ev === "GUILD_MEMBER_ROLES" ? { ok: true, roleIds: ["m1", "x"] } : null));
    const r = await dash(`/${GUILD}/a1/review`, { action: "approve" });
    expect(r.status).toBe(200);
    expect(notifyBot).toHaveBeenCalledWith("GUILD_MEMBER_ROLES", { serverId: GUILD, userId: "333333333333333333" });
  });
  it("табло: без мениджърска роля → 403", async () => {
    ADMIN = false;
    notifyBot.mockImplementation(async (ev) => (ev === "GUILD_MEMBER_ROLES" ? { ok: true, roleIds: ["x"] } : null));
    const r = await dash(`/${GUILD}/a1/review`, { action: "approve" });
    expect(r.status).toBe(403);
    expect(prismaMock.application.updateMany).not.toHaveBeenCalled();
  });
  it("табло: ботът не отговаря → fail closed (403)", async () => {
    ADMIN = false;
    const r = await dash(`/${GUILD}/a1/review`, { action: "approve" });
    expect(r.status).toBe(403);
  });
  it("бот: GET reviewers връща managerRoleIds само за същия сървър", async () => {
    prismaMock.application.findFirst.mockResolvedValue({ form: { managerRoleIds: ["m1"] } });
    const ok = await request(app()).get(`/api/bot/application/a1/reviewers?serverId=${GUILD}`).set("x-bot-secret", "test-bot-secret");
    expect(ok.body).toEqual({ managerRoleIds: ["m1"] });
    expect(prismaMock.application.findFirst.mock.calls[0][0].where).toMatchObject({ id: "a1", serverId: GUILD });
    const bad = await request(app()).get("/api/bot/application/a1/reviewers").set("x-bot-secret", "test-bot-secret");
    expect(bad.status).toBe(400);
  });
});
