import { Router, raw } from "express";
import type Stripe from "stripe";
import { prisma, type VipTier } from "@aso/db";
import { VIP_PERKS } from "@aso/shared";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { getStripe } from "../economy/stripe.js";
import { applyVip, clearVip, grantProduct, grantVipStipend, snapshotFromMetadata } from "../economy/grants.js";
import { invoiceSubscriptionId, subscriptionPeriodEnd } from "../economy/stripeShape.js";
import { productIdBySku } from "../economy/seed.js";
import { vipTierForSku } from "../economy/catalog.js";
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
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      await handleCheckoutSession(event, event.data.object as Stripe.Checkout.Session);
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
      // Нивото е записано при checkout; за стари абонаменти — изведено от SKU.
      const tier = asTier(sub.metadata?.vipTier || vipTierForSku(sub.metadata?.sku ?? ""));
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

/**
 * `checkout.session.*` — записва покупката (с реално платената сума от Stripe)
 * и начислява еднократните продукти. `completed` НЕ значи платено: при отложен
 * метод (`payment_status: "unpaid"`) само записваме „pending“ и чакаме
 * `async_payment_succeeded`/`_failed`. Идемпотентност: `event.id` (ProcessedEvent)
 * + бизнес-ключът `session.id` (вече „completed“ покупка не се начислява втори път).
 */
async function handleCheckoutSession(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<void> {
  const md = session.metadata ?? {};
  const userId = md.userId ?? session.client_reference_id ?? undefined;
  const sku = md.sku;
  if (!userId || !sku) {
    logger.warn({ id: event.id }, `${event.type} without userId/sku`);
    await prisma.$transaction((tx) => markProcessed(tx, event));
    return;
  }

  const failed = event.type === "checkout.session.async_payment_failed";
  const paid =
    !failed &&
    (event.type === "checkout.session.async_payment_succeeded" ||
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required");
  const status = failed ? "failed" : paid ? "completed" : "pending";

  // Реално платената сума от Stripe (не текущата цена на продукта) → историята
  // на приходите не се преизчислява при смяна на цената.
  const snapshot = snapshotFromMetadata(md);
  const snapPrice = Number(md.priceCents);
  const amountCents =
    typeof session.amount_total === "number"
      ? session.amount_total
      : Number.isSafeInteger(snapPrice) && snapPrice >= 0
        ? snapPrice
        : 0;
  const currency = (session.currency ?? "eur").toLowerCase();
  // Покупката се връзва към продукта по SKU независимо от `active` (платеното се
  // дължи). По SKU, не по metadata.productId — проверен ред, без FK грешка/ретрай.
  const productId = await productIdBySku(sku);

  let granted = false;
  await prisma.$transaction(async (tx) => {
    const prev = await tx.purchase.findUnique({ where: { stripeId: session.id } });
    // Еднократните продукти се дават тук; VIP — от invoice.paid.
    const alreadyGranted = prev?.status === "completed" || prev?.status === "refunded";
    if (paid && session.mode === "payment" && !alreadyGranted) {
      await grantProduct(tx, userId, sku, snapshot);
      granted = true;
    }
    if (productId) {
      await tx.purchase.upsert({
        where: { stripeId: session.id },
        create: { stripeId: session.id, userId, productId, status, amountCents, currency },
        // „completed“/„refunded“ не се връщат назад от закъсняло събитие.
        update: alreadyGranted ? {} : { status, amountCents, currency },
      });
    } else {
      logger.error({ id: event.id, sku, userId }, "checkout: product row missing — purchase not recorded");
    }
    await markProcessed(tx, event);
  });

  // Discord: само реално начислени еднократни покупки (VIP се обявява на invoice.paid).
  if (granted) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    if (u) notifyPurchase({ displayName: u.displayName, sku, priceCents: amountCents });
  }
}
