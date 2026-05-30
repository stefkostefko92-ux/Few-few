import { Router } from "express";
import { prisma } from "@aso/db";
import { asyncHandler } from "../http.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const metricsRouter: Router = Router();

// Operational metrics for a staff dashboard (§19 observability).
metricsRouter.use(requireAuth, requireRole("MODERATOR", "ADMIN", "OWNER"));

/** GET /api/metrics — lightweight operational snapshot. */
metricsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [users, matchesTotal, matches24h, openFlags, activeSubs] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.match.count({ where: { startedAt: { gte: since24h } } }),
      prisma.collusionFlag.count({ where: { status: "OPEN" } }),
      prisma.subscription.count({ where: { status: "active" } }),
    ]);

    res.json({
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      users,
      matchesTotal,
      matches24h,
      openFlags,
      activeSubs,
      ts: new Date().toISOString(),
    });
  }),
);
