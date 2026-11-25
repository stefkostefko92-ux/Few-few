import { Router, raw } from "express";
import type Stripe from "stripe";
import { prisma, type VipTier } from "@aso/db";
import { credit, debitClamped } from "@aso/db/ledger";
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

/** Състояния на покупка, от които още може да се премине към платено/провалено. */
const OPEN_PURCHASE_STATUSES = ["pending", "failed"];

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
        if (cyclic) await grantVipStipend(tx, userId, VIP_PERKS[tier].monthlyGems, invoice.id);
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
      // Спор (chargeback) или inquiry (status `warning_*` — същият Dispute обект,
      // docs.stripe.com/disputes/how-disputes-work#inquiries): покупката → disputed и
      // начисленото се взема обратно; връща се при изход в наша полза (dispute.closed).
      // Ops пак трябва да отговори на спора в Stripe — алармата остава.
      const dispute = event.data.object as Stripe.Dispute;
      logger.error(
        { id: event.id, dispute: dispute.id, amount: dispute.amount, reason: dispute.reason, status: dispute.status },
        "STRIPE DISPUTE opened — manual review required",
      );
      await clawbackPurchase(event, stripeId(dispute.payment_intent), "disputed", "DISPUTE");
      return;
    }

    case "charge.dispute.closed": {
      // „Occurs when a dispute is closed and the dispute status changes to `lost`,
      // `warning_closed`, or `won`“ (docs.stripe.com/api/events/types). `won` — в полза
      // на търговеца; `warning_closed` — inquiry, затворен без да стане chargeback
      // (docs.stripe.com/api/disputes/object → status). И в двата случая парите остават
      // при нас → връщаме точно взетото. `lost` → нищо (clawback-ът остава).
      const dispute = event.data.object as Stripe.Dispute;
      if (dispute.status === "won" || dispute.status === "warning_closed") {
        await restoreDisputed(event, stripeId(dispute.payment_intent));
      } else {
        logger.warn({ id: event.id, dispute: dispute.id, status: dispute.status }, "dispute closed — clawback stays");
        await prisma.$transaction((tx) => markProcessed(tx, event));
      }
      return;
    }

    case "charge.refunded": {
      // Stripe праща събитието и при ЧАСТИЧНО връщане; `charge.refunded` е true
      // само при пълно (docs.stripe.com/api/charges/object). Частичното не взема
      // всичко автоматично — шумно в лога за ръчно решение.
      const charge = event.data.object as Stripe.Charge;
      if (!charge.refunded) {
        logger.warn(
          { id: event.id, charge: charge.id, amount: charge.amount, refunded: charge.amount_refunded },
          "partial refund — no automatic clawback, manual review",
        );
        await prisma.$transaction((tx) => markProcessed(tx, event));
        return;
      }
      await clawbackPurchase(event, stripeId(charge.payment_intent), "refunded", "REFUND");
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
 * + бизнес-ключът `session.id`: една платена сесия = точно едно начисляване.
 *
 * Атомарно (без „прочети → реши“): редът се вмъква с ON CONFLICT DO NOTHING,
 * а преходът към „completed“ е условен `updateMany` само от незавършено
 * състояние. Postgres заключва реда — от две паралелни събития за една сесия
 * само едното вижда count = 1 и само то начислява, в същата транзакция.
 * Покупката се записва и без ред в `Product` (productId = null, SKU снимка).
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
  // Без ред в Product: productId = null — покупката пак се записва (ключ session.id).
  const productId = await productIdBySku(sku);
  if (!productId) logger.error({ id: event.id, sku, userId }, "checkout: product row missing — recorded by SKU");
  const paymentIntentId = stripeId(session.payment_intent);

  let granted = false;
  await prisma.$transaction(async (tx) => {
    // 1) Редът съществува винаги; съществуващ не се пипа (ON CONFLICT DO NOTHING).
    const inserted = await tx.purchase.createMany({
      data: [{ stripeId: session.id, userId, productId, sku, paymentIntentId, status, amountCents, currency }],
      skipDuplicates: true,
    });
    // 2) Иначе — условен преход само от незавършено състояние. „completed“ /
    //    „refunded“ / „disputed“ не се връщат назад от закъсняло събитие.
    let moved = inserted.count === 1;
    if (!moved) {
      const upd = await tx.purchase.updateMany({
        where: { stripeId: session.id, status: { in: OPEN_PURCHASE_STATUSES } },
        data: { status, amountCents, currency, ...(paymentIntentId ? { paymentIntentId } : {}) },
      });
      moved = upd.count === 1;
    }
    // 3) Начислява само победителят на прехода към „completed“. Еднократните
    //    продукти — тук; VIP — от invoice.paid.
    if (paid && moved && session.mode === "payment") {
      const got = await grantProduct(tx, userId, sku, snapshot, session.id);
      if (got) {
        await tx.purchase.updateMany({
          where: { stripeId: session.id },
          data: { grantedGems: got.gems, grantedChips: got.chips },
        });
      }
      granted = true;
    }
    await markProcessed(tx, event);
  });

  // Discord: само реално начислени еднократни покупки (VIP се обявява на invoice.paid).
  if (granted) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    if (u) notifyPurchase({ displayName: u.displayName, sku, priceCents: amountCents });
  }
}

/**
 * Пълен refund / спор → покупката става `refunded`/`disputed` и начисленото по
 * нея (`grantedGems`/`grantedChips`) се взема обратно. Идемпотентно двойно:
 * `event.id` (ProcessedEvent в същата транзакция) и условният преход само от
 * „completed“ — второ събитие (refund след спор, повторен refund, админ refund)
 * не взема втори път. Дебитът никога не сваля баланса под 0: взема наличното и
 * записва недостига в регистъра.
 *
 * Редът на събитията не е гарантиран: refund/спор може да дойде ПРЕДИ checkout
 * (напр. checkout паднал с 500 и повторен по-късно). Тогава се вмъква надгробен
 * ред по session.id със статус refunded/disputed (ON CONFLICT DO NOTHING) —
 * късният checkout не печели прехода (статусът не е в OPEN_PURCHASE_STATUSES) и
 * не начислява. Чакаща (async) покупка също се затваря, без дебит; пълен refund
 * на вече оспорена покупка я затваря като „refunded“, без втори дебит.
 */
async function clawbackPurchase(
  event: Stripe.Event,
  paymentIntentId: string | null,
  status: "refunded" | "disputed",
  reason: "REFUND" | "DISPUTE",
): Promise<void> {
  const found = paymentIntentId ? await findByPaymentIntent(paymentIntentId) : null;
  if (!found || !paymentIntentId) {
    // Напр. плащане по фактура на абонамент (VIP се отнема от subscription събитията).
    logger.warn({ id: event.id, type: event.type, paymentIntentId }, "clawback: no matching purchase");
    await prisma.$transaction((tx) => markProcessed(tx, event));
    return;
  }
  const tombSku = "session" in found ? (found.session.metadata?.sku ?? null) : null;
  const tombProductId = tombSku ? await productIdBySku(tombSku) : null;

  await prisma.$transaction(async (tx) => {
    let purchaseId: string;
    if ("purchase" in found) {
      purchaseId = found.purchase.id;
    } else {
      // Сесия без ред при нас → надгробен ред; ако междувременно checkout го е
      // вмъкнал (count = 0), продължаваме по обичайния път с неговия ред.
      const session = found.session;
      const md = session.metadata ?? {};
      const userId = md.userId ?? session.client_reference_id ?? null;
      const owner = userId ? await tx.user.findUnique({ where: { id: userId }, select: { id: true } }) : null;
      if (owner && userId) {
        const ins = await tx.purchase.createMany({
          data: [
            {
              stripeId: session.id,
              userId,
              productId: tombProductId,
              sku: tombSku,
              paymentIntentId,
              status,
              amountCents: typeof session.amount_total === "number" ? session.amount_total : 0,
              currency: (session.currency ?? "eur").toLowerCase(),
            },
          ],
          skipDuplicates: true,
        });
        if (ins.count === 1) {
          logger.warn({ id: event.id, session: session.id, status }, "clawback before checkout — tombstone recorded");
          await markProcessed(tx, event);
          return;
        }
      }
      const row = await tx.purchase.findUnique({ where: { stripeId: session.id }, select: { id: true } });
      if (!row) {
        logger.warn({ id: event.id, session: session.id }, "clawback: session without owner — nothing to record");
        await markProcessed(tx, event);
        return;
      }
      purchaseId = row.id;
    }

    const moved = await tx.purchase.updateMany({
      where: { id: purchaseId, status: "completed" },
      data: { status, paymentIntentId },
    });
    if (moved.count === 1) {
      // Начисленото — прочетено ВЪТРЕ в транзакцията, след заключването на реда
      // (снимка отпреди може да е остаряла: начисляване, комитнато междувременно).
      const p = await tx.purchase.findUnique({
        where: { id: purchaseId },
        select: { userId: true, grantedGems: true, grantedChips: true },
      });
      if (p) {
        const gems = await debitClamped(tx, p.userId, "GEMS", p.grantedGems, reason, purchaseId);
        const chips = await debitClamped(tx, p.userId, "CHIPS", p.grantedChips, reason, purchaseId);
        if (gems.shortfall > 0n || chips.shortfall > 0n) {
          logger.warn(
            {
              id: event.id,
              purchaseId,
              gemsShortfall: gems.shortfall.toString(),
              chipsShortfall: chips.shortfall.toString(),
            },
            "clawback: balance stopped at 0 — shortfall recorded",
          );
        }
      }
    } else {
      // Още неплатена (async) покупка: затваряме я без дебит — късното
      // async_payment_succeeded вече не може да начисли.
      // Пълен refund на оспорена покупка (напр. inquiry, затворен с връщане от
      // таблото): disputed → refunded БЕЗ нов дебит — DISPUTE вече е взел. Иначе
      // последващото dispute.closed (warning_closed/won) би върнало валутата на
      // играч, който е получил и парите.
      await tx.purchase.updateMany({
        where: {
          id: purchaseId,
          status: { in: reason === "REFUND" ? [...OPEN_PURCHASE_STATUSES, "disputed"] : OPEN_PURCHASE_STATUSES },
        },
        data: { status, paymentIntentId },
      });
    }
    await markProcessed(tx, event);
  });
}

/**
 * Спор, затворен в наша полза → покупката обратно в „completed“ и се връща ТОЧНО
 * взетото при спора: сумата от регистъра (reason DISPUTE, refId = purchase.id).
 * `delta` е реално взетото, недостигът не влиза. Връщането е ред DISPUTE с
 * положителна delta, така че нетната сума по спора става 0. Идемпотентно: event.id
 * + условният преход само от „disputed“. Спор без нито един ред DISPUTE (надгробен
 * ред / само козметика) остава „disputed“ за ръчна проверка. Покупка, затворена
 * междувременно с пълен refund („refunded“), не се връща.
 */
async function restoreDisputed(event: Stripe.Event, paymentIntentId: string | null): Promise<void> {
  const found = paymentIntentId ? await findByPaymentIntent(paymentIntentId) : null;
  if (!found || !("purchase" in found)) {
    logger.warn({ id: event.id, paymentIntentId }, "dispute won: no matching purchase");
    await prisma.$transaction((tx) => markProcessed(tx, event));
    return;
  }
  const purchaseId = found.purchase.id;
  await prisma.$transaction(async (tx) => {
    const moved = await tx.purchase.updateMany({
      where: { id: purchaseId, status: "disputed" },
      data: { status: "completed" },
    });
    if (moved.count === 1) {
      const rows = await tx.currencyLedger.findMany({
        where: { refId: purchaseId, reason: "DISPUTE" },
        select: { userId: true, currency: true, delta: true },
      });
      if (rows.length === 0) {
        // Спорът не е взел нищо (нито дебит, нито недостиг): надгробен ред (спор
        // преди checkout — нищо не е начислявано) или покупка само с козметика.
        // Не я правим „completed“ без начисляване — остава „disputed“ (видимо в
        // таблото) за ръчно решение. Връщането е в същата транзакция → никой не
        // вижда междинното „completed“.
        await tx.purchase.updateMany({ where: { id: purchaseId }, data: { status: "disputed" } });
        logger.warn(
          { id: event.id, purchaseId },
          "dispute won: nothing was clawed back (tombstone or cosmetic-only) — left disputed for manual review",
        );
        await markProcessed(tx, event);
        return;
      }
      let restored = 0n;
      for (const currency of ["GEMS", "CHIPS"] as const) {
        const net = rows.filter((r) => r.currency === currency).reduce((s, r) => s + BigInt(r.delta), 0n);
        if (net < 0n) {
          await credit(tx, found.purchase.userId, currency, -net, "DISPUTE", purchaseId);
          restored += -net;
        }
      }
      if (restored === 0n) {
        // Начислено е, но балансът е бил 0 при спора (само недостиг) — нищо за връщане.
        logger.warn({ id: event.id, purchaseId }, "dispute won: clawback was shortfall only — nothing to restore");
      }
    }
    await markProcessed(tx, event);
  });
}

type Found = { purchase: { id: string; userId: string } } | { session: Stripe.Checkout.Session };

/**
 * Покупката по PaymentIntent; за стари редове без него — през Checkout сесията.
 * Сесия без ред при нас (събитието е изпреварило checkout) → връща сесията.
 */
async function findByPaymentIntent(paymentIntentId: string): Promise<Found | null> {
  const direct = await prisma.purchase.findUnique({ where: { paymentIntentId } });
  if (direct) return { purchase: direct };
  const sessions = await getStripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = sessions.data[0];
  if (!session) return null;
  const bySession = await prisma.purchase.findUnique({ where: { stripeId: session.id } });
  return bySession ? { purchase: bySession } : { session };
}

/** id от разширяемо поле на Stripe (низ или обект) или null. */
function stripeId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}
