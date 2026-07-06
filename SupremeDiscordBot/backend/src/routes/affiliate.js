// backend/src/routes/affiliate.js
// 20% recurring commission for 12 months per referred paid server.
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser } from "../middleware/auth.js";

const router = Router();

// Commission rate (20%) and duration (12 months)
export const AFFILIATE_COMMISSION_RATE = 0.20;
export const AFFILIATE_DURATION_MONTHS = 12;
const MIN_PAYOUT_CENTS = 2500; // €25 minimum payout threshold

function generateCode() {
  // 8 chars, alphanumeric, no ambiguous 0/O/I/l
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

// ─── Public click-tracking (no auth) ──────────────────────────────────────────
// GET /api/affiliate/track?code=ABCD1234
// Increments click counter and sets a cookie. Redirects to landing.
router.get("/track", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/");

  try {
    const affiliate = await prisma.affiliateCode.findUnique({ where: { code: String(code) } });
    if (affiliate) {
      await prisma.affiliateCode.update({
        where: { id: affiliate.id },
        data: { clicks: { increment: 1 } },
      });
      // Set 30-day tracking cookie
      res.cookie("bp_ref", affiliate.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: false, // Readable by frontend for attribution
        sameSite: "lax",
      });
    }
  } catch { /* silent */ }

  res.redirect("/?ref=" + String(code));
});

// ─── Authenticated affiliate dashboard ─────────────────────────────────────────
router.use(requireAuth, loadUser);

// GET /api/affiliate/me — your affiliate status + stats
router.get("/me", async (req, res, next) => {
  try {
    let affiliate = await prisma.affiliateCode.findUnique({
      where: { userId: req.user.id },
      include: {
        _count: { select: { referrals: true } },
        referrals: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!affiliate) {
      // Auto-create on first view
      affiliate = await prisma.affiliateCode.create({
        data: {
          userId: req.user.id,
          code: generateCode(),
        },
        include: {
          _count: { select: { referrals: true } },
          referrals: true,
        },
      });
    }

    // Resolve referred server names for display
    const serverIds = affiliate.referrals.map((r) => r.referredServerId);
    const servers = serverIds.length > 0
      ? await prisma.server.findMany({
          where: { id: { in: serverIds } },
          select: { id: true, name: true, icon: true },
        })
      : [];
    const serverMap = Object.fromEntries(servers.map((s) => [s.id, s]));

    const enrichedReferrals = affiliate.referrals.map((r) => ({
      ...r,
      server: serverMap[r.referredServerId] || null,
    }));

    res.json({
      code: affiliate.code,
      link: `${process.env.FRONTEND_URL || "https://supreme.carbonstealth.eu"}/api/affiliate/track?code=${affiliate.code}`,
      clicks: affiliate.clicks,
      signups: affiliate.signups,
      conversions: affiliate.conversions,
      totalEarnings: affiliate.totalEarnings,
      pendingEarnings: affiliate.pendingEarnings,
      paidEarnings: affiliate.paidEarnings,
      paypalEmail: affiliate.paypalEmail,
      commissionRate: AFFILIATE_COMMISSION_RATE,
      durationMonths: AFFILIATE_DURATION_MONTHS,
      minPayoutCents: MIN_PAYOUT_CENTS,
      eligibleForPayout: affiliate.pendingEarnings >= MIN_PAYOUT_CENTS,
      referrals: enrichedReferrals,
      referralCount: affiliate._count.referrals,
    });
  } catch (err) { next(err); }
});

// PATCH /api/affiliate/me — update payout details
router.patch("/me", async (req, res, next) => {
  const { paypalEmail } = req.body;
  if (!paypalEmail || typeof paypalEmail !== "string") {
    return res.status(400).json({ error: "paypalEmail required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  try {
    const affiliate = await prisma.affiliateCode.update({
      where: { userId: req.user.id },
      data: { paypalEmail },
    });
    res.json({ paypalEmail: affiliate.paypalEmail });
  } catch (err) { next(err); }
});

// POST /api/affiliate/payout — request a payout (admin processes manually)
router.post("/payout", async (req, res, next) => {
  try {
    const affiliate = await prisma.affiliateCode.findUnique({
      where: { userId: req.user.id },
    });
    if (!affiliate) return res.status(404).json({ error: "No affiliate account" });
    if (affiliate.pendingEarnings < MIN_PAYOUT_CENTS) {
      return res.status(400).json({
        error: `Minimum payout is €${(MIN_PAYOUT_CENTS / 100).toFixed(2)}. You have €${(affiliate.pendingEarnings / 100).toFixed(2)}.`,
      });
    }
    if (!affiliate.paypalEmail) {
      return res.status(400).json({ error: "Set your PayPal email first." });
    }

    // Log as audit event — admin reviews + processes manually (v2.1 simplicity)
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: null,
        action: "AFFILIATE_PAYOUT_REQUESTED",
        targetId: affiliate.id,
        metadata: {
          amount: affiliate.pendingEarnings,
          paypalEmail: affiliate.paypalEmail,
        },
      },
    });

    res.json({
      message: "Payout request submitted. You'll receive funds within 7 business days.",
      amount: affiliate.pendingEarnings,
    });
  } catch (err) { next(err); }
});

export default router;
