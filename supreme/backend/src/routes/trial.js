// backend/src/routes/trial.js
// 14-day Premium trial — one per server, no credit card required.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";

const router = Router();
router.use(requireAuth, loadUser);

const TRIAL_DAYS = 14;

/**
 * GET /api/trial/:serverId — trial status for this server.
 * Returns: { eligible, active, daysLeft, trialUsed, endsAt }
 */
router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { trialUsed: true, trialStartedAt: true, trialEndsAt: true, isPremium: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });

    const now = new Date();
    const active = !!(server.trialEndsAt && server.trialEndsAt > now);
    const daysLeft = active
      ? Math.ceil((server.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    res.json({
      eligible: !server.trialUsed && !server.isPremium,
      active,
      daysLeft,
      trialUsed: server.trialUsed,
      startedAt: server.trialStartedAt,
      endsAt: server.trialEndsAt,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/trial/:serverId/start — activate the 14-day trial.
 * One-shot per server; fails if already used or already premium.
 */
router.post("/:serverId/start", requireServerAdmin, async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { trialUsed: true, isPremium: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.isPremium) {
      return res.status(400).json({ error: "This server is already on Premium." });
    }
    if (server.trialUsed) {
      return res.status(400).json({
        error: "This server has already used its free trial. Upgrade to Premium to continue.",
        code: "TRIAL_USED",
      });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        trialUsed: true,
        trialStartedAt: now,
        trialEndsAt: endsAt,
      },
      select: { trialStartedAt: true, trialEndsAt: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "TRIAL_STARTED",
        targetId: req.params.serverId,
        metadata: { trialDays: TRIAL_DAYS, endsAt },
      },
    }).catch(() => {});

    res.json({
      active: true,
      daysLeft: TRIAL_DAYS,
      startedAt: updated.trialStartedAt,
      endsAt: updated.trialEndsAt,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/trial/:serverId/cancel — end the trial early.
 * Sets trialEndsAt to now so the server reverts to base tier immediately.
 * trialUsed stays true so user can't re-activate.
 */
router.post("/:serverId/cancel", requireServerAdmin, async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { trialEndsAt: true, isPremium: true, trialUsed: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.isPremium) {
      return res.status(400).json({
        error: "This server has a paid Premium subscription. Cancel via the Premium page instead.",
      });
    }
    if (!server.trialEndsAt || server.trialEndsAt < new Date()) {
      return res.status(400).json({ error: "No active trial to cancel." });
    }

    await prisma.server.update({
      where: { id: req.params.serverId },
      data: { trialEndsAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "TRIAL_CANCELLED",
        targetId: req.params.serverId,
        metadata: { voluntary: true },
      },
    }).catch(() => {});

    res.json({ ok: true, message: "Trial cancelled. Server reverted to Free tier." });
  } catch (err) { next(err); }
});

export default router;
