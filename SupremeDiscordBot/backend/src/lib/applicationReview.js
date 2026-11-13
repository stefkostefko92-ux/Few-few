// backend/src/lib/applicationReview.js
// Поток Т, фаза 2 — Т6 и Т11: общи правила за прегледа на кандидатури (бот И табло).
//
//  * Т6: решението е условен запис по `status: "PENDING"` — вторият ревюър получава 409, роли и ЛС
//    се дават веднъж. Каналът за обсъждане се създава най-много веднъж (мястото в базата се заема
//    ПРЕДИ ботът да създаде канал, иначе две едновременни „discuss“ правеха два канала и P2002 с
//    осиротял канал) и се затваря след решението.
//  * Т11: „мениджърите на кандидатури“ (Form.managerRoleIds) могат да ревюират редом с админите.
import { prisma } from "./prisma.js";
import { notifyBot } from "../services/botNotifier.js";
import { requireServerAdmin } from "../middleware/auth.js";
import { ensureUserStub } from "./ensureUser.js";

const STALE_RESERVATION_MS = 2 * 60 * 1000;

/** Условно взимане на решението. true = този ревюър го е взел; false = вече е решено. */
export async function claimApplicationReview({ id, serverId, status, reviewerId, note }) {
  const r = await prisma.application.updateMany({
    where: { id, serverId, status: "PENDING" },
    data: { status, reviewerId: reviewerId || null, reviewNote: note || null },
  });
  return r.count === 1;
}

/** След решението каналът за обсъждане се затваря (условно по статус) и ботът го заключва/трие. */
export async function closeApplicationDiscussion({ applicationId, serverId, outcome }) {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { applicationId, serverId },
      select: { id: true, channelId: true, status: true },
    });
    if (!ticket || !["OPEN", "CLAIMED"].includes(ticket.status)) return false;
    const r = await prisma.ticket.updateMany({
      where: { applicationId, serverId, status: { in: ["OPEN", "CLAIMED"] } },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    if (r.count !== 1 || !ticket.channelId) return r.count === 1;
    await notifyBot("APPLICATION_DISCUSSION_CLOSE", { serverId, channelId: ticket.channelId, ticketId: ticket.id, outcome });
    return true;
  } catch (err) {
    console.warn("[applications] closing the discussion failed:", err?.message);
    return false;
  }
}

/**
 * Отваря канала за обсъждане най-много веднъж.
 * @returns {Promise<{status:number, body:object}>}
 */
export async function openApplicationDiscussion({ app, serverId, reviewerId, reviewerTag, transcript }) {
  const existing = await prisma.ticket.findUnique({ where: { applicationId: app.id } });
  const answerFor = async (t) => {
    if (["CLOSED", "ARCHIVED"].includes(t.status)) {
      return { status: 409, body: { error: "A discussion was already opened for this application (the channel was closed).", code: "DISCUSSION_ALREADY_CLOSED" } };
    }
    if (!t.channelId) {
      // Резервация без канал: или друг ревюър го създава в момента, или срив преди запис.
      if (t.createdAt && Date.now() - new Date(t.createdAt).getTime() > STALE_RESERVATION_MS) {
        await prisma.ticket.deleteMany({ where: { id: t.id, channelId: null } }).catch(() => {});
      }
      return { status: 409, body: { error: "A discussion channel is being created — try again in a moment.", code: "DISCUSSION_IN_PROGRESS" } };
    }
    return { status: 200, body: { ok: true, alreadyExists: true, channelId: t.channelId, ticketId: t.id } };
  };
  if (existing) return answerFor(existing);

  // Заемаме мястото ПРЕДИ канала: Ticket.applicationId е @unique — само един печели.
  await ensureUserStub(prisma, app.userId);
  let reserved;
  try {
    reserved = await prisma.ticket.create({
      data: { serverId, creatorId: app.userId, applicationId: app.id, channelId: null, status: "OPEN" },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      const winner = await prisma.ticket.findUnique({ where: { applicationId: app.id } });
      if (winner) return answerFor(winner);
    }
    throw err;
  }

  const botResult = await notifyBot("APPLICATION_DISCUSS", {
    serverId,
    applicantId: app.userId,
    applicantTag: app.user?.username || "applicant",
    reviewerId,
    reviewerTag: reviewerTag || "staff",
    applicationId: app.id,
    formName: app.form.name,
    managerRoleIds: app.form.managerRoleIds || [],
    discussCategoryId: app.form.discussCategoryId || null, // v34 — фиксирана категория
    transcript,
  });
  if (!botResult?.ok || !botResult?.channelId) {
    await prisma.ticket.deleteMany({ where: { id: reserved.id, channelId: null } }).catch(() => {});
    return { status: 502, body: { error: botResult?.error || "Bot failed to create discussion channel" } };
  }
  await prisma.ticket.update({ where: { id: reserved.id }, data: { channelId: botResult.channelId } });
  return { status: 200, body: { ok: true, channelId: botResult.channelId, ticketId: reserved.id } };
}

/**
 * Т11 за таблото: админ (Manage Server) ИЛИ човек с роля от `Form.managerRoleIds`.
 * Правата на роли не са известни от OAuth сесията, затова питаме БОТА (fail closed при мълчание).
 */
export async function requireApplicationReviewer(req, res, next) {
  let denied = null;
  let adminOk = false;
  const shim = {
    status(code) { this._code = code; return this; },
    json(body) { denied = { code: this._code || 200, body }; return this; },
  };
  await requireServerAdmin(req, shim, () => { adminOk = true; });
  if (adminOk) return next();
  if (!denied) return; // middleware-ът е отговорил сам по друг път
  // Само отказът „няма Manage Server“ се опитва като мениджър; 401 (изтекла сесия) се връща както е.
  if (denied.code !== 403 || !/Manage Server/i.test(String(denied.body?.error || ""))) {
    return res.status(denied.code).json(denied.body);
  }
  try {
    const serverId = String(req.params.serverId);
    const appRow = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId },
      select: { form: { select: { managerRoleIds: true } } },
    });
    const managers = appRow?.form?.managerRoleIds || [];
    if (managers.length) {
      const r = await notifyBot("GUILD_MEMBER_ROLES", { serverId, userId: req.user.id });
      const have = new Set(Array.isArray(r?.roleIds) ? r.roleIds.map(String) : []);
      if (r?.ok && managers.some((m) => have.has(String(m)))) return next();
    }
  } catch { /* fail closed */ }
  return res.status(denied.code).json(denied.body);
}
