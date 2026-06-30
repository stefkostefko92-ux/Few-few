import { Router, raw } from "express";
import type Stripe from "stripe";
import { prisma, type VipTier } from "@aso/db";
import { VIP_PERKS } from "@aso/shared";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { getStripe } from "../economy/stripe.js";
import { applyVip, clearVip, grantProduct, grantVipStipend } from "../economy/grants.js";
import { invoiceSubscriptionId, subscriptionPeriodEnd } from "../economy/stripeShape.js";
import { productIdBySku } from "../economy/seed.js";
import { productBySku } from "../economy/catalog.js";
import { notifyPurchase, notifyVip } from "../integrations/discord.js";

export const stripeWebhookRouter: Router = Router();

const TIER_OK = new Set<VipTier>(["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"]);
const asTier = (v: string | undefined): VipTier =>
  v && TIER_OK.has(v as VipTier) ? (v as VipTier) : "NONE";

/**
 * Stripe webhook (§11.3) — the ONLY place money turns into credit.
 * - raw body + signature verification (rejects forged calls)
 * - idempotency via ProcessedEvent (dedupe by event.id)
 * - every credit applied transactionally with the dedupe marker
 *
 * Mounted with express.raw BEFORE the global json parser (see app.ts), because
 * signature verification needs the exact raw bytes.
 */
stripeWebhookRouter.post(
  "/webhooks/stripe",
  raw({ type: "application/json" }),
  async (req, res) => {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      res.status(503).json({ error: "stripe_not_configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).send("missing signature");
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(
        req.body as Buffer,
        sig,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "stripe signature verification failed");
      res.status(400).send("signature verification failed");
      return;
    }

    // Idempotency: if we've seen this event id, ack and stop.
    const seen = await prisma.processedEvent.findUnique({ where: { id: event.id } });
    if (seen) {
      res.json({ received: true, duplicate: true });
      return;
    }

    try {
      await handleEvent(event);
      res.json({ received: true });
    } catch (err) {
      // Do NOT mark processed on failure — let Stripe retry.
      logger.error({ err, id: event.id, type: event.type }, "stripe event handling failed");
      res.status(500).end();
    }
  },
);

async function markProcessed(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  event: Stripe.Event,
): Promise<void> {
  await tx.processedEvent.create({ data: { id: event.id, type: event.type } });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
      const sku = session.metadata?.sku;
      if (!userId || !sku) {
        logger.warn({ id: event.id }, "checkout.session.completed without userId/sku");
        await prisma.$transaction((tx) => markProcessed(tx, event));
        return;
      }
      const productId = await productIdBySku(sku);
      await prisma.$transaction(async (tx) => {
        // One-time purchases grant immediately; subscriptions are granted on
        // invoice.paid, but we record the purchase here for the audit trail.
        if (session.mode === "payment") await grantProduct(tx, userId, sku);
        if (session.id && productId) {
          await tx.purchase.upsert({
            where: { stripeId: session.id },
            create: { stripeId: session.id, userId, productId, status: "completed" },
            update: { status: "completed" },
          });
        }
        await markProcessed(tx, event);
      });
      // Announce one-time purchases to Discord (VIP is announced on invoice.paid).
      if (session.mode === "payment") {
        const product = productBySku(sku);
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
        if (product && u) {
          notifyPurchase({ displayName: u.displayName, sku, priceCents: product.priceCents });
        }
      }
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      if (!subId) {
        await prisma.$transaction((tx) => markProcessed(tx, event));
        return;
      }
      const sub = await getStripe().subscriptions.retrieve(subId);
      const userId = sub.metadata?.userId;
      const tier = asTier(sub.metadata?.sku?.replace("vip_", "").toUpperCase());
      if (!userId) {
        await prisma.$transaction((tx) => markProcessed(tx, event));
        return;
      }
      const periodEndSec = subscriptionPeriodEnd(sub);
      if (periodEndSec === null) {
        // Fail closed: don't fabricate a period (would silently extend VIP).
        // Throwing leaves the event unprocessed so Stripe retries / alerts.
        throw new Error("invoice.paid: could not resolve subscription period end");
      }
      const periodEnd = new Date(periodEndSec * 1000);
      // The monthly gem stipend is granted only for real new-period invoices —
      // NOT for proration/upgrade invoices (billing_reason subscription_update),
      // so churning tiers via the portal can't farm gems.
      const cyclic =
        invoice.billing_reason === "subscription_create" ||
        invoice.billing_reason === "subscription_cycle";
      await prisma.$transaction(async (tx) => {
        await applyVip(tx, userId, tier, periodEnd);
        if (cyclic) await grantVipStipend(tx, userId, VIP_PERKS[tier].monthlyGems);
        await tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeSubId: sub.id,
            tier,
            status: sub.status,
            currentPeriodEnd: periodEnd,
          },
          update: { stripeSubId: sub.id, tier, status: sub.status, currentPeriodEnd: periodEnd },
        });
        await markProcessed(tx, event);
      });
      {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
        if (u) notifyVip({ displayName: u.displayName, tier });
      }
      return;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) {
        await prisma.$transaction((tx) => markProcessed(tx, event));
        return;
      }
      // Keep VIP through a payment-retry grace (past_due); only strip it on a
      // terminal status. This avoids event-ordering races stripping a paid,
      // still-valid period.
      const terminal =
        sub.status === "canceled" ||
        sub.status === "unpaid" ||
        sub.status === "incomplete_expired";
      const periodEndSec = subscriptionPeriodEnd(sub);
      await prisma.$transaction(async (tx) => {
        if (terminal) {
          await clearVip(tx, userId);
        }
        await tx.subscription.updateMany({
          where: { userId },
          data: {
            status: sub.status,
            // Don't overwrite the stored period with a fabricated value.
            ...(periodEndSec !== null ? { currentPeriodEnd: new Date(periodEndSec * 1000) } : {}),
          },
        });
        await markProcessed(tx, event);
      });
      return;
    }

    case "invoice.payment_failed": {
      // Dunning: Stripe Smart Retries handle the re-charge; we notify the player
      // so they can update their card before VIP lapses.
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoiceSubscriptionId(invoice);
      const sub = subId ? await getStripe().subscriptions.retrieve(subId) : null;
      const userId = sub?.metadata?.userId;
      await prisma.$transaction(async (tx) => {
        if (userId) {
          await tx.notification.create({
            data: { userId, type: "system", data: JSON.stringify({ kind: "payment_failed" }) },
          });
        }
        await markProcessed(tx, event);
      });
      logger.warn({ id: event.id, userId }, "invoice payment failed (dunning)");
      return;
    }

    case "charge.dispute.created": {
      // A chargeback was opened. We do NOT auto-clawback virtual currency, but
      // ops must act (respond to the dispute, consider an abuse ban). Alert loudly.
      const dispute = event.data.object as Stripe.Dispute;
      logger.error(
        { id: event.id, dispute: dispute.id, amount: dispute.amount, reason: dispute.reason },
        "STRIPE DISPUTE opened — manual review required",
      );
      await prisma.$transaction((tx) => markProcessed(tx, event));
      return;
    }

    case "charge.refunded": {
      // Audit only — we do not claw back virtual currency automatically.
      const charge = event.data.object as Stripe.Charge;
      logger.info({ id: event.id, charge: charge.id }, "charge refunded");
      await prisma.$transaction((tx) => markProcessed(tx, event));
      return;
    }

    default: {
      // Ack and record so Stripe stops retrying unknown-but-valid events.
      await prisma.$transaction((tx) => markProcessed(tx, event));
    }
  }
}
