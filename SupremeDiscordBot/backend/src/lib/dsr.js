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
import { generateHtmlTranscript } from "../utils/archive.js";
import { sealTranscript } from "./transcriptAtRest.js";

export const STAFF_ROLES = ["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF"];
const ERASED = "[erased]";
const label = (id) => `[deleted-user-${String(id).slice(-6)}]`;

const safeCount = (fn) => Promise.resolve().then(fn).catch(() => 0);

/** Какво пазим за този Discord ID — само бройки, без съдържание. */
export async function summarizeDiscordUser(userId) {
  const uid = String(userId);
  const [user, tickets, messages, applications, roleSnapshots, verificationAttempts, memberships, sessions, apiKeys, auditRows, ownedServers, gameProfiles, companions, purchases, questContributions, triviaAnswers] =
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
      // v50 — Server Season
      safeCount(() => prisma.memberProgress.count({ where: { userId: uid } })),
      safeCount(() => prisma.memberCompanion.count({ where: { userId: uid } })),
      safeCount(() => prisma.shopPurchase.count({ where: { userId: uid } })),
      safeCount(() => prisma.questContribution.count({ where: { userId: uid } })),
      safeCount(() => prisma.triviaAnswer.count({ where: { userId: uid } })),
    ]);
  return {
    userId: uid,
    registered: !!user,
    user: user ? { username: user.username, globalRole: user.globalRole, isBlacklisted: user.isBlacklisted, createdAt: user.createdAt, hasEmail: !!user.email, mfaEnabled: !!user.mfaEnabledAt } : null,
    counts: { tickets, messages, applications, roleSnapshots, verificationAttempts, memberships, sessions, apiKeys, auditRows, ownedServers, gameProfiles, companions, purchases, questContributions, triviaAnswers },
  };
}

/** Тикетите, чиито транскрипти носят следи от този човек. */
async function regenerateTranscriptsFor(uid) {
  let done = 0;
  try {
    const authored = await prisma.ticketMessage.findMany({ where: { authorId: uid }, select: { ticketId: true }, distinct: ["ticketId"] });
    const created = await prisma.ticket.findMany({ where: { creatorId: uid, archiveHtml: { not: null } }, select: { id: true } });
    const ids = [...new Set([...authored.map((m) => m.ticketId), ...created.map((t) => t.id)])];
    for (const id of ids) {
      const full = await prisma.ticket.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } }, creator: true, assignee: true, server: { select: { name: true, customBotName: true } } },
      });
      if (!full || !full.archiveHtml) continue;
      if (String(full.archiveHtml).startsWith("<!-- anonymized")) continue; // вече изчистен от ретенцията
      const html = generateHtmlTranscript(full);
      await prisma.ticket.update({ where: { id }, data: { archiveHtml: sealTranscript(html) } });
      done++;
    }
  } catch { /* броим каквото е минало; одитът носи числото */ }
  return done;
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
    // v50 — Server Season: напредък, награди, спътници, покупки, приноси, отговори;
    // уловените появи остават като събитие на сървъра, но без идентификатора.
    await c("gameProfiles", () => tx.memberProgress.deleteMany({ where: { userId: uid } }));
    await c("gameXpGrants", () => tx.gameXpGrant.deleteMany({ where: { userId: uid } }));
    await c("companions", () => tx.memberCompanion.deleteMany({ where: { userId: uid } }));
    await c("purchases", () => tx.shopPurchase.deleteMany({ where: { userId: uid } }));
    await c("questContributions", () => tx.questContribution.deleteMany({ where: { userId: uid } }));
    await c("triviaAnswers", () => tx.triviaAnswer.deleteMany({ where: { userId: uid } }));
    await c("triviaWinsAnonymized", () => tx.triviaRound.updateMany({ where: { winnerId: uid }, data: { winnerId: null } }));
    await c("countingLastAnonymized", () => tx.gameSettings.updateMany({ where: { countingLastUserId: uid }, data: { countingLastUserId: null } }));
    await c("trades", () => tx.companionTrade.deleteMany({ where: { OR: [{ fromUserId: uid }, { toUserId: uid }] } }));
    await c("spawnsAnonymized", () => tx.companionSpawn.updateMany({ where: { caughtById: uid }, data: { caughtById: null } }));

    if (scope === "full") {
      await c("messageContent", () => tx.ticketMessage.updateMany({
        where: { authorId: uid },
        data: { content: ERASED, originalContent: null, attachments: [] },
      }));
      await c("applicationAnswers", () => tx.application.updateMany({
        where: { userId: uid },
        data: { answers: { [ERASED]: true }, reviewNote: null },
      }));
    }
  });

  // Транскриптите (archiveHtml) са ГОТОВ HTML със снимка на подписите и
  // текста от момента на затваряне — анонимизацията на редовете не ги
  // променя. Регенерираме ги от вече анонимизираните съобщения за всеки
  // тикет, в който човекът е писал или който е отворил. Извън транзакцията:
  // много редове, а провал тук не бива да връща анонимизацията назад.
  counts.transcriptsRegenerated = await regenerateTranscriptsFor(uid);

  await writeAudit({
    actorId: requestedBy || null,
    actorTag: requestedBy ? undefined : "SYSTEM",
    action: "DSR_ERASED",
    targetId: uid,
    metadata: { scope, via, guildId, note, counts, registered: !!user },
  });

  return { ok: true, scope, counts, registered: !!user };
}
