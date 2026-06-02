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
      const periodEnd = new Date(subscriptionPeriodEnd(sub) * 1000);
      await prisma.$transaction(async (tx) => {
        await applyVip(tx, userId, tier, periodEnd);
        // Each paid invoice (incl. the first) credits the tier's gem stipend.
        await grantVipStipend(tx, userId, VIP_PERKS[tier].monthlyGems);
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
      const active = sub.status === "active" || sub.status === "trialing";
      await prisma.$transaction(async (tx) => {
        if (!active) {
          await clearVip(tx, userId);
        }
        await tx.subscription.updateMany({
          where: { userId },
          data: { status: sub.status, currentPeriodEnd: new Date(subscriptionPeriodEnd(sub) * 1000) },
        });
        await markProcessed(tx, event);
      });
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
