// backend/src/routes/stripe.js
import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";

const router = Router();

// Guard: stripe routes degrade gracefully if key not configured.
// F3 — пинваме API версията: без пин ъпгрейд на акаунта мълчаливо променя
// формата на обектите/събитията. Текуща стабилна версия (проверена на живо
// 2026-06-27, docs.stripe.com/changelog): 2026-06-24.dahlia.
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey
  ? new Stripe(stripeKey, { apiVersion: "2026-06-24.dahlia" })
  : null;

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
      // F4 — Idempotency-Key: при ретрай (timeout/мрежа) не създаваме дубъл
      // Stripe клиент за същия сървър. Ключ по serverId, защото при липсващ
      // stripeCustomerId има точно един клиент на сървър.
      const customer = await stripe.customers.create(
        {
          metadata: { serverId, discordUserId: req.user.id },
          description: `Discord server ${serverId}`,
        },
        { idempotencyKey: `cust-${serverId}` }
      );
      customerId = customer.id;

      await prisma.server.update({
        where: { id: serverId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create(
      {
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
      },
      // F4 — Idempotency-Key и тук: ретрай на същия POST не създава втора сесия.
      // Включваме timestamp, за да позволим нова сесия след отказана/изтекла.
      { idempotencyKey: `checkout-${serverId}-${Date.now()}` }
    );

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

  // F1+F2 — Идемпотентност по event.id. Stripe ПОВТАРЯ webhook-и при всеки
  // не-2xx/timeout и при ретраи. Затова всеки handler пуска бизнес-ефекта си
  // в една prisma.$transaction, чието ПЪРВО действие е create на
  // ProcessedStripeEvent(event.id). Ако събитието вече е обработено → Prisma
  // хвърля P2002 (unique violation) → отказва цялата транзакция → връщаме 200
  // и спираме, без да дублираме ефекта (двойно таксуване/двойна комисионна).
  //
  // Помощник: обвива даден ефект в транзакция с маркер за идемпотентност.
  // Връща true ако ефектът е изпълнен, false ако събитието вече е обработено.
  async function runOnce(effect) {
    try {
      await prisma.$transaction(async (tx) => {
        // Маркерът е ПЪРВ — при дубъл P2002 спира преди ефекта.
        await tx.processedStripeEvent.create({
          data: { id: event.id, type: event.type },
        });
        await effect(tx);
      });
      return true;
    } catch (err) {
      if (err?.code === "P2002") {
        console.log(`↩️  Stripe event ${event.id} (${event.type}) вече обработено — пропускам`);
        return false;
      }
      throw err;
    }
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

        const did = await runOnce(async (tx) => {
          await tx.server.update({
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

          await tx.paymentLog.create({
            data: {
              serverId,
              amount: session.amount_total || 0,
              // F6 — fallback "eur": продуктът таксува в евро (ЕС).
              currency: session.currency || "eur",
              status: "paid",
              description: "Premium subscription started",
            },
          });
        });

        if (did) console.log(`✅ Server ${serverId} upgraded to Premium`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customer = invoice.customer;
        const server = await prisma.server.findFirst({
          where: { stripeCustomerId: String(customer) },
        });
        if (!server) break;

        // Целият ефект (payment log + affiliate комисионна) е в ЕДНА транзакция,
        // ключирана по event.id. Така ретрай на invoice.paid НЕ дублира нито
        // payment log-а, нито 20% комисионната за афилиейта.
        await runOnce(async (tx) => {
          await tx.paymentLog.create({
            data: {
              serverId: server.id,
              stripeInvoiceId: invoice.id,
              amount: invoice.amount_paid,
              // F6 — fallback "eur" вместо "usd".
              currency: invoice.currency || "eur",
              status: "paid",
              description: "Recurring subscription payment",
            },
          });

          // v2.1 — Affiliate commission tracking (20% for 12 months)
          const referral = await tx.affiliateReferral.findFirst({
            where: { referredServerId: server.id, status: { in: ["pending", "active"] } },
          });
          if (referral) {
            const twelveMonths = 12 * 30 * 24 * 60 * 60 * 1000;
            const elapsed = referral.firstPaymentAt
              ? Date.now() - referral.firstPaymentAt.getTime()
              : 0;
            if (!referral.firstPaymentAt || elapsed < twelveMonths) {
              const commission = Math.floor(invoice.amount_paid * 0.20); // 20%
              await tx.affiliateReferral.update({
                where: { id: referral.id },
                data: {
                  status: "active",
                  firstPaymentAt: referral.firstPaymentAt || new Date(),
                  lastPaymentAt: new Date(),
                  totalEarnings: { increment: commission },
                },
              });
              await tx.affiliateCode.update({
                where: { id: referral.affiliateId },
                data: {
                  totalEarnings:   { increment: commission },
                  pendingEarnings: { increment: commission },
                  conversions:     referral.firstPaymentAt ? undefined : { increment: 1 },
                },
              });
            }
          }
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const server = await prisma.server.findFirst({
          where: { stripeCustomerId: String(invoice.customer) },
        });
        if (!server) break;

        await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            data: { stripeStatus: "past_due" },
          });

          await tx.paymentLog.create({
            data: {
              serverId: server.id,
              stripeInvoiceId: invoice.id,
              amount: invoice.amount_due,
              // F6 — fallback "eur" вместо "usd".
              currency: invoice.currency || "eur",
              status: "failed",
              description: "Payment failed",
            },
          });
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const server = await prisma.server.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!server) break;

        const did = await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            data: {
              isPremium: false,
              stripeStatus: "canceled",
              stripeSubscriptionId: null,
            },
          });
        });

        if (did) console.log(`❌ Server ${server.id} subscription canceled (churn)`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const server = await prisma.server.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!server) break;

        // ─── F5 — Политика на достъп спрямо статуса на абонамента ────────────
        // active/trialing → Premium ВКЛ. (платено или валиден пробен период).
        // past_due        → GRACE: оставяме isPremium=true до края на периода;
        //                   Smart Retries още опитват да съберат плащането.
        //                   Реалното отнемане при изчерпани ретраи идва после
        //                   като subscription.updated→unpaid/canceled или
        //                   subscription.deleted.
        // unpaid          → ретраите се изчерпаха → СВАЛЯМЕ isPremium=false.
        // incomplete_expired → първото плащане никога не мина (SCA/картов
        //                   провал в рамките на ~23ч) → достъп НЕ се дава →
        //                   isPremium=false.
        // canceled/paused → достъпът се отнема (canceled обикновено идва и
        //                   през subscription.deleted; тук е за подсигуряване).
        const premiumOn = ["active", "trialing"].includes(sub.status);
        const premiumOff = ["unpaid", "incomplete_expired", "canceled", "paused"].includes(
          sub.status
        );
        // past_due НЕ е в нито един списък → isPremium остава непроменен (grace).

        const wasTrialing = server.stripeStatus === "trialing";

        await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            data: {
              stripeStatus: sub.status,
              ...(premiumOn && !server.isPremium && {
                isPremium: true,
                premiumSince: new Date(),
              }),
              // Отнемане на достъп при изчерпани ретраи / изтекъл incomplete.
              ...(premiumOff && { isPremium: false }),
            },
          });
        });

        if (sub.status === "active" && wasTrialing) {
          console.log(`✅ Server ${server.id} trial converted to paid subscription`);
        }
        if (premiumOff) {
          console.log(`❌ Server ${server.id} достъп отнет (статус: ${sub.status})`);
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
