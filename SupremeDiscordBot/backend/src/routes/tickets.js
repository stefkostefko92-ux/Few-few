// backend/src/routes/tickets.js
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { generateHtmlTranscript } from "../utils/archive.js";
import { notifyBot, sendTicketReply } from "../services/botNotifier.js";
import { requirePremium } from "../lib/premium.js";
import { ensureArchiveToken, tokenizedArchiveUrl, archiveTokenMatches } from "../lib/archiveToken.js";

const router = Router();

// ─── GET /api/tickets/archives/:ticketId ─────────────────────────────────────
// PUBLIC endpoint — no auth required. Must be before router.use(requireAuth).
// Mounted BEFORE the auth middleware so guests can view HTML archives via link.
// Requires the unguessable ?t= archive token (transcripts contain PII).

router.get("/archives/:ticketId", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { archiveHtml: true, status: true, archiveToken: true },
    });

    if (!ticket || !ticket.archiveHtml) return res.status(404).send("Archive not found");
    if (!archiveTokenMatches(ticket, req.query.t)) return res.status(404).send("Archive not found");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // CSP на архивния HTML (F8, defense-in-depth): транскриптът е генериран от
    // потребителско съдържание — заключваме до self стилове/картинки, нула
    // скриптове/обекти/форми, за да не може вграден вектор да изпълни JS в
    // нашия origin. Съгласувано с inline print-стиловете (self позволява
    // <style>, но 'unsafe-inline' е нужен само за style; скриптове са забранени).
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
    );
    res.send(ticket.archiveHtml);
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

    const [tickets, total] = await Promise.all([
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
    ]);

    res.json({ tickets, total, page: Number(page), limit: Number(limit) });
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
  const { reason } = req.body;

  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        creator: true,
        assignee: true,
        // Нужен на транскрипта: при white-label бот брандът в архива е на
        // клиента, а нашето име не се появява (виж utils/archive.js).
        server: { select: { name: true, customBotName: true } },
      },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.status === "CLOSED" || ticket.status === "ARCHIVED") {
      return res.status(400).json({ error: "Ticket is already closed" });
    }

    // Generate HTML transcript
    const html = generateHtmlTranscript(ticket);
    const archiveToken = await ensureArchiveToken(ticket.id, ticket.archiveToken);
    const archiveUrl = tokenizedArchiveUrl(ticket.id, archiveToken);
    // Note: base tier transcripts can be cleaned up after 30 days via a scheduled job.
    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        status: "CLOSED",
        closeReason: reason,
        closedAt: new Date(),
        archiveHtml: html,
        archiveUrl,
      },
    });

    // Tell bot to close Discord channel/thread and post archive link
    await notifyBot("TICKET_CLOSE", {
      ticketId: ticket.id,
      serverId: req.params.serverId,
      channelId: ticket.channelId,
      archiveUrl,
      reason,
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "TICKET_CLOSED",
        targetId: ticket.id,
        metadata: { reason },
      },
    });

    // v1.8 — fire webhook
    const { fireWebhooks } = await import("../services/webhooks.js");
    fireWebhooks(req.params.serverId, "TICKET_CLOSE", {
      ticketId: ticket.id,
      number: ticket.number,
      creatorId: ticket.creatorId,
      assigneeId: ticket.assigneeId,
      reason,
      closedBy: req.user.id,
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:serverId/:ticketId/claim ──────────────────────────────

router.post("/:serverId/:ticketId/claim", requireServerAdmin, requirePremium("ticket.claim"), async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });
    const ticket = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { assigneeId: req.user.id, status: "CLAIMED" },
    });

    await notifyBot("TICKET_CLAIMED", {
      ticketId: ticket.id,
      serverId: req.params.serverId,
      channelId: ticket.channelId,
      claimerId: req.user.id,
    });

    res.json(ticket);
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
    const ticket = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { assigneeId: null, status: "OPEN" },
    });
    res.json(ticket);
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
      select: { id: true, status: true, channelId: true, number: true },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.status === "CLOSED" || ticket.status === "ARCHIVED") {
      return res.status(400).json({ error: "Ticket is closed — it can no longer receive replies" });
    }
    if (!ticket.channelId) {
      return res.status(400).json({ error: "Ticket has no Discord channel to reply into" });
    }

    const result = await sendTicketReply({
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

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

// Note: PDF export is handled by /api/export/:serverId/ticket/:ticketId/pdf (see export.js)
// which uses pdfkit to generate a real PDF. This route previously returned HTML
// with a .html extension and has been removed.

export default router;
