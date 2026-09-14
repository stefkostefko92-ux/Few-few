// backend/src/jobs/dataRetention.js
// Scheduled job — enforces data retention policy per Privacy Policy commitments.
// Runs daily via node-cron. Anonymizes/deletes data past retention windows.
//
// Retention schedule:
//   Free tier: ticket transcripts 30 days after close
//   Premium tier: indefinite (customer-controlled)
//   Audit logs: 2 years
//   Abuse reports: 1 year after resolution
//   Anonymized users: maintained (for referential integrity)
//   Transaction records: 7 years (legal obligation, NEVER auto-delete)
//   Servers with the bot removed: personal data purged 30 days after removal
//     (the Server row, PaymentLog and AuditLog survive — financial records
//      carry a 7-year legal obligation and cascade off Server)
//
// ON ERROR: logs but does NOT throw. Retention run failure must not crash backend.

import { prisma } from "../lib/prisma.js";
import { effectiveFreeWhere } from "../lib/premium.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runRetentionJob() {
  const startedAt = new Date();
  const results = {
    ticketsAnonymized: 0,
    auditLogsDeleted: 0,
    abuseReportsDeleted: 0,
    removedServersPurged: 0,
    errors: [],
  };

  console.log(`[retention] 🕐 Starting retention job at ${startedAt.toISOString()}`);

  // ── 1. Anonymize Free-tier closed tickets older than 30 days ────────────────
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);

    // Find closed tickets on Free-tier servers past 30 days
    const candidates = await prisma.ticket.findMany({
      where: {
        status: { in: ["CLOSED", "ARCHIVED"] },
        closedAt: { lt: thirtyDaysAgo },
        // Only anonymize if the server is not EFFECTIVELY premium — agency
        // seats and trials don't set the raw isPremium flag, and deleting a
        // paying agency customer's transcripts is irreversible data loss.
        server: effectiveFreeWhere(),
        // Skip already-anonymized.
        //
        // ВНИМАНИЕ — СЪЩИЯТ КЛАС, който вече ни удари в секция 3б:
        // `NOT: { archiveHtml: { startsWith: … } }` в SQL е
        // `NOT (col LIKE '…%')`, което при col IS NULL дава NULL, не TRUE →
        // редът отпада. А scheduler.js (Job 1) вече е занулил archiveHtml за
        // точно тези тикети. Резултат: кандидатите бяха ПРАЗНИ, значи
        // ticketMessage.deleteMany НЕ СЕ ИЗПЪЛНЯВАШЕ никога и съобщенията на
        // Free сървърите живееха вечно — обещанието за 30 дни беше на хартия.
        // (Качествения, 07.08.2026)
        OR: [
          { archiveHtml: null },
          { NOT: { archiveHtml: { startsWith: "<!-- anonymized" } } },
        ],
      },
      select: { id: true, serverId: true },
      take: 500, // batch to avoid locking DB
    });

    for (const ticket of candidates) {
      try {
        // Replace archive HTML with anonymization marker, delete message rows
        await prisma.$transaction([
          prisma.ticketMessage.deleteMany({ where: { ticketId: ticket.id } }),
          prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              archiveHtml: `<!-- anonymized ${new Date().toISOString()} — 30-day retention for Free tier -->`,
            },
          }),
        ]);
        results.ticketsAnonymized++;
      } catch (err) {
        results.errors.push({ type: "ticket", id: ticket.id, error: err.message });
      }
    }

    console.log(`[retention] ✅ Tickets anonymized: ${results.ticketsAnonymized}`);
  } catch (err) {
    console.error(`[retention] ❌ Ticket retention failed:`, err.message);
    results.errors.push({ type: "tickets", error: err.message });
  }

  // ── 2. Delete audit logs older than 2 years ─────────────────────────────────
  try {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * MS_PER_DAY);

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: twoYearsAgo },
        // Don't delete records with legal retention implications
        // SERVER_DATA_PURGED е едновременно дедуп ключ за секция 3б И
        // доказателство, че изтриването е извършено — изтрием ли го след 2
        // години, губим и следата, и защитата от повторно пускане.
        action: { notIn: ["GDPR_ACCOUNT_DELETED", "GDPR_DATA_EXPORT", "ABUSE_REPORT", "SERVER_DATA_PURGED"] },
      },
    });
    results.auditLogsDeleted = deleted.count;
    console.log(`[retention] ✅ Audit logs deleted: ${deleted.count}`);
  } catch (err) {
    console.error(`[retention] ❌ Audit log retention failed:`, err.message);
    results.errors.push({ type: "audit", error: err.message });
  }

  // ── 2б. Снимки на роли по-стари от 180 дни (v45 „лепкави роли") ────────────
  // Списъкът с роли на конкретен човек е лични данни. Пази се точно колкото е
  // полезен — за да върнем ролите на върнал се член. Половин година след
  // напускането целта е отпаднала (чл. 5(1)(д) GDPR — ограничение на
  // съхранението), затова снимката се изтрива.
  try {
    const cutoff = new Date(Date.now() - 180 * MS_PER_DAY);
    const deleted = await prisma.memberRoleSnapshot.deleteMany({
      where: { capturedAt: { lt: cutoff } },
    });
    results.roleSnapshotsDeleted = deleted.count;
    console.log(`[retention] ✅ Role snapshots deleted: ${deleted.count}`);
  } catch (err) {
    console.error(`[retention] ❌ Role snapshot retention failed:`, err.message);
    results.errors.push({ type: "roleSnapshots", error: err.message });
  }

  // ── 3. Delete resolved abuse reports older than 1 year ──────────────────────
  try {
    const oneYearAgo = new Date(Date.now() - 365 * MS_PER_DAY);

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        action: "ABUSE_REPORT",
        createdAt: { lt: oneYearAgo },
      },
    });
    results.abuseReportsDeleted = deleted.count;
    console.log(`[retention] ✅ Abuse reports deleted: ${deleted.count}`);
  } catch (err) {
    console.error(`[retention] ❌ Abuse report retention failed:`, err.message);
    results.errors.push({ type: "abuse", error: err.message });
  }

  // ── 3б. Изчисти ЛИЧНИТЕ данни на сървъри без бот от 30+ дни ────────────────
  // Политиката обещава „Until server is removed“ (PrivacyPage), но `botRemovedAt`
  // беше само маркер: единствените консуматори бяха филтър за таблото и
  // изчистване при повторна покана. Данните на клиент, махнал бота, живееха
  // безсрочно — чл. 5(1)(д) и нарушено собствено обещание.
  //
  // ВНИМАНИЕ — първата версия на тази секция триеше самия ред Server. Това е
  // ГРЕШНО: PaymentLog и AuditLog висят на него с onDelete: Cascade, тоест
  // изтриването унищожаваше финансовите записи, за които заглавието на ТОЗИ файл
  // казва „7 години, НИКОГА не се трият автоматично“, плюс GDPR доказателствата,
  // които секция 2 изрично пази. Коментарът в routes/bot.js:134 обяснява същото:
  // мекото изтриване е нарочно, за да оцелеят абонаментът и историята на
  // плащанията при повторна покана.
  //
  // Затова трием ЛИЧНИТЕ данни (тикети и съобщенията в тях, кандидатури, форми,
  // панели, verification, reaction roles, статии, членства), а обвивката Server
  // + PaymentLog + AuditLog остават. Това е и правилният прочит на чл. 17(3)(б):
  // задължението по счетоводното законодателство надделява за финансовите
  // записи, но не оправдава пазенето на чужди разговори.
  //
  // Сървър с ЖИВ платен абонамент се прескача: бот, махнат по погрешка, докато
  // клиентът плаща, не бива да си губи данните — той всеки момент може да върне бота.
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    const ACTIVE_PAID = ["active", "past_due", "trialing", "unpaid", "incomplete"];

    const candidates = await prisma.server.findMany({
      where: {
        AND: [
          { botRemovedAt: { not: null, lt: thirtyDaysAgo } },
          // NULL-БЕЗОПАСНО. `NOT: { stripeStatus: { in: [...] } }` се превежда
          // като `NOT (stripeStatus IN (...))`, което при stripeStatus IS NULL
          // дава NULL, а не TRUE → редът отпада. Тоест БЕЗПЛАТНИТЕ сървъри (най-
          // честият случай, статус никога не е писан) НИКОГА не се чистеха и
          // цялата поправка по чл. 5(1)(д) беше мъртва. Намерено от Кодаджията,
          // доказано срещу реален Prisma 5.22 — тестът ми не го хвана, защото
          // имитираше филтъра с JS `includes` вместо да гледа формата на where.
          { OR: [{ stripeStatus: null }, { stripeStatus: { notIn: ACTIVE_PAID } }] },
          // Плащащ по ДРУГ път (активен agency seat или течащ trial) също не се
          // пипа — статусът в Stripe не покрива тези случаи.
          effectiveFreeWhere(),
          // Веднъж изчистен → не го пипаме пак (маркерът е и одитната следа).
          { auditLogs: { none: { action: "SERVER_DATA_PURGED" } } },
        ],
      },
      select: { id: true },
    });

    for (const { id: serverId } of candidates) {
      await prisma.$transaction([
        // Ticket трие TicketMessage по каскада; същото за Application/Form полета.
        prisma.ticket.deleteMany({ where: { serverId } }),
        prisma.application.deleteMany({ where: { serverId } }),
        prisma.form.deleteMany({ where: { serverId } }),
        prisma.panel.deleteMany({ where: { serverId } }),
        prisma.verificationPanel.deleteMany({ where: { serverId } }),
        prisma.reactionRoleMessage.deleteMany({ where: { serverId } }),
        prisma.kbArticle.deleteMany({ where: { serverId } }),
        prisma.serverMember.deleteMany({ where: { serverId } }),
        // ─── Таблици БЕЗ външен ключ към Server ────────────────────────────
        // Тези седем носят `serverId` като гол низ, без релация и без каскада.
        // Затова нищо не ги достигаше: нито тази секция (не бяха изброени),
        // нито изтриване на реда Server (той нарочно оцелява). Резултат — гласове
        // в анкети и участия в томболи (Discord user ID = лични данни), съдържание
        // на планирани/лепкави съобщения и адреси+тайни на webhook-и живееха
        // безсрочно на сървър, махнал бота преди месеци. Точно същият клас
        // пропуск като NULL-филтъра по-горе: правилото беше написано, но не
        // достигаше редовете. (Одит 07.08.2026)
        //
        // Poll → PollVote и Giveaway → GiveawayEntry падат по каскада (там ИМА
        // релация), затова се трият само родителите.
        prisma.poll.deleteMany({ where: { serverId } }),
        prisma.giveaway.deleteMany({ where: { serverId } }),
        prisma.scheduledMessage.deleteMany({ where: { serverId } }),
        prisma.stickyMessage.deleteMany({ where: { serverId } }),
        prisma.cannedResponse.deleteMany({ where: { serverId } }),
        prisma.webhook.deleteMany({ where: { serverId } }),
        // DailyMetric е агрегат (само броячи, нула лични данни), но е безполезен
        // за сървър без бот и расте по ред на ден — чистим го заедно с останалото.
        prisma.dailyMetric.deleteMany({ where: { serverId } }),
        prisma.auditLog.create({
          data: { actorId: null, actorTag: "SYSTEM", serverId, action: "SERVER_DATA_PURGED", targetId: serverId },
        }),
      ]);
      results.removedServersPurged += 1;
    }
    console.log(`[retention] ✅ Removed-server data purged: ${results.removedServersPurged}`);
  } catch (err) {
    console.error(`[retention] ❌ Removed-server purge failed:`, err.message);
    results.errors.push({ type: "removedServers", error: err.message });
  }

  // ── 4. Log the run itself for compliance evidence ───────────────────────────
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorTag: "SYSTEM_RETENTION_JOB",
        serverId: null,
        action: "RETENTION_JOB_EXECUTED",
        targetId: null,
        metadata: {
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          ...results,
        },
      },
    });
  } catch (err) {
    console.error(`[retention] ❌ Failed to log retention run:`, err.message);
  }

  const duration = Date.now() - startedAt.getTime();
  console.log(`[retention] 🏁 Completed in ${duration}ms — ${results.ticketsAnonymized} tickets, ${results.auditLogsDeleted} audit logs, ${results.abuseReportsDeleted} abuse reports`);

  return results;
}

// Планирането живее в services/scheduler.js (одит 09.08.2026): там runRetentionJob
// минава през job() — застъпващ lock, Sentry при провал, почасов JOB_OK пулс и
// CRON_TZ. Тази функция е само РАБОТАТА; никой тук не пуска setTimeout.

