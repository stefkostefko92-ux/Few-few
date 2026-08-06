// backend/src/routes/agency.js
// Agency (multi-server) billing. One Stripe subscription grants the White-label
// tier to up to `seatLimit` servers. Access (agency.active=true) is provisioned
// ONLY through the verified Stripe webhook (routes/stripe.js) — never here.
import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { PLANS, AGENCY_PLANS, stripePriceId, syncServerPaidFlag } from "../lib/premium.js";

const router = Router();

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2026-06-24.dahlia" }) : null;
function requireStripe(req, res, next) {
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured on this server." });
  next();
}

const checkoutSchema = z.object({
  plan: z.enum(["agency5", "agency10"]),
  interval: z.enum(["month", "year"]).default("month"),
  withdrawalConsent: z.literal(true),
});

// ─── GET /api/agency/mine ─────────────────────────────────────────────────────
// The current user's agency plan (if any) plus its assigned server seats.
router.get("/mine", requireAuth, loadUser, async (req, res, next) => {
  try {
    const agency = await prisma.agency.findFirst({
      where: { ownerUserId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: { servers: { select: { id: true, name: true, icon: true } } },
    });
    if (!agency) return res.json({ agency: null });
    res.json({
      agency: {
        id: agency.id, plan: agency.plan, seatLimit: agency.seatLimit,
        billingInterval: agency.billingInterval, active: agency.active,
        stripeStatus: agency.stripeStatus,
        seatsUsed: agency.servers.length, servers: agency.servers,
      },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/agency/checkout ────────────────────────────────────────────────
// Start a Stripe Checkout for an Agency plan. Creates a PENDING agency row
// (active=false); the webhook flips it active on payment.
router.post("/checkout", requireAuth, loadUser, requireStripe, async (req, res, next) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "plan (agency5|agency10), interval and withdrawalConsent:true are required." });
  }
  const { plan, interval } = parsed.data;
  const priceId = stripePriceId(plan, interval);
  if (!priceId) return res.status(503).json({ error: `The ${plan}/${interval} plan is not configured on this server.` });

  try {
    // Active-check + pending reuse/create under an advisory lock keyed on the
    // owner: two near-simultaneous checkouts would otherwise both pass the
    // "no active agency" test and create two pending rows → two Checkout
    // sessions → potentially two live subscriptions (double billing).
    const seatLimit = PLANS[plan].maxServers;
    const agencyOrNull = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"agency-owner:" + req.user.id}))`;
      const active = await tx.agency.findFirst({ where: { ownerUserId: req.user.id, active: true } });
      if (active) return null; // one active agency per user; plan changes → portal
      // Reuse a pending agency row for this user if one exists, else create.
      const pending = await tx.agency.findFirst({ where: { ownerUserId: req.user.id, active: false } });
      if (pending) {
        return tx.agency.update({ where: { id: pending.id }, data: { plan, seatLimit, billingInterval: interval } });
      }
      return tx.agency.create({ data: { ownerUserId: req.user.id, plan, seatLimit, billingInterval: interval, planSource: "stripe" } });
    });
    if (!agencyOrNull) {
      return res.status(400).json({ error: "You already have an active agency plan. Manage it from the billing portal." });
    }
    let agency = agencyOrNull;

    // F7 — withdrawal-rights consent evidence. Digital SERVICE → the right of
    // withdrawal is lost only on full performance (Art. 16(a) Directive
    // 2011/83/EU as amended by (EU) 2019/2161); matches the checkbox wording.
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id, action: "WITHDRAWAL_CONSENT", targetId: req.user.id,
        metadata: { scope: "agency", plan, legalBasis: "Art. 16(a) Directive 2011/83/EU", consentedAt: new Date().toISOString() },
      },
    }).catch(() => {});

    let customerId = agency.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { agencyId: agency.id, discordUserId: req.user.id }, description: `Agency ${agency.id} (owner ${req.user.id})` },
        { idempotencyKey: `agency-cust-${agency.id}` }
      );
      customerId = customer.id;
      await prisma.agency.update({ where: { id: agency.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        // Без payment_method_types: Stripe dynamic payment methods (Dashboard
        // управлява методите; EU локални методи вдигат конверсията) — същото
        // решение като per-server checkout-а.
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { metadata: { agencyId: agency.id, plan, interval, kind: "agency" } },
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        // ЕС доказателство за местоположение (2 непротиворечиви елемента за
        // дигитални услуги) + пълен billing адрес на фактурата (чл. 114 ЗДДС).
        billing_address_collection: "required",
        success_url: `${process.env.FRONTEND_URL}/dashboard?agency=active`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard?agency=canceled`,
        metadata: { agencyId: agency.id, plan, interval, kind: "agency" },
      },
      { idempotencyKey: `agency-checkout-${agency.id}-${plan}-${interval}-${new Date().toISOString().slice(0, 10)}` }
    );

    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// ─── POST /api/agency/portal ──────────────────────────────────────────────────
router.post("/portal", requireAuth, loadUser, requireStripe, async (req, res, next) => {
  try {
    const agency = await prisma.agency.findFirst({ where: { ownerUserId: req.user.id, stripeCustomerId: { not: null } }, orderBy: { createdAt: "desc" } });
    if (!agency?.stripeCustomerId) return res.status(404).json({ error: "No agency customer found" });
    const portal = await stripe.billingPortal.sessions.create({
      customer: agency.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard`,
      // Включва subscription_update (agency5↔agency10) — виж stripe-setup.sh.
      ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID && {
        configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
      }),
    });
    res.json({ url: portal.url });
  } catch (err) { next(err); }
});

// ─── POST /api/agency/:agencyId/servers/:serverId ─────────────────────────────
// Assign a server seat. requireServerAdmin verifies ManageGuild on :serverId;
// we additionally verify the caller owns the agency and a seat is free.
router.post("/:agencyId/servers/:serverId", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  const { agencyId, serverId } = req.params;
  try {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId },
      select: { id: true, ownerUserId: true, active: true, seatLimit: true },
    });
    if (!agency || agency.ownerUserId !== req.user.id) return res.status(404).json({ error: "Agency not found" });
    if (!agency.active) return res.status(403).json({ error: "Agency plan is not active." });

    // Atomic seat claim: an advisory lock keyed on the agency serializes
    // concurrent assigns for the same agency, so the seat cap can't be exceeded
    // by a race (double-click / reseller script). Mirrors the ticket open-limit
    // lock in routes/bot.js. The count + update happen under the same lock.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"agency:" + agencyId}))`;
      const target = await tx.server.findUnique({ where: { id: serverId }, select: { agencyId: true } });
      if (!target) return { code: "NO_SERVER" };
      if (target.agencyId === agencyId) return { code: "ALREADY" };
      if (target.agencyId) return { code: "OTHER_AGENCY" };
      const used = await tx.server.count({ where: { agencyId } });
      if (used >= agency.seatLimit) return { code: "FULL" };
      await tx.server.update({ where: { id: serverId }, data: { agencyId } });
      // Синхронизирай суровата isPremium колона В СЪЩАТА транзакция — иначе
      // покритият сървър остава isPremium=false и всеки четец на суровата
      // колона (bot config, dashboard, panel функции) го мисли за безплатен.
      await syncServerPaidFlag(serverId, tx);
      await tx.auditLog.create({ data: { actorId: req.user.id, serverId, action: "AGENCY_SEAT_ADDED", targetId: agencyId } });
      return { code: "OK", seatsUsed: used + 1 };
    });

    switch (outcome.code) {
      case "NO_SERVER":    return res.status(404).json({ error: "Server not found" });
      case "ALREADY":      return res.json({ ok: true, alreadyAssigned: true });
      case "OTHER_AGENCY": return res.status(409).json({ error: "Server is already covered by another agency plan." });
      case "FULL":         return res.status(409).json({ error: `Seat limit reached (${agency.seatLimit}).`, code: "SEAT_LIMIT" });
      default:             return res.json({ ok: true, seatsUsed: outcome.seatsUsed, seatLimit: agency.seatLimit });
    }
  } catch (err) { next(err); }
});

// ─── DELETE /api/agency/:agencyId/servers/:serverId ───────────────────────────
router.delete("/:agencyId/servers/:serverId", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  const { agencyId, serverId } = req.params;
  try {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency || agency.ownerUserId !== req.user.id) return res.status(404).json({ error: "Agency not found" });
    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { agencyId: true } });
    if (server?.agencyId !== agencyId) return res.status(404).json({ error: "Server is not on this agency plan" });

    await prisma.$transaction(async (tx) => {
      await tx.server.update({ where: { id: serverId }, data: { agencyId: null } });
      // Разкачен сървър: recompute — може още да има СОБСТВЕН платен план
      // (тогава остава premium), иначе пада на free.
      await syncServerPaidFlag(serverId, tx);
    });
    await prisma.auditLog.create({ data: { actorId: req.user.id, serverId, action: "AGENCY_SEAT_REMOVED", targetId: agencyId } }).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export { AGENCY_PLANS };
export default router;
