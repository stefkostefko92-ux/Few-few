import { Router } from "express";
import { prisma } from "@aso/db";
import { asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const announcementsRouter: Router = Router();

announcementsRouter.use(requireAuth);

/**
 * GET /api/announcements — the active, unexpired in-app announcements for the
 * signed-in player (§14). Dismissal is per-id, client-side (localStorage); this
 * endpoint just returns what is currently live, newest first. Distinct from the
 * staff Discord broadcast.
 */
announcementsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const items = await prisma.announcement.findMany({
      where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, body: true, createdAt: true },
    });
    res.json({ items });
  }),
);
