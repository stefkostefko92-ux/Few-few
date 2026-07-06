// backend/src/routes/analytics.js
// Dashboard analytics: heatmaps, leaderboards, funnels, time-series.
// Reads from both live counts and daily_metrics snapshots.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, loadUser);

// ─── GET /api/analytics/:serverId/overview ─────────────────────────────────
// High-level counters + 30-day sparkline data
router.get("/:serverId/overview", requireServerAdmin, async (req, res, next) => {
  try {
    const serverId = req.params.serverId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalTickets, openTickets, closedTickets,
      totalApplications, approvedApplications, deniedApplications,
      thirtyDayMetrics,
    ] = await Promise.all([
      prisma.ticket.count({ where: { serverId } }),
      prisma.ticket.count({ where: { serverId, status: "OPEN" } }),
      prisma.ticket.count({ where: { serverId, status: "CLOSED" } }),
      prisma.application.count({ where: { serverId } }),
      prisma.application.count({ where: { serverId, status: "APPROVED" } }),
      prisma.application.count({ where: { serverId, status: "DENIED" } }),
      prisma.dailyMetric.findMany({
        where: { serverId, date: { gte: thirtyDaysAgo } },
        orderBy: { date: "asc" },
      }),
    ]);

    res.json({
      tickets: { total: totalTickets, open: openTickets, closed: closedTickets },
      applications: {
        total: totalApplications,
        approved: approvedApplications,
        denied: deniedApplications,
        approvalRate: totalApplications > 0
          ? Math.round((approvedApplications / totalApplications) * 100)
          : 0,
      },
      sparkline: thirtyDayMetrics,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/:serverId/heatmap ─────────────────────────────────
// 7×24 grid (day-of-week × hour) of ticket open times from the last 90 days.
// Used to identify peak support-demand hours.
router.get("/:serverId/heatmap", requireServerAdmin, async (req, res, next) => {
  try {
    const serverId = req.params.serverId;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const tickets = await prisma.ticket.findMany({
      where: { serverId, createdAt: { gte: ninetyDaysAgo } },
      select: { createdAt: true },
    });

    // Build 7×24 grid: grid[dayOfWeek][hour] = count
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const t of tickets) {
      const d = t.createdAt;
      grid[d.getUTCDay()][d.getUTCHours()]++;
    }

    res.json({
      grid,
      total: tickets.length,
      days: 90,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/:serverId/leaderboard ─────────────────────────────
// Staff performance: tickets assigned, and closed-while-assigned in last 30 days.
router.get("/:serverId/leaderboard", requireServerAdmin, async (req, res, next) => {
  try {
    const serverId = req.params.serverId;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Group all tickets assigned in last 30 days by assignee
    const assigned = await prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: {
        serverId,
        assigneeId: { not: null },
        updatedAt: { gte: thirtyDaysAgo },
      },
      _count: { _all: true },
    });

    // Group closed-while-assigned tickets
    const closed = await prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: {
        serverId,
        assigneeId: { not: null },
        status: "CLOSED",
        closedAt: { gte: thirtyDaysAgo },
      },
      _count: { _all: true },
    });

    const staffMap = {};
    for (const c of assigned) {
      if (!c.assigneeId) continue;
      staffMap[c.assigneeId] = {
        userId: c.assigneeId,
        claimed: c._count._all,
        closed: 0,
      };
    }
    for (const c of closed) {
      if (!c.assigneeId) continue;
      if (!staffMap[c.assigneeId]) {
        staffMap[c.assigneeId] = { userId: c.assigneeId, claimed: 0, closed: 0 };
      }
      staffMap[c.assigneeId].closed = c._count._all;
    }

    const leaderboard = Object.values(staffMap)
      .sort((a, b) => (b.claimed + b.closed) - (a.claimed + a.closed))
      .slice(0, 10);

    res.json({ period: "30d", leaderboard });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/:serverId/funnel ───────────────────────────────────
// Application conversion funnel: submitted → reviewed → approved
router.get("/:serverId/funnel", requireServerAdmin, async (req, res, next) => {
  try {
    const serverId = req.params.serverId;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [submitted, approved, denied] = await Promise.all([
      prisma.application.count({ where: { serverId, createdAt: { gte: ninetyDaysAgo } } }),
      prisma.application.count({ where: { serverId, status: "APPROVED", createdAt: { gte: ninetyDaysAgo } } }),
      prisma.application.count({ where: { serverId, status: "DENIED", createdAt: { gte: ninetyDaysAgo } } }),
    ]);

    const reviewed = approved + denied;
    const pending = submitted - reviewed;

    res.json({
      period: "90d",
      stages: [
        { label: "Submitted", count: submitted, pct: 100 },
        { label: "Reviewed",  count: reviewed,  pct: submitted ? Math.round((reviewed / submitted) * 100) : 0 },
        { label: "Approved",  count: approved,  pct: submitted ? Math.round((approved / submitted) * 100) : 0 },
        { label: "Denied",    count: denied,    pct: submitted ? Math.round((denied / submitted) * 100) : 0 },
      ],
      pending,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/analytics/:serverId/timeseries ───────────────────────────────
// Raw daily metrics for custom charting
router.get("/:serverId/timeseries", requireServerAdmin, async (req, res, next) => {
  try {
    const { from, to, metric } = req.query;
    const where = { serverId: req.params.serverId };
    if (from) where.date = { ...where.date, gte: new Date(String(from)) };
    if (to)   where.date = { ...where.date, lte: new Date(String(to)) };

    const metrics = await prisma.dailyMetric.findMany({
      where,
      orderBy: { date: "asc" },
      take: 365,
    });

    const data = metric
      ? metrics.map((m) => ({ date: m.date, value: m[String(metric)] ?? 0 }))
      : metrics;

    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
