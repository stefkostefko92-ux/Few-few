// backend/src/routes/stripe.js
import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";

const router = Router();

// Guard: stripe routes degrade gracefully if key not configured
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

function requireStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured on this server." });
  }
  next();
}

// ─── POST /api/stripe/create-checkout ────────────────────────────────────────
// Create a Stripe Checkout session for Premium subscription

router.post("/create-checkout", requireAuth, loadUser, requireStripe, async (req, res, next) => {
  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: "serverId required" });

  try {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.isPremium) return res.status(400).json({ error: "Server is already Premium" });

    let customerId = server.stripeCustomerId;

    // Create Stripe customer if one doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { serverId, discordUserId: req.user.id },
        description: `Discord server ${serverId}`,
      });
      customerId = customer.id;

      await prisma.server.update({
        where: { id: serverId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        // Free trial: set STRIPE_TRIAL_DAYS=0 to disable, default is 14 days
        ...(Number(process.env.STRIPE_TRIAL_DAYS ?? 14) > 0 && {
          trial_period_days: Number(process.env.STRIPE_TRIAL_DAYS ?? 14),
        }),
        metadata: { serverId },
      },
      success_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}?upgraded=true`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}?canceled=true`,
      metadata: { serverId },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stripe/portal ──────────────────────────────────────────────────
// Open the Stripe Customer Portal (manage/cancel subscription)

router.post("/portal", requireAuth, loadUser, requireStripe, async (req, res, next) => {
  const { serverId } = req.body;

  try {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server?.stripeCustomerId) {
      return res.status(404).json({ error: "No Stripe customer found" });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: server.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────
// Handle Stripe events (raw body required — mounted before express.json())

router.post("/webhook", requireStripe, async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const serverId = session.metadata?.serverId;
        if (!serverId) break;

        // Determine initial status — trialing if trial_end is set, else active
        const initialStatus = session.subscription
          ? "trialing"  // will be updated by subscription.updated event
          : "active";

        await prisma.server.update({
          where: { id: serverId },
          data: {
            isPremium: true,
            premiumSince: new Date(),
            stripeSubscriptionId: session.subscription,
            stripeStatus: initialStatus,
            // Reset archiveRetentionDays to null (forever) for premium
            archiveRetentionDays: null,
          },
        });

        await prisma.paymentLog.create({
          data: {
            serverId,
            amount: session.amount_total || 0,
            currency: session.currency || "usd",
            status: "paid",
            description: "Premium subscription started",
          },
        });

        console.log(`✅ Server ${serverId} upgraded to Premium`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customer = invoice.customer;
        const server = await prisma.server.findFirst({
          where: { stripeCustomerId: String(customer) },
        });
        if (!server) break;

        await prisma.paymentLog.create({
          data: {
            serverId: server.id,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "paid",
            description: "Recurring subscription payment",
          },
        });

        // v2.1 — Affiliate commission tracking (20% for 12 months)
        try {
          const referral = await prisma.affiliateReferral.findFirst({
            where: { referredServerId: server.id, status: { in: ["pending", "active"] } },
          });
          if (referral) {
            const twelveMonths = 12 * 30 * 24 * 60 * 60 * 1000;
            const elapsed = referral.firstPaymentAt
              ? Date.now() - referral.firstPaymentAt.getTime()
              : 0;
            if (!referral.firstPaymentAt || elapsed < twelveMonths) {
              const commission = Math.floor(invoice.amount_paid * 0.20); // 20%
              await prisma.affiliateReferral.update({
                where: { id: referral.id },
                data: {
                  status: "active",
                  firstPaymentAt: referral.firstPaymentAt || new Date(),
                  lastPaymentAt: new Date(),
                  totalEarnings: { increment: commission },
                },
              });
              await prisma.affiliateCode.update({
                where: { id: referral.affiliateId },
                data: {
                  totalEarnings:   { increment: commission },
                  pendingEarnings: { increment: commission },
                  conversions:     referral.firstPaymentAt ? undefined : { increment: 1 },
                },
              });
            }
          }
        } catch (affErr) {
          console.error("[affiliate] commission tracking failed:", affErr.message);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const server = await prisma.server.findFirst({
          where: { stripeCustomerId: String(invoice.customer) },
        });
        if (!server) break;

        await prisma.server.update({
          where: { id: server.id },
          data: { stripeStatus: "past_due" },
        });

        await prisma.paymentLog.create({
          data: {
            serverId: server.id,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_due,
            currency: invoice.currency,
            status: "failed",
            description: "Payment failed",
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const server = await prisma.server.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!server) break;

        await prisma.server.update({
          where: { id: server.id },
          data: {
            isPremium: false,
            stripeStatus: "canceled",
            stripeSubscriptionId: null,
          },
        });

        console.log(`❌ Server ${server.id} subscription canceled (churn)`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const server = await prisma.server.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!server) break;

        // When trial converts to paid (trialing→active), ensure isPremium=true
        // When subscription is cancelled or past_due, keep isPremium until period ends
        const isPremiumStatus = ["active", "trialing"].includes(sub.status);

        await prisma.server.update({
          where: { id: server.id },
          data: {
            stripeStatus: sub.status,
            // Only activate premium here (deactivation is handled by subscription.deleted)
            ...(isPremiumStatus && !server.isPremium && {
              isPremium: true,
              premiumSince: new Date(),
            }),
          },
        });

        if (sub.status === "active" && server.stripeStatus === "trialing") {
          console.log(`✅ Server ${server.id} trial converted to paid subscription`);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── GET /api/stripe/status/:serverId ────────────────────────────────────────

router.get("/status/:serverId", requireAuth, loadUser, requireServerAdmin, requireStripe, async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { isPremium: true, premiumSince: true, stripeStatus: true, stripeSubscriptionId: true },
    });

    if (!server) return res.status(404).json({ error: "Server not found" });

    let subscriptionDetails = null;
    if (server.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(server.stripeSubscriptionId, {
          expand: ["items.data"],
        });
        // In newer Stripe API versions (2024-12+), current_period_end moved to items.data[0]
        const periodEnd = sub.current_period_end
          ?? sub.items?.data?.[0]?.current_period_end
          ?? null;
        subscriptionDetails = {
          status: sub.status,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        };
      } catch (e) {
        // Subscription might not exist in Stripe anymore
        console.warn(`Could not retrieve Stripe sub ${server.stripeSubscriptionId}: ${e.message}`);
      }
    }

    res.json({ ...server, subscriptionDetails });
  } catch (err) {
    next(err);
  }
});

export default router;
