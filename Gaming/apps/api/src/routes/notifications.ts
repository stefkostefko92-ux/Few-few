import { Router } from "express";
import { prisma } from "@aso/db";
import { asyncHandler } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const notificationsRouter: Router = Router();

notificationsRouter.use(requireAuth);

/** Create a notification (called from other routes). */
export async function notify(userId: string, type: string, data: Record<string, unknown>): Promise<void> {
  await prisma.notification.create({ data: { userId, type, data: JSON.stringify(data) } });
}

/** GET /api/notifications — recent items + unread count. */
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    res.json({
      items: items.map((n) => ({ ...n, data: safeParse(n.data) })),
      unread,
    });
  }),
);

/** POST /api/notifications/read — mark all as read. */
notificationsRouter.post(
  "/read",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.sub, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
