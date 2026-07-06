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
// B1 — литералът трябва да СЪВПАДА с bundled ApiVersion на SDK, иначе типовете
// (полета като current_period_end) се разминават с реалните обекти. stripe SDK
// v22.3.0 носи ApiVersion 2026-06-24.dahlia (проверено:
// node_modules/stripe/cjs/apiVersion.js) → изравнено.
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

// H2 — добавя календарни месеци към дата (за прозореца на афилиейт комисионната).
// Коректно обработва месеци с различна дължина: ако целевият месец е по-къс
// (напр. 31 ян + 1 месец), нормализира към последния ден на месеца, а не прелива
// в следващия.
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const targetMonth = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  const daysInTarget = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(day, daysInTarget));
  return d;
}

// B4 — намиране на сървъра за subscription събитие. Първо по
// stripeSubscriptionId; ако още не е записан (out-of-order доставка:
// subscription.updated пристига ПРЕДИ checkout.session.completed), пада на
// sub.metadata.serverId (сетва се в subscription_data.metadata при създаване
// на сесията). Така достъпът/статусът се прилага правилно независимо от реда.
async function findServerForSubscription(sub) {
  const byId = await prisma.server.findFirst({
    where: { stripeSubscriptionId: sub.id },
  });
  if (byId) return byId;
  const serverId = sub.metadata?.serverId;
  if (!serverId) return null;
  return prisma.server.findUnique({ where: { id: serverId } });
}

// ─── POST /api/stripe/create-checkout/:serverId ──────────────────────────────
// Create a Stripe Checkout session for Premium subscription.
//
// IDOR fix: serverId е PATH параметър (не req.body), за да мине през
// requireServerAdmin — който чете req.params.serverId и проверява, че req.user
// има ManageGuild (0x20) над този Discord сървър. Без тази проверка всеки логнат
// потребител можеше да стартира абонамент за чужд сървър.
router.post(
  "/create-checkout/:serverId",
  requireAuth,
  loadUser,
  requireServerAdmin,
  requireStripe,
  async (req, res, next) => {
  const { serverId } = req.params;
  const { withdrawalConsent } = req.body;
  if (!serverId) return res.status(400).json({ error: "serverId required" });

  // F7 — Право на отказ за дигитална услуга (чл. 16(м) Дир. 2011/83/ЕС; ЗЗП).
  // Достъпът се активира незабавно, затова изискваме ИЗРИЧНО предварително
  // съгласие от потребителя, че губи 14-дневното право на отказ за този период.
  // Без булев true → отказваме да създадем сесия (не доверяваме липсващ/неистинен флаг).
  if (withdrawalConsent !== true) {
    return res.status(400).json({
      error:
        "Withdrawal-rights consent is required before starting the subscription (Art. 16(m) Directive 2011/83/EU).",
    });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (server.isPremium) return res.status(400).json({ error: "Server is already Premium" });

    // F7 — Логваме съгласието като доказателство ПРЕДИ да създадем сесията
    // (timestamp идва от createdAt @default(now())). Доказва изричното съгласие
    // при евентуален спор за правото на отказ.
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId,
        action: "WITHDRAWAL_CONSENT",
        targetId: serverId,
        metadata: {
          withdrawalConsent: true,
          legalBasis: "Art. 16(m) Directive 2011/83/EU",
          consentedAt: new Date().toISOString(),
        },
      },
    });

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

    // M1 — Trial double-dip: подаваме Stripe trial САМО ако сървърът още не е
    // ползвал пробен период. Иначе локалният 14-дневен trial + Stripe trial =
    // 28 дни безплатно. trialUsed се вдига при стартиране на локалния trial.
    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 14);
    const grantStripeTrial = trialDays > 0 && server.trialUsed !== true;

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        subscription_data: {
          // M1 — без trial_period_days, ако trialUsed===true (вече е ползван).
          ...(grantStripeTrial && { trial_period_days: trialDays }),
          metadata: { serverId },
        },
        // M3 — Stripe Tax: автоматично изчислява ДДС по местоназначение и
        // събира tax ID (reverse charge за B2B в ЕС). Изисква активни Tax
        // registrations в Stripe Dashboard (Settings → Tax). customer_update е
        // задължителен, защото automatic_tax има нужда да обнови адреса на
        // клиента от данните на Checkout.
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        success_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}?upgraded=true`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}?canceled=true`,
        metadata: { serverId },
      },
      // L1 — Idempotency-Key със стабилен ключ за кратък прозорец: при ретрай на
      // същия POST (timeout/мрежа) Stripe връща СЪЩАТА сесия вместо да създаде
      // втора. Date.now() обезсмисляше идемпотентността (всеки ретрай = нов ключ).
      // Ключираме по serverId + UTC дата, така че опит за нов checkout на
      // следващия ден (напр. след изтекла сесия) пак минава.
      {
        idempotencyKey: `checkout-${serverId}-${new Date()
          .toISOString()
          .slice(0, 10)}`,
      }
    );

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stripe/portal/:serverId ────────────────────────────────────────
// Open the Stripe Customer Portal (manage/cancel subscription).
//
// IDOR fix: serverId е PATH параметър → минава през requireServerAdmin. Преди
// това всеки логнат потребител можеше да отвори чужд Customer Portal (вижда
// фактури/платежен метод, отказва абонамента на чужд сървър).
router.post(
  "/portal/:serverId",
  requireAuth,
  loadUser,
  requireServerAdmin,
  requireStripe,
  async (req, res, next) => {
  const { serverId } = req.params;

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

        // M2 — payment_status guard: не активирай Premium при неплатена сесия.
        // За subscription mode с trial Stripe праща payment_status="no_payment_required"
        // (валидно — trial-ът дава достъп) и session.subscription е попълнено.
        // "unpaid" БЕЗ subscription означава, че няма нито плащане, нито абонамент
        // → НЕ даваме достъп; реалната активация ще дойде по-късно през
        // invoice.paid / customer.subscription.updated.
        if (session.payment_status === "unpaid" && !session.subscription) {
          console.warn(
            `⚠️  checkout.session.completed за ${serverId} с payment_status=unpaid и без subscription — пропускам активацията`
          );
          break;
        }

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
              // B3 — „един trial на сървър" независимо от пътя: маркираме
              // trialUsed=true при всяка успешна checkout сесия (вкл. Stripe
              // trial). Иначе Stripe-trial → cancel → локален trial = двоен
              // безплатен период. Единственият друг writer е trial route-ът.
              trialUsed: true,
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
          // B2 — успешно плащане ПРОВИЗИРА достъп: платил клиент не бива да
          // зависи само от checkout.session.completed (може да се загуби или
          // да дойде извън ред). Сетваме isPremium=true идемпотентно в СЪЩАТА
          // runOnce транзакция, ключирана по event.id.
          // C3 — същевременно нулираме pastDueSince (dunning възстановен), за
          // да не отнеме достъпа scheduler-ът.
          await tx.server.update({
            where: { id: server.id },
            data: {
              isPremium: true,
              // premiumSince само при първо активиране (пазим оригиналната дата).
              ...(server.premiumSince ? {} : { premiumSince: new Date() }),
              pastDueSince: null,
            },
          });

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
            // H2 — прозорецът на комисионната е КАЛЕНДАРНИ 12 месеца от първото
            // плащане, не 12*30=360 дни. addMonths коректно прескача месеци с
            // различна дължина и високосни години.
            const windowEnd = referral.firstPaymentAt
              ? addMonths(referral.firstPaymentAt, 12)
              : null;
            if (!referral.firstPaymentAt || Date.now() < windowEnd.getTime()) {
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
            data: {
              stripeStatus: "past_due",
              // C3 — маркираме началото на past_due само ако още не е маркиран
              // (за да броим от ПЪРВИЯ провал, не от всеки последващ ретрай).
              ...(server.pastDueSince ? {} : { pastDueSince: new Date() }),
            },
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
        // B4 — lookup с fallback по sub.metadata.serverId (out-of-order).
        const server = await findServerForSubscription(sub);
        if (!server) break;

        const did = await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            data: {
              isPremium: false,
              stripeStatus: "canceled",
              stripeSubscriptionId: null,
              pastDueSince: null, // C3 — приключен абонамент, маркерът отпада.
            },
          });
        });

        if (did) console.log(`❌ Server ${server.id} subscription canceled (churn)`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        // B4 — lookup с fallback по sub.metadata.serverId (out-of-order).
        const server = await findServerForSubscription(sub);
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
        // C3 — но маркираме pastDueSince, за да може scheduler-ът да отнеме
        // достъпа, ако grace продължи >14 дни (Stripe не винаги довежда до
        // unpaid/canceled при определени dunning настройки).

        const wasTrialing = server.stripeStatus === "trialing";

        await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            data: {
              // B4 — статусът е автентичният sub.status (не хардкоднат
              // „trialing"). Ако сървърът е намерен по metadata (stripeSubscriptionId
              // още липсва при out-of-order), го записваме сега.
              ...(server.stripeSubscriptionId ? {} : { stripeSubscriptionId: sub.id }),
              stripeStatus: sub.status,
              ...(premiumOn && !server.isPremium && {
                isPremium: true,
                premiumSince: new Date(),
              }),
              // Отнемане на достъп при изчерпани ретраи / изтекъл incomplete.
              ...(premiumOff && { isPremium: false }),
              // C3 — past_due: засичаме началото (само при първи преход).
              ...(sub.status === "past_due" && !server.pastDueSince && {
                pastDueSince: new Date(),
              }),
              // C3 — върнал се е към платен/пробен статус → нулираме маркера.
              ...(premiumOn && { pastDueSince: null }),
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

      case "charge.dispute.created": {
        // Chargeback — reclaim access immediately (funds are being pulled back).
        // Requires this event to be enabled on the Stripe webhook endpoint.
        const dispute = event.data.object;
        let customerId = dispute.customer || null;
        if (!customerId && dispute.charge) {
          try { customerId = (await stripe.charges.retrieve(dispute.charge)).customer; } catch { /* best effort */ }
        }
        const server = customerId
          ? await prisma.server.findFirst({ where: { stripeCustomerId: customerId } })
          : null;
        if (!server) break;
        await runOnce(async (tx) => {
          await tx.server.update({ where: { id: server.id }, data: { isPremium: false, stripeStatus: "disputed" } });
          await tx.auditLog.create({ data: { actorTag: "STRIPE", serverId: server.id, action: "PREMIUM_REVOKED_DISPUTE", targetId: server.id, metadata: { disputeId: dispute.id } } });
        });
        console.log(`⚠️ Server ${server.id} Premium revoked — chargeback/dispute`);
        break;
      }

      case "charge.refunded": {
        // Full refund → revoke access. Partial refund (e.g. proportional consumer
        // withdrawal under Art. 14(3)) → keep access. Requires the charge.refunded
        // event enabled on the Stripe webhook endpoint.
        const charge = event.data.object;
        if (charge.amount_refunded < charge.amount) break; // partial refund → keep access
        const server = charge.customer
          ? await prisma.server.findFirst({ where: { stripeCustomerId: charge.customer } })
          : null;
        if (!server) break;
        await runOnce(async (tx) => {
          await tx.server.update({ where: { id: server.id }, data: { isPremium: false, stripeStatus: "refunded" } });
          await tx.auditLog.create({ data: { actorTag: "STRIPE", serverId: server.id, action: "PREMIUM_REVOKED_REFUND", targetId: server.id, metadata: { chargeId: charge.id } } });
        });
        console.log(`↩️ Server ${server.id} Premium revoked — full refund`);
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
        // B1 — в API 2026-06-24.dahlia current_period_end е на ниво
        // subscription item, НЕ на самия subscription (потвърдено в SDK v22
        // типовете: SubscriptionItems.d.ts). Ръчният fallback към несъществуващ
        // sub.current_period_end е премахнат — четем директно от items.data[0].
        const periodEnd = sub.items?.data?.[0]?.current_period_end ?? null;
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
