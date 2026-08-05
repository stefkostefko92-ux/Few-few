// backend/src/routes/referral.js
// User-facing affiliate program routes. Commission creation happens in
// the Stripe webhook (services/stripeWebhook.js) when invoices pay out.
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, loadUser);

// Commission rate — 20% for 12 months of a referred subscription
export const COMMISSION_RATE = 0.20;
export const COMMISSION_MONTHS = 12;

/**
 * Generate a human-friendly referral code — 8 chars, no ambiguous characters.
 */
function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

/**
 * GET /api/referral/me — overview of the current user's affiliate status.
 */
router.get("/me", async (req, res, next) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, referralCode: true, stripeConnectedAccountId: true },
    });

    // Lazy-assign a referral code on first access
    if (!user.referralCode) {
      let code;
      let attempts = 0;
      while (attempts++ < 10) {
        code = generateCode();
        try {
          await prisma.user.update({ where: { id: req.user.id }, data: { referralCode: code } });
          break;
        } catch (err) {
          // Collision — retry
          if (attempts >= 10) throw err;
        }
      }
      user.referralCode = code;
    }

    // Aggregate stats
    const [pending, paid, referredServers] = await Promise.all([
      prisma.referralCommission.aggregate({
        where: { referrerId: req.user.id, status: "pending" },
        _sum: { commissionCents: true }, _count: true,
      }),
      prisma.referralCommission.aggregate({
        where: { referrerId: req.user.id, status: "paid" },
        _sum: { commissionCents: true }, _count: true,
      }),
      prisma.server.count({ where: { referredByCode: user.referralCode } }),
    ]);

    res.json({
      code: user.referralCode,
      shareUrl: `${process.env.FRONTEND_URL || "https://supremebot.carbonstealth.eu"}/?ref=${user.referralCode}`,
      payoutReady: !!user.stripeConnectedAccountId,
      commissionRate: COMMISSION_RATE,
      commissionMonths: COMMISSION_MONTHS,
      stats: {
        referredServers,
        pendingCommissions:      pending._count,
        pendingCommissionCents:  pending._sum.commissionCents || 0,
        paidCommissions:         paid._count,
        paidCommissionCents:     paid._sum.commissionCents || 0,
      },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/referral/commissions — paginated list of commission events.
 */
router.get("/commissions", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "25", 10));

    const [items, total] = await Promise.all([
      prisma.referralCommission.findMany({
        where: { referrerId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.referralCommission.count({ where: { referrerId: req.user.id } }),
    ]);
    res.json({ data: items, meta: { page, limit, total } });
  } catch (err) { next(err); }
});

/**
 * POST /api/referral/apply — used during Discord sign-in flow or on server link,
 * attaches a referral code to the current session's next server link. Idempotent.
 *
 * The OAuth callback reads this from a cookie set at landing-page load (?ref=CODE).
 */
router.post("/apply", async (req, res, next) => {
  const { code, serverId } = req.body || {};
  if (!code || !serverId) return res.status(400).json({ error: "code and serverId required" });
  try {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: code.toUpperCase().trim() },
      select: { id: true, referralCode: true },
    });
    if (!referrer) return res.status(404).json({ error: "Invalid referral code" });
    if (referrer.id === req.user.id) {
      return res.status(400).json({ error: "You cannot refer yourself" });
    }

    // Only set once — do not overwrite existing referral
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { referredByCode: true, ownerId: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.referredByCode) {
      return res.status(200).json({ ok: true, alreadySet: true });
    }
    if (server.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Only the server owner can set a referral code" });
    }

    await prisma.server.update({
      where: { id: serverId },
      data: { referredByCode: referrer.referralCode },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
