// backend/src/routes/stripe.js
import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { stripePriceId, planFromStripePrice, PLANS, syncAgencyServersPaidFlag, syncServerPaidFlag } from "../lib/premium.js";
import { dmUser } from "../services/botNotifier.js";

// Single-server tiers sold via the per-server checkout. Agency (multi-server)
// plans are sold through /api/agency (routes/agency.js).
const SERVER_PLANS = ["premium", "whitelabel"];

// Agency subscription lookup (mirrors findServerForSubscription).
async function findAgencyForSub(sub) {
  const byId = await prisma.agency.findFirst({ where: { stripeSubscriptionId: sub.id } });
  if (byId) return byId;
  const agencyId = sub.metadata?.agencyId;
  return agencyId ? prisma.agency.findUnique({ where: { id: agencyId } }) : null;
}

// Resolve { plan, interval } for a Stripe subscription/invoice from its price.
function planFromSubscription(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  return planFromStripePrice(priceId);
}
function planFromInvoice(invoice) {
  // API 2026-06-24.dahlia (Basil+) moved the price off invoice line items into
  // `pricing.price_details.price`; keep the legacy `price.id` as a fallback.
  const line = invoice?.lines?.data?.find(
    (l) => l?.pricing?.price_details?.price || l?.price?.id
  );
  const priceId = line?.pricing?.price_details?.price || line?.price?.id;
  return planFromStripePrice(priceId);
}

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

  // Tier + billing interval (default: Premium monthly). Agency plans are not
  // sold here — they are account-level (routes/agency.js).
  const plan = SERVER_PLANS.includes(req.body?.plan) ? req.body.plan : "premium";
  const interval = req.body?.interval === "year" ? "year" : "month";
  const priceId = stripePriceId(plan, interval);
  if (!priceId) {
    return res.status(503).json({ error: `The ${plan}/${interval} plan is not configured on this server.` });
  }

  // F7 — Право на отказ за дигитална УСЛУГА (чл. 16(а) Дир. 2011/83/ЕС, изм.
  // Дир. (ЕС) 2019/2161; ЗЗП). Изпълнението започва незабавно с изричното
  // искане на потребителя; правото на отказ се губи едва при ПЪЛНО изпълнение,
  // а при по-ранен отказ се дължи пропорционална сума (чл. 14(3)). Изискваме
  // изрично предварително съгласие — без булев true не създаваме сесия.
  if (withdrawalConsent !== true) {
    return res.status(400).json({
      error:
        "Withdrawal-rights consent is required before starting the subscription (Art. 16(a) Directive 2011/83/EU).",
    });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });
    // Съществуващ абонат не минава през втори Checkout (би създал ВТОРИ
    // паралелен абонамент → двойно таксуване). Смяната Premium↔White-label
    // става през Customer Portal (subscription_update е включен от
    // scripts/stripe-setup.sh; webhook-ът синхронизира новата тарифа).
    if (server.isPremium) {
      return res.status(400).json({
        error: "This server already has an active subscription. Change plans from the billing portal (Manage Subscription).",
        code: "USE_PORTAL",
      });
    }

    // F7 — Логваме съгласието като доказателство ПРЕДИ да създадем сесията
    // (timestamp идва от createdAt @default(now())). Доказва изричното съгласие
    // при евентуален спор за правото на отказ. legalBasis съвпада с текста,
    // който потребителят реално вижда и приема в UI (чл. 16(а) — услуга).
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId,
        action: "WITHDRAWAL_CONSENT",
        targetId: serverId,
        metadata: {
          withdrawalConsent: true,
          legalBasis: "Art. 16(a) Directive 2011/83/EU",
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
        // БЕЗ payment_method_types: така Checkout ползва dynamic payment methods —
        // методите се управляват от Stripe Dashboard (Settings → Payment methods)
        // и Stripe показва подходящите за държавата/валутата/сумата на клиента.
        // Хардкоднатият ["card"] изключваше локалните ЕС методи (SEPA Direct
        // Debit, iDEAL, Bancontact…), които вдигат конверсията в ЕС.
        // ВНИМАНИЕ (отложени методи): ако в Dashboard се включи метод с
        // ОТЛОЖЕНО потвърждение (SEPA Direct Debit, bank transfer), първата
        // сесия може да завърши с payment_status="unpaid"/"processing" —
        // guard-ът по-долу в checkout.session.completed вече не активира при
        // unpaid без subscription, а реалната активация идва през invoice.paid /
        // customer.subscription.updated. За пълно покритие трябва да се слушат
        // и checkout.session.async_payment_succeeded/_failed (днес НЕ са в
        // enabled_events на webhook-а — виж scripts/stripe-setup.sh).
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          // M1 — без trial_period_days, ако trialUsed===true (вече е ползван).
          ...(grantStripeTrial && { trial_period_days: trialDays }),
          metadata: { serverId, plan, interval },
        },
        // M3 — Stripe Tax: автоматично изчислява ДДС по местоназначение и
        // събира tax ID (reverse charge за B2B в ЕС). Изисква активни Tax
        // registrations в Stripe Dashboard (Settings → Tax). customer_update е
        // задължителен, защото automatic_tax има нужда да обнови адреса на
        // клиента от данните на Checkout.
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        // ЕС доказателство за местоположение (2 непротиворечиви елемента за
        // дигитални услуги) + пълен billing адрес на фактурата (чл. 114 ЗДДС).
        billing_address_collection: "required",
        success_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}?upgraded=true`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/${serverId}?canceled=true`,
        metadata: { serverId, plan, interval },
      },
      // L1 — Idempotency-Key със стабилен ключ за кратък прозорец: при ретрай на
      // същия POST (timeout/мрежа) Stripe връща СЪЩАТА сесия вместо да създаде
      // втора. Date.now() обезсмисляше идемпотентността (всеки ретрай = нов ключ).
      // Ключираме по serverId + UTC дата, така че опит за нов checkout на
      // следващия ден (напр. след изтекла сесия) пак минава.
      {
        idempotencyKey: `checkout-${serverId}-${plan}-${interval}-${new Date()
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
      // Конфигурацията от stripe-setup.sh включва subscription_update — това е
      // ЕДИНСТВЕНИЯТ път за смяна Premium↔White-label (create-checkout блокира
      // втори абонамент). Без env пада към default конфигурацията на акаунта.
      ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID && {
        configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
      }),
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

        // Agency (multi-server) checkout → activate the Agency, not a server.
        if (session.metadata?.kind === "agency" && session.metadata?.agencyId) {
          const agencyId = session.metadata.agencyId;
          const did = await runOnce(async (tx) => {
            await tx.agency.update({
              where: { id: agencyId },
              data: {
                active: true,
                stripeSubscriptionId: session.subscription || undefined,
                stripeStatus: "active",
                billingInterval: session.metadata.interval === "year" ? "year" : "month",
                pastDueSince: null,
              },
            });
          });
          if (did) {
            // Активацията прави покритите сървъри платени → синхронизирай
            // суровата isPremium колона (четци на суровата колона: bot config,
            // dashboard, panel функции). Извън runOnce — след commit-а.
            await syncAgencyServersPaidFlag(agencyId).catch(() => {});
            console.log(`✅ Agency ${agencyId} activated`);
          }
          break;
        }

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

        // Tier from checkout metadata (set at session creation). Fallback keeps
        // legacy single-price sessions working (→ whitelabel, matching the old
        // €9.99 bundle that included white-label).
        const plan = SERVER_PLANS.includes(session.metadata?.plan) ? session.metadata.plan : "whitelabel";
        const interval = session.metadata?.interval === "year" ? "year" : "month";

        const did = await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: serverId },
            data: {
              isPremium: true,
              plan,
              billingInterval: interval,
              planSource: "stripe",
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

        // Agency invoice → keep the agency active (recurring payment).
        const agency = await prisma.agency.findFirst({ where: { stripeCustomerId: String(customer) } });
        if (agency) {
          const did = await runOnce(async (tx) => {
            await tx.agency.update({ where: { id: agency.id }, data: { active: true, stripeStatus: "active", pastDueSince: null } });
          });
          // Recovery от past_due обратно в active → покритите сървъри пак стават
          // платени; синхронизирай суровата колона (симетрично на cancel пътя).
          if (did) await syncAgencyServersPaidFlag(agency.id).catch(() => {});
          break;
        }

        const server = await prisma.server.findFirst({
          where: { stripeCustomerId: String(customer) },
        });
        if (!server) break;

        // Целият ефект (payment log + affiliate комисионна) е в ЕДНА транзакция,
        // ключирана по event.id. Така ретрай на invoice.paid НЕ дублира нито
        // payment log-а, нито 20% комисионната за афилиейта.
        // Reflect the paid tier (a portal plan-change lands here as an invoice).
        const paidTier = planFromInvoice(invoice);
        // Тих drift guard: платена фактура, чиято цена не мапва към тарифа,
        // значи env price map е разминат с реалния Stripe акаунт — достъпът
        // пак се дава (isPremium), но етикетът на тарифата би застоял.
        if (!paidTier) {
          console.warn(`⚠️ invoice.paid за ${server.id}: цената не мапва към тарифа (провери STRIPE_PRICE_* env)`);
        }

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
              // Sync the tier if the invoice's price maps to a known plan.
              ...(paidTier && { plan: paidTier.plan, billingInterval: paidTier.interval, planSource: "stripe" }),
              // Немапната цена + текущ plan=free → безопасен под premium (не
              // разчитаме на grandfather fallback-а, който дава whitelabel).
              ...(!paidTier && server.plan === "free" && { plan: "premium", planSource: "stripe" }),
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
              // Комисионната е върху НЕТО (без ДДС). ДДС-то е държавно перо,
              // което само минава през нас — 20% върху брутото значеше да
              // плащаме афилиейта и върху данъка (при BG 20% inclusive:
              // 999 бруто → 167 ДДС; 20% от бруто = 199 вместо 166 → +20%
              // надплащане на всяка фактура).
              //
              // ПОЛЕ: в API 2026-06-24.dahlia скаларното `invoice.tax` е
              // ПРЕМАХНАТО (заедно с `total_tax_amounts`) — вж. stripe SDK
              // v22.3.0 CHANGELOG (Basil, „Remove support for … `tax`, and
              // `total_tax_amounts` on `Invoice`" / „Add support for
              // `total_taxes` on `CreditNote` and `Invoice`"). Заместителят
              // `total_taxes` е МАСИВ от { amount, tax_behavior, … } —
              // „aggregate tax information of all line items"
              // (docs.stripe.com/api/invoices/object). Затова сумираме.
              // Сумата важи и при двата tax_behavior: при `inclusive` (нашите
              // цени, вж. scripts/stripe-setup.sh) данъкът е ВЪТРЕ в сумата,
              // при `exclusive` е добавен отгоре — и в двата случая е част от
              // amount_paid, значи се вади.
              const taxTotal = Array.isArray(invoice.total_taxes)
                ? invoice.total_taxes.reduce((sum, t) => sum + (t?.amount ?? 0), 0)
                : 0;
              // Защита срещу отрицателна база: при частично плащане/приложен
              // кредитен баланс amount_paid може да е под пълния данък.
              const netPaid = Math.max(0, invoice.amount_paid - taxTotal);
              const commission = Math.floor(netPaid * 0.20); // 20% от нетото
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

        // Agency dunning: mark past_due (grace); unpaid/canceled later deactivates.
        const agency = await prisma.agency.findFirst({ where: { stripeCustomerId: String(invoice.customer) } });
        if (agency) {
          await runOnce(async (tx) => {
            await tx.agency.update({
              where: { id: agency.id },
              data: { stripeStatus: "past_due", ...(agency.pastDueSince ? {} : { pastDueSince: new Date() }) },
            });
          });
          break;
        }

        const server = await prisma.server.findFirst({
          where: { stripeCustomerId: String(invoice.customer) },
        });
        if (!server) break;

        const didFail = await runOnce(async (tx) => {
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

        // Dunning известие до собственика — СТРАНИЧЕН ефект, нарочно ИЗВЪН
        // runOnce транзакцията: DM-ът не е бизнес-ефект и не бива да проваля
        // или забавя webhook-а (Stripe брои не-2xx/>5s за провал и ретрайва).
        // Fire-and-forget: не чакаме резултата, dmUser никога не хвърля.
        //
        // Идемпотентност: пращаме САМО когато runOnce реално е приложил ефекта
        // (didFail === true), т.е. точно веднъж на event.id. Преддоставка на
        // същото събитие → без втори DM. Всеки НОВ неуспешен опит на Smart
        // Retries е ново събитие с нов id → ново, желано напомняне.
        //
        // Линкът е към нашето табло (auth-gated), НЕ към Stripe portal сесия:
        // portal URL-ът дава достъп до фактури/платежен метод БЕЗ логин, а DM
        // може да бъде препратен или видян от друг.
        if (didFail) {
          dmUser(server.ownerId, {
            title: "⚠️ Payment failed for your Supreme Bot subscription",
            description:
              `We couldn't charge your payment method for **${server.name}**.\n\n` +
              "Your Premium features stay active for now while we retry automatically, " +
              "but they will be switched off if the payment keeps failing.\n\n" +
              "Most common causes: expired card, insufficient funds, or a bank block " +
              "requiring 3-D Secure confirmation.\n\n" +
              `**[Update your payment method](${process.env.FRONTEND_URL}/dashboard/${server.id}/premium)** ` +
              "— open “Manage subscription” there to reach the secure Stripe billing portal.",
            color: 0xff6b6b,
            footer: { text: "Supreme Bot · You receive this because you own this Discord server." },
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;

        // Agency subscription ended → deactivate; member servers immediately
        // lose the tier via getServerTier (agency.active=false).
        const agency = await findAgencyForSub(sub);
        if (agency) {
          const did = await runOnce(async (tx) => {
            await tx.agency.update({ where: { id: agency.id }, data: { active: false, stripeStatus: "canceled", stripeSubscriptionId: null, pastDueSince: null } });
          });
          if (did) {
            // Край на агенцията → покритите сървъри губят платения tier.
            // Recompute: сървър със СОБСТВЕН план остава premium, иначе → free.
            await syncAgencyServersPaidFlag(agency.id).catch(() => {});
            console.log(`❌ Agency ${agency.id} subscription canceled`);
          }
          break;
        }

        // B4 — lookup с fallback по sub.metadata.serverId (out-of-order).
        const server = await findServerForSubscription(sub);
        if (!server) break;

        const did = await runOnce(async (tx) => {
          await tx.server.update({
            where: { id: server.id },
            data: {
              isPremium: false,
              plan: "free",
              billingInterval: null,
              // planSource също пада: иначе остатъчното "stripe" блокира
              // по-късен Discord re-grant (mutual-exclusion guard-а).
              planSource: null,
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

        // Agency subscription status change (active/past_due/unpaid/canceled).
        const agencyForSub = await findAgencyForSub(sub);
        if (agencyForSub) {
          const onA = ["active", "trialing"].includes(sub.status);
          const offA = ["unpaid", "incomplete_expired", "canceled", "paused"].includes(sub.status);
          const tierA = planFromSubscription(sub); // agency5 | agency10
          const newSeatLimit = onA && tierA && PLANS[tierA.plan] ? PLANS[tierA.plan].maxServers : null;
          let droppedIds = [];
          await runOnce(async (tx) => {
            await tx.agency.update({
              where: { id: agencyForSub.id },
              data: {
                ...(agencyForSub.stripeSubscriptionId ? {} : { stripeSubscriptionId: sub.id }),
                stripeStatus: sub.status,
                ...(onA && {
                  active: true, pastDueSince: null,
                  ...(tierA && PLANS[tierA.plan] && { plan: tierA.plan, seatLimit: newSeatLimit, billingInterval: tierA.interval }),
                }),
                ...(offA && { active: false }),
                ...(sub.status === "past_due" && !agencyForSub.pastDueSince && { pastDueSince: new Date() }),
              },
            });

            // Downgrade (e.g. agency10 → agency5): release seats over the new
            // limit so the customer can't keep provisioning more servers than
            // they now pay for. Drop the most-recently-created members first.
            if (newSeatLimit != null) {
              const members = await tx.server.findMany({
                where: { agencyId: agencyForSub.id },
                orderBy: { createdAt: "desc" },
                select: { id: true },
              });
              if (members.length > newSeatLimit) {
                droppedIds = members.slice(0, members.length - newSeatLimit).map((s) => s.id);
                await tx.server.updateMany({ where: { id: { in: droppedIds } }, data: { agencyId: null } });
              }
            }
          });

          // ПАРИЧЕН ИНВАРИАНТ: всеки от тези преходи мени ефективния tier на
          // покрити сървъри, а суровата isPremium колона НЕ се движи сама.
          // Без ресинк:
          //   • downgrade → разкачените задържат isPremium=true → безплатен
          //     white-label завинаги (red-team HIGH);
          //   • деактивация през updated (offA) → всички покрити остават
          //     „платени" без плащане.
          // syncServerPaidFlag recompute-ва от текущото състояние (agency.active
          // + собствен план), затова е коректен и за трите посоки.
          await syncAgencyServersPaidFlag(agencyForSub.id).catch(() => {});
          for (const id of droppedIds) await syncServerPaidFlag(id).catch(() => {});
          break;
        }

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
        // Reflect the current tier from the subscription's price (covers portal
        // upgrades/downgrades between Premium and White-label).
        const subTier = planFromSubscription(sub);
        // Тих drift guard (както при invoice.paid): активен абонамент без
        // разпознаваема цена → env map разминат; логваме за диагностика.
        if (["active", "trialing"].includes(sub.status) && !subTier) {
          console.warn(`⚠️ subscription.updated за ${server.id}: цената не мапва към тарифа (провери STRIPE_PRICE_* env)`);
        }

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
              // Keep the tier in sync whenever access is on and the price maps.
              ...(premiumOn && subTier && { plan: subTier.plan, billingInterval: subTier.interval, planSource: "stripe" }),
              // Немапната цена + plan=free → безопасен под premium (иначе
              // grandfather fallback-ът би дал whitelabel над-грант).
              ...(premiumOn && !subTier && server.plan === "free" && { plan: "premium", planSource: "stripe" }),
              // Отнемане на достъп при изчерпани ретраи / изтекъл incomplete.
              ...(premiumOff && { isPremium: false, plan: "free", billingInterval: null }),
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
          await tx.server.update({ where: { id: server.id }, data: { isPremium: false, plan: "free", billingInterval: null, stripeStatus: "disputed" } });
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
          await tx.server.update({ where: { id: server.id }, data: { isPremium: false, plan: "free", billingInterval: null, stripeStatus: "refunded" } });
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
      select: {
        isPremium: true, plan: true, billingInterval: true, premiumSince: true,
        stripeStatus: true, stripeSubscriptionId: true, trialEndsAt: true,
        // Agency seat: сурово server.plan остава "free" за покрит сървър —
        // без това Premium страницата предлагаше ПОКУПКА на сървър, който
        // вече е white-label през агенция (реален UX капан, открит при
        // изграждането на Agency UI).
        agencyId: true,
        agency: { select: { plan: true, active: true, ownerUserId: true } },
      },
    });

    if (!server) return res.status(404).json({ error: "Server not found" });

    const agencyCovered = !!(server.agencyId && server.agency?.active);
    const trialActive = !!(server.trialEndsAt && server.trialEndsAt > new Date());

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

    // Effective поглед: agency seat дава white-label tier на сървъра, дори
    // собствената му колона plan да е "free". Суровите полета остават за
    // обратна съвместимост; agency обектът никога не изтича навън целият
    // (само планът и дали викащият е собственикът на агенцията).
    const { agency, agencyId, ...raw } = server;
    res.json({
      ...raw,
      isPremium: raw.isPremium || agencyCovered || trialActive,
      isTrial: trialActive,
      effectivePlan: agencyCovered && (!raw.plan || raw.plan === "free") ? agency.plan : raw.plan,
      agencyCovered,
      agencyOwnedByMe: agencyCovered && agency.ownerUserId === req.user.id,
      subscriptionDetails,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
