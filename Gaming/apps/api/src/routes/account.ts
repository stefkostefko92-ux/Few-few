import { Router } from "express";
import { prisma } from "@aso/db";
import { asyncHandler, unauthorized } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clearAuthCookies } from "../auth/tokens.js";
import { revokeUser } from "../auth/revocation.js";
import { getStripe, stripeEnabled } from "../economy/stripe.js";
import { logger } from "../logger.js";

export const accountRouter: Router = Router();

accountRouter.use(requireAuth);

/**
 * GET /api/account/export — GDPR data portability. Returns everything we hold
 * about the signed-in player as a downloadable JSON document.
 */
accountRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        ratings: true,
        inventory: true,
        quests: true,
        purchases: { include: { product: { select: { sku: true, priceCents: true } } } },
        oauth: { select: { provider: true, createdAt: true } },
        matches: { select: { matchId: true, seat: true, result: true, mmrDelta: true } },
        notifications: { select: { type: true, data: true, createdAt: true } },
        friendsSent: { select: { addresseeId: true, status: true, createdAt: true } },
        friendsReceived: { select: { requesterId: true, status: true, createdAt: true } },
        achievements: { select: { key: true, unlockedAt: true } },
      },
    });
    if (!user || user.deletedAt) throw unauthorized();

    const { passwordHash: _pw, ...rest } = user;
    const data = {
      exportedAt: new Date().toISOString(),
      account: { ...rest, chips: user.chips.toString() },
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="aso-data-${id}.json"`);
    res.end(JSON.stringify(data, null, 2));
  }),
);

/**
 * POST /api/account/delete — GDPR right to erasure. We anonymize the account
 * (rather than hard-delete) so financial purchase records survive in
 * unidentifiable form; the row is then unusable for login. Cookies are cleared.
 */
accountRouter.post(
  "/delete",
  asyncHandler(async (req, res) => {
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw unauthorized();

    // Cancel any live Stripe subscription so an erased account isn't still
    // billed (best-effort; never blocks erasure).
    const sub = await prisma.subscription.findUnique({ where: { userId: id } });
    if (sub && stripeEnabled()) {
      try {
        await getStripe().subscriptions.cancel(sub.stripeSubId);
      } catch (err) {
        logger.warn({ err, userId: id }, "stripe cancel on erasure failed");
      }
    }

    await prisma.$transaction([
      // Drop credentials, federated links, social graph, and personal content.
      prisma.oAuthAccount.deleteMany({ where: { userId: id } }),
      prisma.authToken.deleteMany({ where: { userId: id } }),
      prisma.notification.deleteMany({ where: { userId: id } }),
      prisma.friendship.deleteMany({
        where: { OR: [{ requesterId: id }, { addresseeId: id }] },
      }),
      prisma.subscription.deleteMany({ where: { userId: id } }),
      // Anonymize PII and disable login. Email is rewritten to a unique,
      // non-routable address to satisfy the unique constraint.
      prisma.user.update({
        where: { id },
        data: {
          email: `deleted+${id}@deleted.invalid`,
          displayName: "Изтрит играч",
          passwordHash: null,
          emailVerified: false,
          deletedAt: new Date(),
        },
      }),
    ]);

    await revokeUser(id);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);
