// backend/src/routes/agency.js
// Agency (multi-server) billing. One Stripe subscription grants the White-label
// tier to up to `seatLimit` servers. Access (agency.active=true) is provisioned
// ONLY through the verified Stripe webhook (routes/stripe.js) — never here.
import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { PLANS, AGENCY_PLANS, stripePriceId } from "../lib/premium.js";

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
    // One active agency per user. Direct plan changes go through the portal.
    const active = await prisma.agency.findFirst({ where: { ownerUserId: req.user.id, active: true } });
    if (active) return res.status(400).json({ error: "You already have an active agency plan. Manage it from the billing portal." });

    // F7 — withdrawal-rights consent evidence (Art. 16(m) Directive 2011/83/EU).
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id, action: "WITHDRAWAL_CONSENT", targetId: req.user.id,
        metadata: { scope: "agency", plan, legalBasis: "Art. 16(m) Directive 2011/83/EU", consentedAt: new Date().toISOString() },
      },
    }).catch(() => {});

    // Reuse a pending agency row for this user/plan if one exists, else create.
    let agency = await prisma.agency.findFirst({ where: { ownerUserId: req.user.id, active: false } });
    const seatLimit = PLANS[plan].maxServers;
    if (agency) {
      agency = await prisma.agency.update({ where: { id: agency.id }, data: { plan, seatLimit, billingInterval: interval } });
    } else {
      agency = await prisma.agency.create({ data: { ownerUserId: req.user.id, plan, seatLimit, billingInterval: interval, planSource: "stripe" } });
    }

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
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { metadata: { agencyId: agency.id, plan, interval, kind: "agency" } },
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
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
    const agency = await prisma.agency.findUnique({ where: { id: agencyId }, include: { servers: { select: { id: true } } } });
    if (!agency || agency.ownerUserId !== req.user.id) return res.status(404).json({ error: "Agency not found" });
    if (!agency.active) return res.status(403).json({ error: "Agency plan is not active." });

    const server = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true, agencyId: true } });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.agencyId === agencyId) return res.json({ ok: true, alreadyAssigned: true });
    if (server.agencyId) return res.status(409).json({ error: "Server is already covered by another agency plan." });
    if (agency.servers.length >= agency.seatLimit) {
      return res.status(409).json({ error: `Seat limit reached (${agency.seatLimit}).`, code: "SEAT_LIMIT" });
    }

    await prisma.server.update({ where: { id: serverId }, data: { agencyId } });
    await prisma.auditLog.create({ data: { actorId: req.user.id, serverId, action: "AGENCY_SEAT_ADDED", targetId: agencyId } }).catch(() => {});
    res.json({ ok: true, seatsUsed: agency.servers.length + 1, seatLimit: agency.seatLimit });
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

    await prisma.server.update({ where: { id: serverId }, data: { agencyId: null } });
    await prisma.auditLog.create({ data: { actorId: req.user.id, serverId, action: "AGENCY_SEAT_REMOVED", targetId: agencyId } }).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export { AGENCY_PLANS };
export default router;
