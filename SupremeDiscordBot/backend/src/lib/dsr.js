// backend/src/lib/dsr.js
// Заявки на субекти на данни (DSR) по Discord ID — ЕДНО определение за
// „какво пазим за този човек“ и „как го изтриваме“.
//
// Защо съществува (Discord Developer Terms §5(b), сверено 13.09.2026): „you will
// promptly delete the API Data when … the applicable user requests you delete
// it“ и „You will give users an easily accessible way to ask for their API Data
// to be modified and deleted“. Досега това го можеше само влязъл в таблото
// потребител (routes/gdpr.js). Огромната част от хората, чиито данни пазим
// (създатели на тикети, кандидати, членове със снимки на роли), НИКОГА не влизат
// в таблото — за тях път нямаше. Сега има два: `/privacy delete` в Discord
// (самообслужване) и админ конзолата (обработка на заявка, дошла по друг канал).
//
// Два обхвата:
//   identity — анонимизира ИДЕНТИФИКАТОРИТЕ (профил, подпис на съобщенията,
//              сесии, ключове, снимки на роли, опити за верификация, членство).
//              Съдържанието на тикетите остава: то е запис на сървърния
//              оператор (контролър по чл. 28), а ние сме обработващ.
//   full     — и съдържанието на съобщенията/отговорите в кандидатури се
//              заменя с „[erased]“. Само за изрична заявка към нас като
//              контролър (админ конзола) — операторът губи текста.
//
// Никога не хвърля заради липсващ модел (Promise.resolve().then), за да не може
// едно ново поле да счупи правото на изтриване (урок от routes/gdpr.js).

import { prisma } from "./prisma.js";
import { writeAudit } from "./auditLog.js";

export const STAFF_ROLES = ["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF"];
const ERASED = "[erased]";
const label = (id) => `[deleted-user-${String(id).slice(-6)}]`;

const safeCount = (fn) => Promise.resolve().then(fn).catch(() => 0);

/** Какво пазим за този Discord ID — само бройки, без съдържание. */
export async function summarizeDiscordUser(userId) {
  const uid = String(userId);
  const [user, tickets, messages, applications, roleSnapshots, verificationAttempts, memberships, sessions, apiKeys, auditRows, ownedServers] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: uid }, select: { id: true, username: true, globalRole: true, isBlacklisted: true, createdAt: true, email: true, mfaEnabledAt: true } }).catch(() => null),
      safeCount(() => prisma.ticket.count({ where: { creatorId: uid } })),
      safeCount(() => prisma.ticketMessage.count({ where: { authorId: uid } })),
      safeCount(() => prisma.application.count({ where: { userId: uid } })),
      safeCount(() => prisma.memberRoleSnapshot.count({ where: { userId: uid } })),
      safeCount(() => prisma.verificationAttempt.count({ where: { userId: uid } })),
      safeCount(() => prisma.serverMember.count({ where: { userId: uid } })),
      safeCount(() => prisma.session.count({ where: { userId: uid } })),
      safeCount(() => prisma.apiKey.count({ where: { userId: uid, revokedAt: null } })),
      safeCount(() => prisma.auditLog.count({ where: { OR: [{ actorId: uid }, { targetId: uid }] } })),
      safeCount(() => prisma.server.count({ where: { ownerId: uid } })),
    ]);
  return {
    userId: uid,
    registered: !!user,
    user: user ? { username: user.username, globalRole: user.globalRole, isBlacklisted: user.isBlacklisted, createdAt: user.createdAt, hasEmail: !!user.email, mfaEnabled: !!user.mfaEnabledAt } : null,
    counts: { tickets, messages, applications, roleSnapshots, verificationAttempts, memberships, sessions, apiKeys, auditRows, ownedServers },
  };
}

/** Активни платени абонаменти на този човек — блокират изтриването (както в routes/gdpr.js). */
export async function activeSubscriptionsFor(userId) {
  const uid = String(userId);
  const servers = await safeCount(() => prisma.server.count({
    where: { ownerId: uid, isPremium: true, OR: [{ stripeSubscriptionId: { not: null } }, { planSource: "discord" }] },
  }));
  const agencies = await safeCount(() => prisma.agency.count({
    where: { ownerUserId: uid, active: true, OR: [{ stripeSubscriptionId: { not: null } }, { planSource: "discord" }] },
  }));
  return { servers, agencies };
}

/**
 * Изтрива/анонимизира данните за Discord ID. Връща { ok, counts } или
 * { ok:false, code, error }.
 * @param {object} o
 * @param {"identity"|"full"} o.scope
 * @param {"bot"|"admin"|"dashboard"} o.via
 * @param {string|null} o.requestedBy   Discord ID на заявителя (актьор в одита)
 * @param {string|null} o.guildId       откъде е дошла заявката (информативно)
 * @param {string|null} o.note          бележка на админа (напр. номер на заявка)
 */
export async function eraseDiscordUser(userId, { scope = "identity", via = "admin", requestedBy = null, guildId = null, note = null } = {}) {
  const uid = String(userId);
  if (!/^\d{5,25}$/.test(uid)) return { ok: false, code: "INVALID_ID", error: "Invalid Discord user id" };

  const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, globalRole: true } }).catch(() => null);
  if (user && STAFF_ROLES.includes(user.globalRole)) {
    return { ok: false, code: "STAFF_ACCOUNT", error: "Staff accounts cannot be erased while they hold a staff role. Demote first." };
  }
  const subs = await activeSubscriptionsFor(uid);
  if (subs.servers > 0 || subs.agencies > 0) {
    return { ok: false, code: "ACTIVE_SUBSCRIPTIONS", error: "Active paid subscriptions exist for this account. Cancel them first (Discord → User Settings → Subscriptions), then request erasure again.", subscriptions: subs };
  }

  const counts = {};
  const tag = label(uid);
  await prisma.$transaction(async (tx) => {
    const c = (name, p) => Promise.resolve().then(p).then((r) => { counts[name] = typeof r === "number" ? r : (r?.count ?? 1); }).catch(() => { counts[name] = 0; });

    if (user) {
      await c("user", () => tx.user.update({
        where: { id: uid },
        data: { username: tag, discriminator: "0", avatar: null, email: null, mfaSecret: null, mfaEnabledAt: null, mfaBackupCodes: null, mfaLastUsedStep: null },
      }));
      await c("sessions", () => tx.session.deleteMany({ where: { userId: uid } }));
      await c("apiKeys", () => tx.apiKey.updateMany({ where: { userId: uid, revokedAt: null }, data: { revokedAt: new Date() } }));
    }
    await c("messageTags", () => tx.ticketMessage.updateMany({ where: { authorId: uid }, data: { authorTag: tag } }));
    await c("roleSnapshots", () => tx.memberRoleSnapshot.deleteMany({ where: { userId: uid } }));
    await c("verificationAttempts", () => tx.verificationAttempt.deleteMany({ where: { userId: uid } }));
    await c("memberships", () => tx.serverMember.deleteMany({ where: { userId: uid } }));

    if (scope === "full") {
      await c("messageContent", () => tx.ticketMessage.updateMany({
        where: { authorId: uid },
        data: { content: ERASED, originalContent: null, attachments: [] },
      }));
      await c("applicationAnswers", () => tx.application.updateMany({
        where: { userId: uid },
        data: { answers: { [ERASED]: true } },
      }));
    }
  });

  await writeAudit({
    actorId: requestedBy || null,
    actorTag: requestedBy ? undefined : "SYSTEM",
    action: "DSR_ERASED",
    targetId: uid,
    metadata: { scope, via, guildId, note, counts, registered: !!user },
  });

  return { ok: true, scope, counts, registered: !!user };
}
