// backend/src/lib/ticketClose.js
// Т2 (LAUNCH_READINESS_SPEC) — ЕДНО затваряне на тикет за всички входове:
// бутон, `/ticket close`, таблото, неактивност, напуснал създател, изтрит канал.
//
// ЗАЩО УСЛОВЕН ЗАПИС: „прочети статуса, после запиши“ даваше двойно затваряне
// (две съобщения Reopen/Delete, два транскрипта) и затваряне на тикет, в който
// току-що е имало нова активност. Тук печели ТОЧНО един `updateMany` със старото
// състояние в условието; губещият получава `ok:false` и не прави нищо друго.
import { prisma } from "./prisma.js";
import { generateHtmlTranscript } from "../utils/archive.js";
import { ensureArchiveToken, tokenizedArchiveUrl } from "./archiveToken.js";
import { sealTranscript } from "./transcriptAtRest.js";
import { awardTicketSlaXp } from "./game/xp.js";
import { writeAudit } from "./auditLog.js";
import { fireWebhooks } from "../services/webhooks.js";

export const CLOSEABLE_STATUSES = ["OPEN", "CLAIMED"];
export const CLOSE_REASON_MAX = 1000;

/**
 * @param {string} ticketId
 * @param {object} opts
 * @param {string} [opts.serverId]       ако е подаден — тикетът ТРЯБВА да е от този сървър (изолация)
 * @param {string|null} [opts.closedById]
 * @param {string|null} [opts.reason]
 * @param {Date|null} [opts.inactiveBefore] затваря само ако `lastActivityAt < inactiveBefore`
 * @param {"manual"|"inactivity"|"creator_left"|"channel_deleted"|"dashboard"} [opts.source]
 * @returns {Promise<{ok:true, ticket:object, archiveUrl:string}|{ok:false, code:"NOT_FOUND"|"ALREADY_CLOSED"|"ACTIVE_AGAIN"}>}
 */
export async function closeTicketIfOpen(ticketId, opts = {}) {
  const { closedById = null, inactiveBefore = null, source = "manual" } = opts;
  const serverId = typeof opts.serverId === "string" && opts.serverId ? opts.serverId : null;
  const reason = typeof opts.reason === "string" && opts.reason.trim()
    ? opts.reason.trim().slice(0, CLOSE_REASON_MAX)
    : null;

  const won = await prisma.ticket.updateMany({
    where: {
      id: ticketId,
      status: { in: CLOSEABLE_STATUSES },
      ...(serverId && { serverId }),
      ...(inactiveBefore && { lastActivityAt: { lt: inactiveBefore } }),
    },
    data: { status: "CLOSED", closeReason: reason, closedAt: new Date() },
  });

  if (won.count === 0) {
    const cur = await prisma.ticket.findFirst({
      where: { id: ticketId, ...(serverId && { serverId }) },
      select: { status: true },
    });
    if (!cur) return { ok: false, code: "NOT_FOUND" };
    // Още отворен, но условието за неактивност не е изпълнено → има нова активност.
    if (CLOSEABLE_STATUSES.includes(cur.status)) return { ok: false, code: "ACTIVE_AGAIN" };
    return { ok: false, code: "ALREADY_CLOSED" };
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      creator: true,
      assignee: true,
      panel: { select: { transcriptChannelId: true, name: true, slaFirstResponseMinutes: true, slaResolutionMinutes: true } },
      server: { select: { archiveChannelId: true, name: true, customBotName: true } },
    },
  });

  // v50 — XP за персонал, затворил тикет без пробив на SLA.
  if (closedById) awardTicketSlaXp(ticket, closedById)?.catch?.(() => {});

  const html = generateHtmlTranscript(ticket);
  const token = await ensureArchiveToken(ticket.id, ticket.archiveToken);
  const archiveUrl = tokenizedArchiveUrl(ticket.id, token);
  await prisma.ticket.update({
    where: { id: ticket.id },
    // Discord Developer Terms §5(c)(i) — транскриптът при покой е шифриран.
    data: { archiveHtml: sealTranscript(html), archiveUrl },
  });

  await writeAudit({
    actorId: closedById || null,
    actorTag: closedById ? undefined : "SYSTEM",
    serverId: ticket.serverId,
    action: source === "inactivity" ? "TICKET_AUTO_CLOSED" : "TICKET_CLOSED",
    targetId: ticket.id,
    metadata: { reason, source },
  });

  // А2: webhook на ВСЕКИ път (бот, табло, планировчик) — на едно място.
  fireWebhooks(ticket.serverId, "TICKET_CLOSE", {
    ticketId: ticket.id,
    number: ticket.number,
    creatorId: ticket.creatorId,
    assigneeId: ticket.assigneeId,
    reason,
    closedBy: closedById,
    source,
  })?.catch?.(() => {});

  return { ok: true, ticket, archiveUrl };
}

/** Пълният адрес на архива: env има предимство, иначе от хедърите на заявката. */
export function archiveBase(req) {
  let base = process.env.FRONTEND_URL || process.env.ARCHIVE_BASE_URL || "";
  if (!base && req?.headers?.["x-forwarded-host"]) {
    const proto = req.headers["x-forwarded-proto"] || "https";
    base = `${proto}://${req.headers["x-forwarded-host"]}`;
  }
  if (!base && req?.headers?.host) base = `https://${req.headers.host}`;
  return base;
}
