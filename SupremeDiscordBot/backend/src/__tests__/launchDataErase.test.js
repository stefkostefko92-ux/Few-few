// backend/src/__tests__/launchDataErase.test.js
// Готовност за пускане, поток И — изтриване на лични данни (А7) и временната
// роля от магазина (И4). Номерът на критерия е в името на всеки тест.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const notifyBot = vi.fn();
vi.mock("../services/botNotifier.js", () => ({ notifyBot }));

const USER = { id: "123456789", username: "stefan", discriminator: "0", globalRole: "USER" };
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = { userId: USER.id }; next(); },
  loadUser: (req, _res, next) => { req.user = req.user || { ...USER }; next(); },
}));

const { eraseDiscordUser } = await import("../lib/dsr.js");
const { default: gdprRouter, subjectRightsLimiter } = await import("../routes/gdpr.js");

const gdprApp = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/gdpr", gdprRouter);
  return a;
};

beforeEach(async () => {
  vi.resetAllMocks();
  await subjectRightsLimiter.resetKey(USER.id);
  prismaMock.user.findUnique.mockResolvedValue({ ...USER });
  prismaMock.server.count.mockResolvedValue(0);
  prismaMock.agency.count.mockResolvedValue(0);
  prismaMock.ticketMessage.findMany.mockResolvedValue([]);
  prismaMock.ticket.findMany.mockResolvedValue([]);
  prismaMock.shopPurchase.findMany.mockResolvedValue([]);
  prismaMock.giveaway.findMany.mockResolvedValue([]);
  notifyBot.mockResolvedValue({ ok: true });
});

describe("А7 — изтриването на лични данни е едно (eraseDiscordUser)", () => {
  it("А7: трие гласове в анкети, участия в раздавания и formCooldown на човека", async () => {
    const r = await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    expect(r.ok).toBe(true);
    expect(prismaMock.pollVote.deleteMany).toHaveBeenCalledWith({ where: { userId: USER.id } });
    expect(prismaMock.giveawayEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: USER.id } });
    expect(prismaMock.formCooldown.deleteMany).toHaveBeenCalledWith({ where: { userId: USER.id } });
  });

  it("А7: маха човека от победителите в раздавания (winnerIds), без да пипа чуждите", async () => {
    prismaMock.giveaway.findMany.mockResolvedValue([
      { id: "gw1", winnerIds: ["111111", USER.id, "222222"] },
    ]);
    await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    expect(prismaMock.giveaway.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { winnerIds: { has: USER.id } } }),
    );
    expect(prismaMock.giveaway.update).toHaveBeenCalledWith({
      where: { id: "gw1" },
      data: { winnerIds: ["111111", "222222"] },
    });
  });

  it("А7: изтриването от таблото минава през eraseDiscordUser — покрива опити за верификация, членство и втори фактор", async () => {
    const res = await request(gdprApp()).post("/api/gdpr/delete-account").send({ confirmDiscordId: USER.id });
    expect(res.status).toBe(200);
    expect(prismaMock.verificationAttempt.deleteMany).toHaveBeenCalledWith({ where: { userId: USER.id } });
    expect(prismaMock.serverMember.deleteMany).toHaveBeenCalledWith({ where: { userId: USER.id } });
    expect(prismaMock.pollVote.deleteMany).toHaveBeenCalled();
    expect(prismaMock.giveawayEntry.deleteMany).toHaveBeenCalled();
    expect(prismaMock.formCooldown.deleteMany).toHaveBeenCalled();
    const data = prismaMock.user.update.mock.calls.at(-1)[0].data;
    expect(data).toMatchObject({ email: null, mfaSecret: null, mfaBackupCodes: null, avatar: null });
    expect(data.username).toMatch(/^\[deleted-user-/);
    // регенерация на транскриптите (идва от общата функция)
    expect(prismaMock.ticketMessage.findMany).toHaveBeenCalled();
  });

  it("А7: таблото пази гардовете си — активен абонамент блокира, без да се пипа нищо", async () => {
    prismaMock.server.count.mockResolvedValue(1);
    const res = await request(gdprApp()).post("/api/gdpr/delete-account").send({ confirmDiscordId: USER.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ACTIVE_SUBSCRIPTIONS");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.pollVote.deleteMany).not.toHaveBeenCalled();
  });

  it("А7: отказ на eraseDiscordUser (напр. служебен акаунт) не се превръща в 200", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, globalRole: "SUPPORT_STAFF" });
    const res = await request(gdprApp()).post("/api/gdpr/delete-account").send({ confirmDiscordId: USER.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STAFF_ACCOUNT");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("И4 — /privacy сваля временната роля от магазина преди изтриването на покупките", () => {
  const temp = { id: "p1", serverId: "g1", userId: USER.id, itemType: "ROLE", roleId: "r1", expiresAt: new Date(Date.now() + 86400_000), revokedAt: null };

  it("И4: за всяка невъзвърната ROLE покупка със срок се праща GAME_ROLE_REVOKE", async () => {
    prismaMock.shopPurchase.findMany.mockResolvedValue([temp]);
    await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    expect(prismaMock.shopPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER.id, itemType: "ROLE", revokedAt: null, expiresAt: { not: null } }),
      }),
    );
    expect(notifyBot).toHaveBeenCalledWith("GAME_ROLE_REVOKE", {
      serverId: "g1", userId: USER.id, roleId: "r1", purchaseId: "p1",
    });
  });

  it("И4: ролята се сваля ПРЕДИ да се изтрие редът на покупката", async () => {
    prismaMock.shopPurchase.findMany.mockResolvedValue([temp]);
    await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    const notifyAt = notifyBot.mock.invocationCallOrder[0];
    const deleteAt = prismaMock.shopPurchase.deleteMany.mock.invocationCallOrder[0];
    expect(notifyAt).toBeLessThan(deleteAt);
  });

  it("И4: недостъпен бот не спира изтриването (best effort), но се отчита в броячите", async () => {
    prismaMock.shopPurchase.findMany.mockResolvedValue([temp]);
    notifyBot.mockResolvedValue(null);
    const r = await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    expect(r.ok).toBe(true);
    expect(prismaMock.shopPurchase.deleteMany).toHaveBeenCalled();
    expect(r.counts.roleRevokeFailed).toBe(1);
  });

  it("И4: без временни роли ботът не се вика", async () => {
    await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    expect(notifyBot).not.toHaveBeenCalled();
  });
});

// Червен екип + ревю (13.11.2026): всяка стъпка в транзакцията беше обвита в
// `.catch(() => counts[x] = 0)`. В Postgres първата грешка прекъсва транзакцията,
// следващите заявки падат (и също се гълтат), а COMMIT на прекъсната транзакция е
// тих ROLLBACK — одитът записваше „изтрито“, а не беше изтрито нищо. Доказано срещу
// жива база в integration/dsrErase.integration.test.js.
describe("изтриването е всичко или нищо — провалът се чува", () => {
  it("провалена стъпка → ok:false ERASE_FAILED и одит DSR_ERASE_FAILED, не DSR_ERASED", async () => {
    prismaMock.pollVote.deleteMany.mockRejectedValue(new Error("connection reset"));
    const r = await eraseDiscordUser(USER.id, { via: "dashboard", requestedBy: USER.id });
    expect(r).toMatchObject({ ok: false, code: "ERASE_FAILED" });
    const actions = prismaMock.auditLog.create.mock.calls.map(([q]) => q.data.action);
    expect(actions).toContain("DSR_ERASE_FAILED");
    expect(actions, "одитът не бива да твърди успех").not.toContain("DSR_ERASED");
    const failed = prismaMock.auditLog.create.mock.calls.find(([q]) => q.data.action === "DSR_ERASE_FAILED")[0].data;
    expect(failed.metadata.step, "одитът казва коя стъпка е паднала").toBe("pollVotes");
    expect(JSON.stringify(failed.metadata), "без текста на грешката от базата (може да носи данни)").not.toContain("connection reset");
  });

  it("след провал транскриптите не се регенерират (нищо не е анонимизирано)", async () => {
    prismaMock.memberRoleSnapshot.deleteMany.mockRejectedValue(new Error("boom"));
    await eraseDiscordUser(USER.id, { via: "bot", requestedBy: USER.id });
    expect(prismaMock.ticket.findMany).not.toHaveBeenCalled();
  });

  it("таблото: провал → 503 „опитай пак“, сесията остава (човекът не е изтрит)", async () => {
    prismaMock.pollVote.deleteMany.mockRejectedValue(new Error("connection reset"));
    const res = await request(gdprApp()).post("/api/gdpr/delete-account").send({ confirmDiscordId: USER.id });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("ERASE_FAILED");
  });
});

