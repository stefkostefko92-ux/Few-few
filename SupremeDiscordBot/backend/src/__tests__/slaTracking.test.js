// backend/src/__tests__/slaTracking.test.js
// v31 SLA tracking — two independent pieces:
//   (1) POST /api/bot/ticket/:ticketId/message sets Ticket.firstResponseAt on
//       the first non-creator message (routes/bot.js).
//   (2) The scheduler's SLA breach job flags OPEN/CLAIMED tickets that missed
//       their panel's first-response/resolution target and notifies once
//       (services/scheduler.js).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../middleware/auth.js", () => ({
  requireBotSecret: (req, res, next) => next(),
}));

// bot.js pulls in a few unrelated services at module load — stub them so the
// import doesn't reach for real crypto/AI/round-robin config.
vi.mock("../lib/crypto.js", () => ({ decrypt: vi.fn() }));
vi.mock("../services/roundRobin.js", () => ({ pickNextAssignee: vi.fn() }));
vi.mock("../services/aiReply.js", () => ({
  generateAutoReply: vi.fn(),
  aiRateLimitOk: vi.fn(),
  AI_MODEL_NAME: "test-model",
}));

const botRouter = (await import("../routes/bot.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/bot", botRouter);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /ticket/:ticketId/message — first-response marker", () => {
  it("sets firstResponseAt when the first reply comes from someone other than the creator", async () => {
    prismaMock.ticketMessage.create.mockResolvedValue({ id: "m1", ticketId: "t1" });
    prismaMock.ticket.findUnique.mockResolvedValue({ creatorId: "creator1", firstResponseAt: null });
    prismaMock.ticket.update.mockResolvedValue({ id: "t1" });

    const res = await request(buildApp())
      .post("/api/bot/ticket/t1/message")
      .send({ authorId: "staff1", authorTag: "staff#0001", content: "hi" });

    expect(res.status).toBe(200);
    // v3.2 — update-ът вече вдига и `lastActivityAt` при ВСЯКО съобщение
    // (иначе авто-затварянето по неактивност убива активни тикети). Затова
    // очакването е обектно съвпадение, не точен обект.
    expect(prismaMock.ticket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ firstResponseAt: expect.any(Date), lastActivityAt: expect.any(Date) }),
    });
  });

  it("does NOT set firstResponseAt when the creator sends their own (e.g. follow-up) message", async () => {
    prismaMock.ticketMessage.create.mockResolvedValue({ id: "m2", ticketId: "t1" });
    prismaMock.ticket.findUnique.mockResolvedValue({ creatorId: "creator1", firstResponseAt: null });
    prismaMock.ticket.update.mockResolvedValue({ id: "t1" });

    const res = await request(buildApp())
      .post("/api/bot/ticket/t1/message")
      .send({ authorId: "creator1", authorTag: "creator#0001", content: "still waiting?" });

    expect(res.status).toBe(200);
    // Update-ът СЕ прави (за lastActivityAt), но НЕ пипа първия отговор.
    const data = prismaMock.ticket.update.mock.calls.at(-1)?.[0]?.data;
    expect(data?.lastActivityAt).toBeInstanceOf(Date);
    expect(data?.firstResponseAt).toBeUndefined();
  });

  it("does NOT overwrite an already-set firstResponseAt", async () => {
    prismaMock.ticketMessage.create.mockResolvedValue({ id: "m3", ticketId: "t1" });
    prismaMock.ticket.update.mockResolvedValue({ id: "t1" });
    prismaMock.ticket.findUnique.mockResolvedValue({
      creatorId: "creator1",
      firstResponseAt: new Date("2026-08-01T00:00:00Z"),
    });

    const res = await request(buildApp())
      .post("/api/bot/ticket/t1/message")
      .send({ authorId: "staff2", authorTag: "staff2#0001", content: "second reply" });

    expect(res.status).toBe(200);
    const data2 = prismaMock.ticket.update.mock.calls.at(-1)?.[0]?.data;
    expect(data2?.lastActivityAt).toBeInstanceOf(Date);
    expect(data2?.firstResponseAt).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler breach job
// ─────────────────────────────────────────────────────────────────────────────

describe("SLA breach scheduler job", () => {
  let jobs;
  let dmUserMock;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../lib/prisma.js", () => ({ prisma: prismaMock }));

    jobs = {};
    vi.doMock("node-cron", () => ({
      default: { schedule: vi.fn((expr, fn) => { jobs[expr] = fn; }) },
    }));

    dmUserMock = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock("../services/botNotifier.js", () => ({
      notifyBot: vi.fn().mockResolvedValue(null),
      dmUser: dmUserMock,
    }));

    await import("../services/scheduler.js");
  });

  function runBreachJob() {
    return jobs["*/10 * * * *"]();
  }

  it("flags a ticket overdue on first response, marks it, audits, and DMs the assignee", async () => {
    const oldEnough = new Date(Date.now() - 60 * 60 * 1000); // 1h old

    prismaMock.panel.findMany.mockResolvedValue([
      { id: "p1", name: "Support", serverId: "s1", slaFirstResponseMinutes: 30, slaResolutionMinutes: null },
    ]);
    prismaMock.ticket.findMany.mockResolvedValue([
      { id: "t1", serverId: "s1", number: 7, assigneeId: "staff1", createdAt: oldEnough },
    ]);
    prismaMock.ticket.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.server.findUnique.mockResolvedValue({ ownerId: "owner1" });

    await runBreachJob();

    expect(prismaMock.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          panelId: "p1",
          status: { in: ["OPEN", "CLAIMED"] },
          firstResponseAt: null,
          slaBreachedAt: null,
        }),
      })
    );
    expect(prismaMock.ticket.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { slaBreachedAt: expect.any(Date) },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "SLA_BREACH",
        serverId: "s1",
        targetId: "t1",
        metadata: expect.objectContaining({ type: "first_response", panelId: "p1" }),
      }),
    });
    // Assignee is set → DM goes to the assignee, not the server owner.
    expect(dmUserMock).toHaveBeenCalledWith("staff1", expect.objectContaining({ title: expect.stringContaining("SLA breached") }));
  });

  it("falls back to the server owner when the ticket has no assignee", async () => {
    const oldEnough = new Date(Date.now() - 90 * 60 * 1000);

    prismaMock.panel.findMany.mockResolvedValue([
      { id: "p1", name: "Support", serverId: "s1", slaFirstResponseMinutes: null, slaResolutionMinutes: 60 },
    ]);
    prismaMock.ticket.findMany.mockResolvedValue([
      { id: "t2", serverId: "s1", number: 8, assigneeId: null, createdAt: oldEnough },
    ]);
    prismaMock.ticket.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.server.findUnique.mockResolvedValue({ ownerId: "owner1" });

    await runBreachJob();

    expect(dmUserMock).toHaveBeenCalledWith("owner1", expect.anything());
  });

  it("skips panels without any SLA configured (both fields null)", async () => {
    prismaMock.panel.findMany.mockResolvedValue([]);

    await runBreachJob();

    expect(prismaMock.ticket.findMany).not.toHaveBeenCalled();
  });

  it("does not fail the whole batch when one ticket update throws", async () => {
    const oldEnough = new Date(Date.now() - 60 * 60 * 1000);

    prismaMock.panel.findMany.mockResolvedValue([
      { id: "p1", name: "Support", serverId: "s1", slaFirstResponseMinutes: 30, slaResolutionMinutes: null },
    ]);
    prismaMock.ticket.findMany.mockResolvedValue([
      { id: "bad", serverId: "s1", number: 1, assigneeId: "staff1", createdAt: oldEnough },
      { id: "good", serverId: "s1", number: 2, assigneeId: "staff1", createdAt: oldEnough },
    ]);
    prismaMock.ticket.update
      .mockRejectedValueOnce(new Error("db hiccup"))
      .mockResolvedValueOnce({});
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.server.findUnique.mockResolvedValue({ ownerId: "owner1" });

    await expect(runBreachJob()).resolves.toBeUndefined();

    // Second (good) ticket still got processed despite the first one throwing.
    expect(prismaMock.ticket.update).toHaveBeenCalledTimes(2);
    expect(dmUserMock).toHaveBeenCalledTimes(1);
  });
});
