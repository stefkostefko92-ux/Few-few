// backend/src/routes/tickets.js
import { Router } from "express";
import { openTranscript } from "../lib/transcriptAtRest.js";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { notifyBotVerbose, sendTicketReply } from "../services/botNotifier.js";
import { check, recordFailure, recordSuccess } from "../lib/bruteForce.js";
import { requirePremium } from "../lib/premium.js";
import { tokenizedArchiveUrl, archiveTokenMatches } from "../lib/archiveToken.js";
import { closeTicketIfOpen, archiveBase } from "../lib/ticketClose.js";

const router = Router();

// ─── GET /api/tickets/archives/:ticketId ─────────────────────────────────────
// PUBLIC endpoint — no auth required. Must be before router.use(requireAuth).
// Mounted BEFORE the auth middleware so guests can view HTML archives via link.
// Requires the unguessable ?t= archive token (transcripts contain PII).

router.get("/archives/:ticketId", async (req, res, next) => {
  try {
    // ВТОРАТА врата към същите транскрипти. `routes/archive.js` получи защита
    // срещу налучкване на токени, а този маршрут — не: същите лични данни,
    // същият вид тайна, по-слаба охрана. Класически „едно правило, две
    // определения". Обхватът е СЪЩИЯТ („archive"), за да е един бюджетът —
    // иначе нападателят просто редува двата адреса. (Одит етап 3, 12.08.2026)
    const blocked = await check("archive", req.ip);
    if (blocked.blocked) {
      res.setHeader("Retry-After", String(blocked.retryAfterSec));
      return res.status(429).send("Too many attempts. Please try again later.");
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { archiveHtml: true, status: true, archiveToken: true },
    });

    if (!ticket || !ticket.archiveHtml) {
      await recordFailure("archive", req.ip);
      return res.status(404).send("Archive not found");
    }
    if (!archiveTokenMatches(ticket, req.query.t)) {
      await recordFailure("archive", req.ip);
      return res.status(404).send("Archive not found");
    }
    await recordSuccess("archive", req.ip);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // Токенът е в URL-а (`?t=`). Всеки външен линк в транскрипта (прикачен файл,
    // адрес в съобщение) би го изнесъл през Referer към чужд сървър — тоест
    // тайната, която пази личните данни, тръгва към третата страна, чийто линк
    // някой е пуснал в тикета. `archive.js` го имаше, тази врата — не: пак „едно
    // правило, две определения". (Одит по сигурност, 08.09.2026)
    res.setHeader("Referrer-Policy", "no-referrer");
    // CSP на архивния HTML (F8, defense-in-depth): транскриптът е генериран от
    // потребителско съдържание — заключваме до self стилове/картинки, нула
    // скриптове/обекти/форми, за да не може вграден вектор да изпълни JS в
    // нашия origin. Съгласувано с inline print-стиловете (self позволява
    // <style>, но 'unsafe-inline' е нужен само за style; скриптове са забранени).
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
    );
    res.send(openTranscript(ticket.archiveHtml));
  } catch (err) {
    next(err);
  }
});

// All routes below require authentication
router.use(requireAuth, loadUser);

// ─── GET /api/tickets/:serverId ───────────────────────────────────────────────

router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  const { status, priority, search, dateFrom, dateTo } = req.query;
  // Клампваме page/limit — клиентски подаван `limit` беше неограничен `take`
  // (напр. limit=999999 → пълно изсипване + натиск върху базата).
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);

  try {
    const where = {
      serverId: req.params.serverId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(search && {
        OR: [
          { id: { contains: search } },
          { creator: { username: { contains: search, mode: "insensitive" } } },
        ],
      }),
      // Невалидна дата дава Invalid Date, което Prisma отхвърля с грешка,
      // носеща нашия изходен код. Валидираме ТУК и просто пренебрегваме боклука.
      ...(() => {
        const from = dateFrom ? new Date(dateFrom) : null;
        const to = dateTo ? new Date(dateTo + "T23:59:59Z") : null;
        const okFrom = from && !Number.isNaN(from.getTime());
        const okTo = to && !Number.isNaN(to.getTime());
        if (!okFrom && !okTo) return {};
        return { createdAt: { ...(okFrom && { gte: from }), ...(okTo && { lte: to }) } };
      })(),
    };

    // Броячите за табовете (концепцията на таблото, 10.10.2026): същите
    // филтри БЕЗ статуса — колко са отворени/поети/затворени в търсения
    // обхват. `serverId` остава в условието, така че броим само своя сървър.
    const { status: _status, ...whereAnyStatus } = where;

    const [tickets, total, byStatus] = await Promise.all([
      prisma.ticket.findMany({
        where,
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
        assignee: { select: { id: true, username: true } },
        panel: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }).then((rows) =>
      rows.map((t) => ({
        ...t,
        hasArchive: !!t.archiveHtml || t.status === "CLOSED" || t.status === "ARCHIVED",
        archiveUrl: tokenizedArchiveUrl(t.id, t.archiveToken),
        archiveHtml: undefined, // strip HTML from list response
        archiveToken: undefined,
      }))
    ),
      prisma.ticket.count({ where }),
      prisma.ticket.groupBy({ by: ["status"], where: whereAnyStatus, _count: { _all: true } }),
    ]);
    const statusCounts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));

    res.json({ tickets, total, statusCounts, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tickets/:serverId/:ticketId ─────────────────────────────────────

router.get("/:serverId/:ticketId", requireServerAdmin, async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      include: {
        creator: true,
        assignee: true,
        panel: true,
        application: {
          include: { form: { include: { questions: { orderBy: { order: "asc" } } } } },
        },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:serverId/:ticketId/close ──────────────────────────────

router.post("/:serverId/:ticketId/close", requireServerAdmin, async (req, res, next) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;

  try {
    // Т2/Т14: същото условно затваряне като от бота (статус, транскрипт, одит,
    // webhook TICKET_CLOSE). После ботът прави Discord частта по ЕДИН път.
    const r = await closeTicketIfOpen(req.params.ticketId, {
      serverId: req.params.serverId,
      closedById: req.user.id,
      reason,
      source: "dashboard",
    });
    if (!r.ok) {
      if (r.code === "NOT_FOUND") return res.status(404).json({ error: "Ticket not found" });
      return res.status(400).json({ error: "Ticket is already closed" });
    }
    const { ticket, archiveUrl } = r;
    const base = archiveBase(req);

    // Tell bot to finalize the Discord side (closed category / thread lock,
    // Reopen/Delete message, transcript post, DM, rating, log) — НЕ да трие канала.
    // Тих провал = „затворен" тикет в базата + ОТВОРЕН канал в Discord
    // (лъжещ успех). Записът е валиден, затова не грешка, а botWarning.
    const closeResult = await notifyBotVerbose("TICKET_CLOSE", {
      ticketId: ticket.id,
      serverId: req.params.serverId,
      channelId: ticket.channelId,
      archiveUrl,
      fullArchiveUrl: base ? `${base}${archiveUrl}` : archiveUrl,
      reason: ticket.closeReason,
      closedById: req.user.id,
    });
    const botWarning = closeResult?.botError
      ? `Ticket closed, but the Discord channel was not: ${String(closeResult.botError).slice(0, 300)}`
      : null;

    const updated = { ...ticket, messages: undefined, creator: undefined, assignee: undefined, panel: undefined, server: undefined, archiveHtml: undefined };
    res.json(botWarning ? { ...updated, botWarning } : updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:serverId/:ticketId/claim ──────────────────────────────

router.post("/:serverId/:ticketId/claim", requireServerAdmin, requirePremium("ticket.claim"), async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      select: { id: true, status: true, assigneeId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });
    // Т4: claim само на OPEN тикет — условен запис, чужд claim не се краде.
    const won = await prisma.ticket.updateMany({
      where: { id: req.params.ticketId, serverId: req.params.serverId, status: "OPEN" },
      data: { assigneeId: req.user.id, status: "CLAIMED", lastActivityAt: new Date() },
    });
    if (won.count === 0) {
      return res.status(409).json({
        error: existing.status === "CLAIMED" ? "Ticket is already claimed" : "Ticket is not open",
        code: existing.status === "CLAIMED" ? "ALREADY_CLAIMED" : "NOT_OPEN",
      });
    }
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.ticketId } });

    const claimResult = await notifyBotVerbose("TICKET_CLAIMED", {
      ticketId: ticket.id,
      serverId: req.params.serverId,
      channelId: ticket.channelId,
      claimerId: req.user.id,
    });
    const botWarning = claimResult?.botError
      ? `Claimed, but Discord was not notified: ${String(claimResult.botError).slice(0, 300)}`
      : null;

    res.json(botWarning ? { ...ticket, botWarning } : ticket);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:serverId/:ticketId/unclaim ────────────────────────────

router.post("/:serverId/:ticketId/unclaim", requireServerAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });
    // Само CLAIMED → OPEN: иначе unclaim „съживяваше“ затворен тикет.
    const won = await prisma.ticket.updateMany({
      where: { id: req.params.ticketId, serverId: req.params.serverId, status: "CLAIMED" },
      data: { assigneeId: null, status: "OPEN" },
    });
    if (won.count === 0) return res.status(409).json({ error: "Ticket is not claimed", code: "NOT_CLAIMED" });
    res.json(await prisma.ticket.findUnique({ where: { id: req.params.ticketId } }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:serverId/:ticketId/reply ──────────────────────────────
// Отговор на тикет директно от dashboard-а — ботът публикува embed в тикет
// канала от името на staff члена, без той да влиза в Discord.

const replySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Reply cannot be empty")
    .max(1500, "Reply is too long (max 1500 characters)"),
});

router.post("/:serverId/:ticketId/reply", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || "Invalid reply" });
    }

    // Mass-mention неутрализация: @everyone/@here стават плейн текст (без "@").
    // Ботът праща и allowedMentions:{parse:[]} — defense in depth.
    const content = parsed.data.content.replace(/@(everyone|here)/g, "$1");

    const ticket = await prisma.ticket.findFirst({
      // IDOR guard: тикетът трябва да принадлежи точно на ТОЗИ сървър —
      // никога lookup само по ticketId от клиента.
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      select: { id: true, status: true, channelId: true, number: true, firstResponseAt: true },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.status === "CLOSED" || ticket.status === "ARCHIVED") {
      return res.status(400).json({ error: "Ticket is closed — it can no longer receive replies" });
    }
    if (!ticket.channelId) {
      return res.status(400).json({ error: "Ticket has no Discord channel to reply into" });
    }

    const result = await sendTicketReply({
      serverId: req.params.serverId,
      channelId: ticket.channelId,
      content,
      authorName: req.user.username,
      authorId: req.user.id,
      ticketId: ticket.id,
      number: ticket.number,
    });

    if (!result?.ok) {
      return res.status(502).json({
        error: "The bot is unreachable right now — the reply was not delivered. Please try again in a moment.",
      });
    }

    // Записваме TicketMessage директно: messageCreate listener-ът на бота
    // ИГНОРИРА бот съобщения (bot/src/events/messageCreate.js:
    // `if (message.author.bot) return`), затова embed-ът от бота никога няма
    // да се логне сам в transcript-а — този запис е каноничният, няма дублаж.
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user.id,
        authorTag: `${req.user.username} (via dashboard)`,
        content,
      },
    });

    // Т14: отговорът от таблото е активност на екипа — вдига lastActivityAt и
    // (първия път) firstResponseAt. Иначе: фалшива SLA аларма и авто-затваряне,
    // докато екипът отговаря активно. Вторично: провал не губи доставения отговор.
    const now = new Date();
    await prisma.ticket
      .update({
        where: { id: ticket.id },
        data: { lastActivityAt: now, ...(!ticket.firstResponseAt && { firstResponseAt: now }) },
      })
      .catch((e) => console.warn(`[tickets] activity bump failed for ${ticket.id}: ${e?.message}`));

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

// Note: PDF export is handled by /api/export/:serverId/ticket/:ticketId/pdf (see export.js)
// which uses pdfkit to generate a real PDF. This route previously returned HTML
// with a .html extension and has been removed.

export default router;
