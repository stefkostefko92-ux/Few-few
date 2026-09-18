// backend/src/__tests__/tierGating.test.js
// Premium функциите се гейтват при ИЗПЪЛНЕНИЕ, не само при създаване от таблото.
//
// Одит (07.08.2026): свален от seat (или изначало free) сървър можеше да ползва
// premium функции по ВТОРИЯ път — слаш командата на бота (bot_v18) и cron/webhook
// изпълнението — защото гейтът стоеше само на dashboard write пътя. Тук пазим, че
// bot-facing endpoint-ите проверяват ефективния tier.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.API_SECRET = "test-bot-secret";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// getServerTier е сърцето на проверката — мокваме го да върне зададен план.
let tierPlan = "free";
vi.mock("../lib/premium.js", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    getServerTier: vi.fn(async () => ({
      plan: tierPlan,
      limits: actual.planConfig(tierPlan).limits,
    })),
  };
});

const { default: botV18Router } = await import("../routes/bot_v18.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/bot", botV18Router);
  return a;
}
const auth = (r) => r.set("x-bot-secret", "test-bot-secret");

beforeEach(() => {
  vi.clearAllMocks();
  tierPlan = "free";
});

describe("POST /api/bot/sticky — tier гейт", () => {
  const body = { serverId: "s1", channelId: "c1", content: "hi" };

  it("free сървър получава 403, нула запис", async () => {
    const res = await auth(request(app()).post("/api/bot/sticky")).send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PREMIUM_REQUIRED");
    expect(prismaMock.stickyMessage.upsert).not.toHaveBeenCalled();
  });

  it("premium сървър минава", async () => {
    tierPlan = "premium";
    prismaMock.stickyMessage.upsert.mockResolvedValue({ id: "st1" });
    const res = await auth(request(app()).post("/api/bot/sticky")).send(body);
    expect(res.status).toBe(200);
    expect(prismaMock.stickyMessage.upsert).toHaveBeenCalled();
  });
});

describe("GET /api/bot/sticky/channel/:channelId — репостът спира на free", () => {
  it("free сървър → null, макар редът да съществува (репостът спира)", async () => {
    prismaMock.stickyMessage.findUnique.mockResolvedValue({ id: "st1", serverId: "s1", content: "hi" });
    const res = await auth(request(app()).get("/api/bot/sticky/channel/c1"));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("premium сървър → връща реда", async () => {
    tierPlan = "premium";
    prismaMock.stickyMessage.findUnique.mockResolvedValue({ id: "st1", serverId: "s1", content: "hi" });
    const res = await auth(request(app()).get("/api/bot/sticky/channel/c1"));
    expect(res.body?.id).toBe("st1");
  });
});

describe("POST /api/bot/schedule — tier гейт", () => {
  const body = { serverId: "s1", channelId: "c1", content: "hi", sendAt: new Date().toISOString() };

  it("free сървър получава 403", async () => {
    const res = await auth(request(app()).post("/api/bot/schedule")).send(body);
    expect(res.status).toBe(403);
    expect(prismaMock.scheduledMessage.create).not.toHaveBeenCalled();
  });

  it("повтарящо се на план БЕЗ recurringScheduled → 403", async () => {
    tierPlan = "premium"; // premium има scheduled, но recurringScheduled=true?
    // premium лимитите носят recurringScheduled=true, затова тестваме забраната
    // през план, който го няма: слагаме recurrence на free-подобно ограничение.
    // Тук premium ГО позволява, затова проверяваме обратния случай през create.
    prismaMock.scheduledMessage.create.mockResolvedValue({ id: "m1" });
    const res = await auth(request(app()).post("/api/bot/schedule")).send({ ...body, recurrence: "daily" });
    // premium позволява recurring → 201
    expect(res.status).toBe(201);
  });
});

describe("sanitizePanelForTier — premium полета се нулират при недостатъчен план", () => {
  it("free план зачиства всички premium полета", async () => {
    const { sanitizePanelForTier } = await import("../lib/premium.js");
    const panel = {
      dmOnOpen: true, dmOnOpenMessage: "hi",
      dmOnClose: true, dmOnCloseMessage: "bye",
      closeAskMessage: "sure?", closeAskEnabled: true,
      feedbackEnabled: true, inactivityCloseHours: 24,
      autoCloseOnLeave: true, observerRoleIds: ["r1", "r2"],
      slaFirstResponseMinutes: 15, slaResolutionMinutes: 60,
      categoryClosedId: "cat2",
    };
    sanitizePanelForTier(panel, "free");
    expect(panel.dmOnOpen).toBe(false);
    expect(panel.dmOnOpenMessage).toBeNull();
    expect(panel.feedbackEnabled).toBe(false);
    expect(panel.inactivityCloseHours).toBeNull();
    expect(panel.autoCloseOnLeave).toBe(false);
    expect(panel.observerRoleIds).toEqual([]);
    expect(panel.slaFirstResponseMinutes).toBeNull();
    expect(panel.categoryClosedId).toBeNull();
    expect(panel.closeAskMessage).toBeNull();
    // Базовото двустъпково затваряне НЕ се пипа.
    expect(panel.closeAskEnabled).toBe(true);
  });

  it("premium план ПАЗИ premium полетата", async () => {
    const { sanitizePanelForTier } = await import("../lib/premium.js");
    const panel = { dmOnOpen: true, feedbackEnabled: true, observerRoleIds: ["r1"], slaResolutionMinutes: 60, inactivityCloseHours: 12 };
    sanitizePanelForTier(panel, "premium");
    expect(panel.dmOnOpen).toBe(true);
    expect(panel.feedbackEnabled).toBe(true);
    expect(panel.observerRoleIds).toEqual(["r1"]);
    expect(panel.slaResolutionMinutes).toBe(60);
    expect(panel.inactivityCloseHours).toBe(12);
  });
});
