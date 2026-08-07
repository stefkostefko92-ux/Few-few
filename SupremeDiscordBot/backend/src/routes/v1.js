// backend/src/routes/v1.js
// Public API (v1) — authenticated with API keys, scoped per server.
// Read-only surface for now; write operations can be added as user demand justifies.
//
//   GET /api/v1/server            — server info
//   GET /api/v1/panels            — list panels
//   GET /api/v1/panels/:id        — panel detail
//   GET /api/v1/tickets           — list tickets (paginated)
//   GET /api/v1/tickets/:id       — ticket detail with messages
//   GET /api/v1/forms             — list forms
//   GET /api/v1/applications      — list applications
//   GET /api/v1/polls             — list polls
//   GET /api/v1/giveaways         — list giveaways
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireApiKey } from "./apikeys.js";
import { getServerTier } from "../lib/premium.js";

const router = Router();

// ─── Server ────────────────────────────────────────────────────────────────
router.get("/server", requireApiKey("server:read"), async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: {
        id: true, name: true, icon: true, language: true, trialEndsAt: true,
        _count: { select: { tickets: true, panels: true, forms: true } },
      },
    });
    if (!server) return res.json(null);
    // Ефективен tier (agency/trial не са в суровата колона).
    const { isPremium, plan } = await getServerTier(req.params.serverId);
    res.json({ ...server, isPremium, plan });
  } catch (err) { next(err); }
});

// ─── Panels ─────────────────────────────────────────────────────────────────
router.get("/panels", requireApiKey("panels:read"), async (req, res, next) => {
  try {
    const panels = await prisma.panel.findMany({
      where: { serverId: req.params.serverId },
      include: { buttons: true, _count: { select: { tickets: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(panels);
  } catch (err) { next(err); }
});

router.get("/panels/:id", requireApiKey("panels:read"), async (req, res, next) => {
  try {
    const panel = await prisma.panel.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      include: { buttons: true, _count: { select: { tickets: true } } },
    });
    if (!panel) return res.status(404).json({ error: "Panel not found" });
    res.json(panel);
  } catch (err) { next(err); }
});

// ─── Tickets ────────────────────────────────────────────────────────────────
router.get("/tickets", requireApiKey("tickets:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "25", 10));
    const status = req.query.status;

    const where = { serverId: req.params.serverId };
    if (status === "open") where.closedAt = null;
    else if (status === "closed") where.closedAt = { not: null };

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { id: true, username: true } },
          panel:   { select: { id: true, name: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({
      data: tickets,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

router.get("/tickets/:id", requireApiKey("tickets:read"), async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      include: {
        creator: { select: { id: true, username: true } },
        panel:   { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 500 },
      },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (err) { next(err); }
});

// ─── Forms ──────────────────────────────────────────────────────────────────
router.get("/forms", requireApiKey("forms:read"), async (req, res, next) => {
  try {
    const forms = await prisma.form.findMany({
      where: { serverId: req.params.serverId },
      include: { questions: { orderBy: { order: "asc" } }, _count: { select: { applications: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(forms);
  } catch (err) { next(err); }
});

// ─── Applications ───────────────────────────────────────────────────────────
router.get("/applications", requireApiKey("applications:read"), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "25", 10));
    const [items, total] = await Promise.all([
      prisma.application.findMany({
        where: { serverId: req.params.serverId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          form: { select: { id: true, name: true } },
          user: { select: { id: true, username: true } },
        },
      }),
      prisma.application.count({ where: { serverId: req.params.serverId } }),
    ]);
    res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ─── Polls & Giveaways ──────────────────────────────────────────────────────
router.get("/polls", requireApiKey("polls:read"), async (req, res, next) => {
  try {
    const polls = await prisma.poll.findMany({
      where: { serverId: req.params.serverId },
      include: { _count: { select: { votes: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(polls);
  } catch (err) { next(err); }
});

router.get("/giveaways", requireApiKey("giveaways:read"), async (req, res, next) => {
  try {
    const giveaways = await prisma.giveaway.findMany({
      where: { serverId: req.params.serverId },
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(giveaways);
  } catch (err) { next(err); }
});

// ─── Version / health (public, no auth) ────────────────────────────────────
router.get("/status", (_req, res) => {
  res.json({ version: "2.1", status: "ok" });
});

export default router;
