// backend/src/__tests__/launchTickets.test.js
// Поток Т, фаза 1 (docs/LAUNCH_READINESS_SPEC.md): Т2, Т4, Т5, Т12, Т14, Т16, Т18, А2.
// Всеки тест пада на стария код (доказано при написването им — виж предаването).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Планът се задава от теста.
let PLAN = "premium";
vi.mock("../lib/premium.js", async (orig) => ({
  ...(await orig()),
  getServerTier: vi.fn(async () => ({ plan: PLAN, isPremium: PLAN !== "free" })),
  requirePremium: () => (req, res, next) => next(),
}));

const fireWebhooks = vi.fn(() => Promise.resolve());
vi.mock("../services/webhooks.js", async (orig) => ({ ...(await orig()), fireWebhooks }));

const notifyBot = vi.fn(() => Promise.resolve(null));
const notifyBotVerbose = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock("../services/botNotifier.js", () => ({
  notifyBot, notifyBotVerbose, dmUser: vi.fn(), sendTicketReply: vi.fn(() => Promise.resolve({ ok: true })),
  reconcileWhitelabel: vi.fn(),
}));

vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (req, res, next) => next(),
  requireAuth: (req, res, next) => next(),
  loadUser: (req, res, next) => { req.user = { id: "staff1", username: "staff" }; next(); },
  requireServerAdmin: (req, res, next) => next(),
}));
vi.mock("../lib/crypto.js", () => ({ decrypt: vi.fn() }));
vi.mock("../services/roundRobin.js", () => ({ pickNextAssignee: vi.fn(async () => null) }));
vi.mock("../services/aiReply.js", () => ({ generateAutoReply: vi.fn(), aiRateLimitOk: vi.fn(), AI_MODEL_NAME: "m" }));
vi.mock("../utils/archive.js", () => ({ generateHtmlTranscript: () => "<html></html>" }));
vi.mock("../lib/transcriptAtRest.js", () => ({ sealTranscript: (x) => x, openTranscript: (x) => x }));
vi.mock("../lib/archiveToken.js", () => ({
  ensureArchiveToken: vi.fn(async () => "tok"),
  tokenizedArchiveUrl: (id, t) => `/archive/ticket/${id}?t=${t}`,
  archiveTokenMatches: () => true,
}));
vi.mock("../lib/auditLog.js", () => ({ writeAudit: vi.fn(async () => true) }));
vi.mock("../lib/game/xp.js", () => ({ awardTicketSlaXp: vi.fn(() => Promise.resolve()), grantXpOnce: vi.fn(() => Promise.resolve()), XP_REWARDS: {} }));

const GUILD = "111111111111111111";
const USER = "222222222222222222";

const { default: botRouter } = await import("../routes/bot.js");
const { default: ticketsRouter } = await import("../routes/tickets.js");
const { default: panelsRouter, planButtonSync } = await import("../routes/panels.js");
const { default: applicationsRouter } = await import("../routes/applications.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botRouter);
  a.use("/api/tickets", ticketsRouter);
  a.use("/api/panels", panelsRouter);
  a.use("/api/applications", applicationsRouter);
  return a;
}
const bot = {
  post: (u, b) => request(app()).post(`/api/bot${u}`).set("x-bot-secret", "test-bot-secret").send(b),
  get: (u) => request(app()).get(`/api/bot${u}`).set("x-bot-secret", "test-bot-secret"),
};

const closedTicketRow = (over = {}) => ({
  id: "t1", serverId: GUILD, creatorId: USER, assigneeId: null, number: 7, channelId: "333333333333333333",
  panelId: "p1", status: "CLOSED", closeReason: "done", archiveToken: null, messages: [],
  panel: { transcriptChannelId: null, name: "Support" }, server: { archiveChannelId: null, name: "S" },
  ...over,
});
const panelRow = (over = {}) => ({
  id: "p1", serverId: GUILD, name: "Support", supportRoleIds: ["r1"],
  dmOnClose: true, dmOnCloseMessage: "bye", feedbackEnabled: true, categoryClosedId: "cat9",
  transcriptChannelId: "tc1", logChannelId: "lg1", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  PLAN = "premium";
  prismaMock.ticket.update.mockResolvedValue({});
  prismaMock.ticket.updateMany.mockResolvedValue({ count: 1 });
});

// ─── Т2: едно условно затваряне ──────────────────────────────────────────────
describe("Т2 — условно затваряне", () => {
  it("печели ТОЧНО един updateMany със старото състояние (OPEN, CLAIMED) и сървъра", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(closedTicketRow());
    prismaMock.panel.findFirst.mockResolvedValue(panelRow());

    const res = await bot.post("/ticket/t1/close", { closedById: "staff1", reason: "ok", serverId: GUILD });

    expect(res.status).toBe(200);
    const where = prismaMock.ticket.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "t1", status: { in: ["OPEN", "CLAIMED"] }, serverId: GUILD });
    expect(fireWebhooks).toHaveBeenCalledTimes(1);
    expect(fireWebhooks).toHaveBeenCalledWith(GUILD, "TICKET_CLOSE", expect.objectContaining({ ticketId: "t1" }));
  });

  it("второто едновременно затваряне получава 409 и не праща webhook/транскрипт", async () => {
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticket.findFirst.mockResolvedValue({ status: "CLOSED" });

    const res = await bot.post("/ticket/t1/close", { closedById: "staff2", serverId: GUILD });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_CLOSED");
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
    expect(fireWebhooks).not.toHaveBeenCalled();
  });

  it("при неактивност условието носи lastActivityAt < cutoff; тикет с нова активност не се затваря", async () => {
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticket.findFirst.mockResolvedValue({ status: "OPEN" }); // още отворен → има активност
    const cutoff = Date.now() - 3_600_000;

    const res = await bot.post("/ticket/t1/close", { serverId: GUILD, inactiveBeforeMs: cutoff });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACTIVE_AGAIN");
    const where = prismaMock.ticket.updateMany.mock.calls[0][0].where;
    expect(where.lastActivityAt.lt).toEqual(new Date(cutoff));
    expect(fireWebhooks).not.toHaveBeenCalled();
  });

  it("тикет от ДРУГ сървър не се затваря (изолация)", async () => {
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticket.findFirst.mockResolvedValue(null);

    const res = await bot.post("/ticket/t1/close", { serverId: "999999999999999999" });

    expect(res.status).toBe(404);
    expect(prismaMock.ticket.updateMany.mock.calls[0][0].where.serverId).toBe("999999999999999999");
  });

  it("затварянето от таблото минава през същото условно затваряне и праща Discord частта на бота", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue(closedTicketRow());

    const res = await request(app()).post(`/api/tickets/${GUILD}/t1/close`).send({ reason: "dash" });

    expect(res.status).toBe(200);
    expect(prismaMock.ticket.updateMany.mock.calls[0][0].where.status).toEqual({ in: ["OPEN", "CLAIMED"] });
    expect(notifyBotVerbose).toHaveBeenCalledWith("TICKET_CLOSE", expect.objectContaining({
      ticketId: "t1", serverId: GUILD, closedById: "staff1",
    }));
    expect(fireWebhooks).toHaveBeenCalledTimes(1); // един път, не от два пътя
  });

  it("затваряне от таблото на вече затворен тикет → 400, без бот известие", async () => {
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticket.findFirst.mockResolvedValue({ status: "CLOSED" });

    const res = await request(app()).post(`/api/tickets/${GUILD}/t1/close`).send({});

    expect(res.status).toBe(400);
    expect(notifyBotVerbose).not.toHaveBeenCalled();
  });
});

// ─── Т4: claim само на OPEN ──────────────────────────────────────────────────
describe("Т4 — claim", () => {
  const claim = () => bot.post("/ticket/t1/claim", { userId: "staff1" });

  it("е условен запис върху status OPEN", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ serverId: GUILD });
    await claim();
    expect(prismaMock.ticket.updateMany.mock.calls[0][0].where).toMatchObject({ id: "t1", status: "OPEN" });
  });

  it("затворен тикет → 409 NOT_OPEN (не става CLAIMED)", async () => {
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticket.findUnique
      .mockResolvedValueOnce({ serverId: GUILD })            // gateTicketFeature
      .mockResolvedValueOnce({ status: "CLOSED", assigneeId: null });
    const res = await claim();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_OPEN");
  });

  it("чужд claim не се краде → 409 ALREADY_CLAIMED", async () => {
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.ticket.findUnique
      .mockResolvedValueOnce({ serverId: GUILD })
      .mockResolvedValueOnce({ status: "CLAIMED", assigneeId: "other" });
    const res = await claim();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_CLAIMED");
  });

  it("на Free отказът е 403 PREMIUM_REQUIRED с код (ботът го показва ephemeral)", async () => {
    PLAN = "free";
    prismaMock.ticket.findUnique.mockResolvedValue({ serverId: GUILD });
    const res = await claim();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PREMIUM_REQUIRED");
    expect(prismaMock.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("таблото: claim на не-OPEN тикет → 409", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue({ id: "t1", status: "CLOSED", assigneeId: null });
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app()).post(`/api/tickets/${GUILD}/t1/claim`).send({});
    expect(res.status).toBe(409);
  });
});

// ─── Т5: един изчистен по план панел ─────────────────────────────────────────
describe("Т5 — изчистен по план панел за by-channel и за /:id", () => {
  beforeEach(() => {
    prismaMock.ticket.findFirst.mockResolvedValue({ id: "t1", serverId: GUILD, panelId: "p1", status: "OPEN", creatorId: USER });
    prismaMock.ticket.findUnique.mockResolvedValue({ id: "t1", serverId: GUILD, panelId: "p1", status: "OPEN", creatorId: USER });
    prismaMock.panel.findFirst.mockResolvedValue(panelRow());
  });

  it("by-channel връща ПЪЛНИЯ панел (име, ЛС, оценка, лог, категории) за Premium", async () => {
    const res = await bot.get("/ticket/by-channel/333333333333333333");
    expect(res.status).toBe(200);
    expect(res.body.panel).toMatchObject({
      name: "Support", dmOnClose: true, dmOnCloseMessage: "bye", feedbackEnabled: true,
      logChannelId: "lg1", categoryClosedId: "cat9", transcriptChannelId: "tc1",
    });
  });

  it("свален на Free: нито by-channel, нито /:id пращат платените неща", async () => {
    PLAN = "free";
    for (const url of ["/ticket/by-channel/333333333333333333", "/ticket/t1"]) {
      prismaMock.panel.findFirst.mockResolvedValue(panelRow());
      const res = await bot.get(url);
      expect(res.status).toBe(200);
      expect(res.body.panel.dmOnClose, url).toBe(false);
      expect(res.body.panel.feedbackEnabled, url).toBe(false);
      expect(res.body.panel.categoryClosedId, url).toBeNull();
      expect(res.body.panel.name, url).toBe("Support"); // базовото остава
    }
  });

  it("отговорът на затваряне носи изчистения панел (бутонът и /ticket close ползват него)", async () => {
    PLAN = "free";
    prismaMock.ticket.findUnique.mockResolvedValue(closedTicketRow());
    prismaMock.panel.findFirst.mockResolvedValue(panelRow());
    const res = await bot.post("/ticket/t1/close", { closedById: "staff1", serverId: GUILD });
    expect(res.body.panel.dmOnClose).toBe(false);
    expect(res.body.panel.name).toBe("Support");
  });
});

// ─── Т12: лимитът ПРЕДИ канал ────────────────────────────────────────────────
describe("Т12 — предварителна проверка на лимита", () => {
  it("precheck казва, че лимитът е достигнат (с броя), без да създава нищо", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", name: "Support", maxOpenPerUser: 1, maxOpenPerUserPanel: null });
    prismaMock.ticket.count.mockResolvedValue(1);

    const res = await bot.get(`/ticket/precheck?serverId=${GUILD}&creatorId=${USER}&panelId=p1`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ allowed: false, code: "MAX_TICKETS_REACHED", count: 1, max: 1 });
    expect(prismaMock.ticket.create).not.toHaveBeenCalled();
  });

  it("precheck разрешава под лимита", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", name: "S", maxOpenPerUser: 2, maxOpenPerUserPanel: null });
    prismaMock.ticket.count.mockResolvedValue(1);
    const res = await bot.get(`/ticket/precheck?serverId=${GUILD}&creatorId=${USER}&panelId=p1`);
    expect(res.body).toEqual({ allowed: true });
  });

  it("precheck за панел от друг сървър → 404 (изолация)", async () => {
    prismaMock.panel.findFirst.mockResolvedValue(null);
    const res = await bot.get(`/ticket/precheck?serverId=${GUILD}&creatorId=${USER}&panelId=foreign`);
    expect(res.status).toBe(404);
    expect(prismaMock.panel.findFirst.mock.calls[0][0].where).toMatchObject({ id: "foreign", serverId: GUILD });
  });
});

// ─── А2: webhook на всеки път ────────────────────────────────────────────────
describe("А2 — webhook събития от бот пътя", () => {
  it("създаването праща TICKET_OPEN", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", name: "S", maxOpenPerUser: 5, supportRoleIds: [], defaultPriority: "NORMAL" });
    prismaMock.ticket.count.mockResolvedValue(0);
    prismaMock.ticket.create.mockResolvedValue({ id: "t9", number: 3 });
    prismaMock.panel.update.mockResolvedValue({ ticketCounter: 3, counterPadding: 4 });
    prismaMock.server.findUnique.mockResolvedValue({ aiRepliesEnabled: false });

    const res = await bot.post("/ticket/create", { serverId: GUILD, panelId: "p1", creatorId: USER, channelId: "333333333333333333" });

    expect(res.status).toBe(200);
    expect(fireWebhooks).toHaveBeenCalledWith(GUILD, "TICKET_OPEN", expect.objectContaining({ ticketId: "t9", creatorId: USER }));
  });

  it("reopen е условен (CLOSED → OPEN) и праща TICKET_REOPEN; второ → 409", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ status: "CLOSED", serverId: GUILD, id: "t1", number: 7, creatorId: USER });
    const ok = await bot.post("/ticket/t1/reopen", { reopenerId: "staff1" });
    expect(ok.status).toBe(200);
    expect(prismaMock.ticket.updateMany.mock.calls[0][0].where).toMatchObject({ id: "t1", status: "CLOSED" });
    expect(fireWebhooks).toHaveBeenCalledWith(GUILD, "TICKET_REOPEN", expect.anything());

    fireWebhooks.mockClear();
    prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });
    const dup = await bot.post("/ticket/t1/reopen", { reopenerId: "staff2" });
    expect(dup.status).toBe(409);
    expect(fireWebhooks).not.toHaveBeenCalled();
  });

  it("изтриването праща TICKET_DELETE", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ serverId: GUILD, status: "CLOSED", archiveHtml: "x", archiveToken: "tok" });
    const res = await bot.post("/ticket/t1/delete", { deleterId: "staff1" });
    expect(res.status).toBe(200);
    expect(fireWebhooks).toHaveBeenCalledWith(GUILD, "TICKET_DELETE", expect.objectContaining({ ticketId: "t1" }));
  });
});

// ─── Т14: отговор от таблото е активност ─────────────────────────────────────
describe("Т14 — отговор от таблото", () => {
  it("вдига lastActivityAt и firstResponseAt (иначе фалшива SLA аларма и авто-затваряне)", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue({ id: "t1", status: "OPEN", channelId: "c1", number: 1, firstResponseAt: null });
    prismaMock.ticketMessage.create.mockResolvedValue({ id: "m1" });

    const res = await request(app()).post(`/api/tickets/${GUILD}/t1/reply`).send({ content: "здравей" });

    expect(res.status).toBe(201);
    const data = prismaMock.ticket.update.mock.calls.at(-1)[0].data;
    expect(data.lastActivityAt).toBeInstanceOf(Date);
    expect(data.firstResponseAt).toBeInstanceOf(Date);
  });

  it("вече отбелязан първи отговор не се пренаписва", async () => {
    prismaMock.ticket.findFirst.mockResolvedValue({ id: "t1", status: "OPEN", channelId: "c1", number: 1, firstResponseAt: new Date("2026-01-01") });
    prismaMock.ticketMessage.create.mockResolvedValue({ id: "m1" });
    await request(app()).post(`/api/tickets/${GUILD}/t1/reply`).send({ content: "пак" });
    const data = prismaMock.ticket.update.mock.calls.at(-1)[0].data;
    expect(data.lastActivityAt).toBeInstanceOf(Date);
    expect(data.firstResponseAt).toBeUndefined();
  });
});

// ─── Т16: стабилни ID на бутоните ────────────────────────────────────────────
describe("Т16 — редакция на панел пази ID-тата на бутоните", () => {
  const existing = [{ id: "b1", label: "Support" }, { id: "b2", label: "Billing" }];

  it("planButtonSync: по етикет — преподреждане/без id пази ID-тата", () => {
    const plan = planButtonSync(existing, [{ label: "Billing" }, { label: "Support" }]);
    expect(plan.updates.map((u) => u.id).sort()).toEqual(["b1", "b2"]);
    expect(plan.creates).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("planButtonSync: преименуван на място бутон пази ID-то; нов се създава; махнат се трие", () => {
    const plan = planButtonSync(existing, [{ label: "Help" }, { label: "Billing" }, { label: "New" }]);
    const byId = Object.fromEntries(plan.updates.map((u) => [u.id, u.data.label]));
    expect(byId).toEqual({ b2: "Billing", b1: "Help" });
    expect(plan.creates.map((c) => c.label)).toEqual(["New"]);
    expect(plan.deleteIds).toEqual([]);
    expect(planButtonSync(existing, [{ label: "Billing" }]).deleteIds).toEqual(["b1"]);
  });

  it("planButtonSync: явен id печели; чужд id се игнорира", () => {
    const plan = planButtonSync(existing, [{ id: "b2", label: "Alpha" }, { id: "FOREIGN", label: "Beta" }]);
    expect(plan.updates.find((u) => u.id === "b2").data.label).toBe("Alpha");
    expect(plan.updates.some((u) => u.id === "FOREIGN")).toBe(false);
  });

  it("PUT не прави deleteMany:{} + create (старият начин убива всеки публикуван бутон)", async () => {
    prismaMock.panel.findFirst.mockResolvedValue({ id: "p1", serverId: GUILD });
    prismaMock.panelButton.findMany.mockResolvedValue(existing);
    prismaMock.panel.update.mockResolvedValue({ id: "p1", buttons: [] });

    const res = await request(app()).put(`/api/panels/${GUILD}/p1`).send({
      buttons: [{ label: "Support", style: "PRIMARY" }, { label: "Billing", style: "SUCCESS" }],
    });

    expect(res.status).toBe(200);
    const ops = prismaMock.panel.update.mock.calls[0][0].data.buttons;
    expect(ops.deleteMany).toBeUndefined();
    expect(ops.create).toBeUndefined();
    expect(ops.update.map((u) => u.where.id).sort()).toEqual(["b1", "b2"]);
  });
});

// ─── Т18: {server} е името ───────────────────────────────────────────────────
describe("Т18 — {server} в ЛС при преглед на кандидатура", () => {
  const application = () => ({
    id: "a1", serverId: GUILD, userId: USER, status: "PENDING",
    user: { id: USER, username: "ivan" },
    form: { name: "Staff", acceptMessage: "Welcome to {server}, {username}! {note}", denyMessage: null, acceptRoleIds: [], questions: [] },
  });

  it("бот пътят подставя ИМЕТО на сървъра, не snowflake", async () => {
    prismaMock.application.findFirst.mockResolvedValue(application());
    prismaMock.application.update.mockResolvedValue({});
    prismaMock.application.updateMany.mockResolvedValue({ count: 1 }); // Т6: условен запис по PENDING
    prismaMock.server.findUnique.mockResolvedValue({ name: "Cool Guild" });

    const res = await bot.post("/application/a1/review", { action: "approve", note: "gg", serverId: GUILD, reviewerId: "r1" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(notifyBot).toHaveBeenCalled());
    const payload = notifyBot.mock.calls.find((c) => c[0] === "APPLICATION_APPLY_OUTCOME")[1];
    expect(payload.dmMessage).toBe("Welcome to Cool Guild, ivan! gg");
    expect(payload.dmMessage).not.toContain(GUILD);
  });

  it("пътят от таблото също", async () => {
    prismaMock.application.findFirst.mockResolvedValue(application());
    prismaMock.application.update.mockResolvedValue({});
    prismaMock.application.updateMany.mockResolvedValue({ count: 1 }); // Т6: условен запис по PENDING
    prismaMock.server.findUnique.mockResolvedValue({ name: "Cool Guild" });

    const res = await request(app()).post(`/api/applications/${GUILD}/a1/review`).send({ action: "approve", note: "x" });

    expect(res.status).toBe(200);
    const payload = notifyBot.mock.calls.find((c) => c[0] === "APPLICATION_APPLY_OUTCOME")?.[1];
    expect(payload?.dmMessage).toBe("Welcome to Cool Guild, ivan! x");
  });
});
