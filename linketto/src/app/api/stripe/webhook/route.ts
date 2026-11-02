import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { PLANS, totalFeeCents, type PlanId } from '@/lib/plans';
import { payoutSeller } from '@/lib/payout';
import { deliveryEmailHtml, deliverySubject, sendEmail } from '@/lib/email';
import { referralRewardCents } from '@/lib/referral';
import type { Prisma } from '@prisma/client';
import {
  adoptionSkipReason,
  buildPlanPriceMap,
  classifyCheckout,
  decideCheckoutPlanGrant,
  decideFounderPayment,
  decidePlanSubscriptionCollection,
  decidePlanSubscriptionDispute,
  decideReferralReversal,
  decideSubscriptionSync,
  disputeHoldSubscriptionId,
  paymentReversal,
  planDisputeSteps,
  planDisputeWarning,
  runIsolated,
  selectAdoptableSubscription,
  shouldClearRevocationOnGrant,
  subscriptionGrantsPlan,
  subscriptionIdToResyncAfterGrant,
  type PaidPlanId,
  type PaymentReversal,
  type PlanUserSnapshot,
  type SubscriptionPlanId,
} from '@/lib/billing-sync';
import {
  firstPaymentIntentOfSession,
  listCustomerSubscriptions,
  loadPaymentState,
  loadSubscription,
  setSubscriptionCollectionPaused,
} from '@/lib/stripe-state';

type PriceMap = ReadonlyMap<string, SubscriptionPlanId>;

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

// Новите пътища (план/refund/спор/реферал) НЕ гълтат грешки: провал →
// false → 500 → Stripe ретрайва (решенията са идемпотентни по състояние).
async function attempt(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    console.error(
      `[stripe-webhook] ${label} failed:`,
      error instanceof Error ? error.message : 'unknown error',
    );
    return false;
  }
}

const PLAN_USER_SELECT = {
  id: true,
  plan: true,
  stripeCustomerId: true,
  planSubscriptionId: true,
  planPaymentIntentId: true,
  planRevokedReason: true,
  planDisputedPaymentIntentId: true,
} as const;

type PlanUserRow = {
  id: string;
  plan: PlanId;
  stripeCustomerId: string | null;
  planSubscriptionId: string | null;
  planPaymentIntentId: string | null;
  planRevokedReason: string | null;
  planDisputedPaymentIntentId: string | null;
};

function toPlanUser(row: PlanUserRow | null): PlanUserSnapshot | null {
  if (!row) return null;
  const reason = row.planRevokedReason;
  return {
    ...row,
    planRevokedReason: reason === 'refund' || reason === 'dispute' ? reason : null,
  };
}

// Начислява бонус на реферера, когато поканеният си купи платен план.
// Идемпотентно: Referral е уникален по referredUserId (един бонус на поканен)
// и по stripePaymentIntentId (плащането, което го е породило — за сторно).
async function rewardReferrer(
  referredUserId: string,
  planId: PlanId,
  paidCents: number,
  paymentIntentId: string,
): Promise<void> {
  // Бонусът е процент от реалната сума, платена от поканения (по-дълъг
  // период → по-голямо плащане → по-голям бонус за реферера).
  const rewardCents = referralRewardCents(paidCents);
  if (rewardCents <= 0) return;
  const user = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { referredById: true },
  });
  if (!user?.referredById) return;
  const existing = await prisma.referral.findUnique({
    where: { referredUserId },
    select: { id: true },
  });
  if (existing) return; // вече наградено (вкл. сторнирано — O-4: без нова награда)
  try {
    await prisma.$transaction([
      prisma.referral.create({
        data: {
          referrerId: user.referredById,
          referredUserId,
          plan: planId,
          rewardCents,
          stripePaymentIntentId: paymentIntentId,
        },
      }),
      prisma.user.update({
        where: { id: user.referredById },
        data: { referralCreditCents: { increment: rewardCents } },
      }),
    ]);
  } catch (error) {
    // Паралелна доставка вече е наградила → unique; всичко друго → 500.
    if (isUniqueViolation(error)) return;
    throw error;
  }
}

// ── Планове (billing-sync): решенията са чисти, тук е само прилагането ──

// Предоставяне от checkout: живото състояние (плащане/абонамент) решава,
// не payload-ът — закъсняло или повторено събитие не връща отнет план.
async function grantPlanFromCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  userId: string,
  plan: PaidPlanId,
  priceMap: PriceMap,
): Promise<void> {
  const user = toPlanUser(
    await prisma.user.findUnique({ where: { id: userId }, select: PLAN_USER_SELECT }),
  );
  if (!user) {
    console.warn(`[stripe-webhook] plan checkout ${session.id}: няма потребител`);
    return;
  }
  const paymentIntentId = session.mode === 'payment' ? idOf(session.payment_intent) : null;
  const subscriptionId = session.mode === 'subscription' ? idOf(session.subscription) : null;
  let reversal = null;
  if (paymentIntentId && session.payment_status === 'paid') {
    const state = await loadPaymentState(stripe, paymentIntentId);
    reversal = paymentReversal(state.charge, state.disputeStatuses);
  }
  let subscriptionStatus: string | null = null;
  if (subscriptionId && session.payment_status !== 'unpaid') {
    subscriptionStatus = (await loadSubscription(stripe, subscriptionId)).snapshot.status;
  }
  const decision = decideCheckoutPlanGrant({
    plan,
    mode: session.mode,
    paymentStatus: session.payment_status,
    paymentIntentId,
    subscriptionId,
    reversal,
    subscriptionStatus,
    currentPlan: user.plan,
    holdSubscriptionId: disputeHoldSubscriptionId(user),
  });
  if (decision.action === 'skip') {
    console.info(`[stripe-webhook] plan checkout ${session.id}: skip ${decision.reason}`);
    return;
  }
  const link =
    'paymentIntentId' in decision.link
      ? { planPaymentIntentId: decision.link.paymentIntentId }
      : { planSubscriptionId: decision.link.subscriptionId };
  // CAS: абонаментен план не презаписва FOUNDER (и при състезание).
  const where: Prisma.UserWhereInput =
    decision.plan === 'FOUNDER'
      ? { id: user.id }
      : { id: user.id, plan: { not: 'FOUNDER' } };
  // F13: отнет по спор FOUNDER пази причината и при нов абонаментен план,
  // за да стигне спечеленият FOUNDER спор до flag (F8).
  const clearRevocation = shouldClearRevocationOnGrant(user, decision.plan);
  const updated = await prisma.user.updateMany({
    where,
    data: {
      plan: decision.plan,
      stripeCustomerId: idOf(session.customer) ?? undefined,
      ...link,
      ...(clearRevocation
        ? { planRevokedAt: null, planRevokedReason: null, planDisputedPaymentIntentId: null }
        : {}),
    },
  });
  if (updated.count === 0) return;
  // G10: grant е по снимка от момента на четене; ресинхронизацията по живия
  // абонамент затваря състезанието grant↔deleted (закъснял grant след отмяна).
  const resyncId = subscriptionIdToResyncAfterGrant(decision);
  if (resyncId) await syncPlanSubscription(stripe, resyncId, priceMap);
  // Реферална награда: веднъж на поканен, вързана към първото плащане.
  const firstPaymentIntentId = await firstPaymentIntentOfSession(stripe, session);
  if (firstPaymentIntentId) {
    await rewardReferrer(user.id, decision.plan, session.amount_total ?? 0, firstPaymentIntentId);
  }
}

// Абонамент → User.plan (D2), level-triggered: винаги по живия абонамент.
async function syncPlanSubscription(
  stripe: Stripe,
  subscriptionId: string,
  priceMap: PriceMap,
): Promise<void> {
  const live = await loadSubscription(stripe, subscriptionId);
  let snapshot = live.snapshot;
  let row: PlanUserRow | null = await prisma.user.findUnique({
    where: { planSubscriptionId: subscriptionId },
    select: PLAN_USER_SELECT,
  });
  if (!row && snapshot.customerId) {
    // Заварен клиент (преди миграцията): осиновяване по customer, само ако
    // още няма вързан абонамент. Мъртъв абонамент не се осиновява, ако има жив.
    row = await prisma.user.findFirst({
      where: { stripeCustomerId: snapshot.customerId, planSubscriptionId: null },
      select: PLAN_USER_SELECT,
    });
    if (row && !subscriptionGrantsPlan(snapshot.status)) {
      const all = await listCustomerSubscriptions(stripe, snapshot.customerId);
      snapshot = selectAdoptableSubscription(snapshot, all, priceMap);
    }
  }
  const user = toPlanUser(row);
  const decision = decideSubscriptionSync(user, snapshot, priceMap);
  const skip = adoptionSkipReason(user, snapshot, priceMap);
  if (skip && user) {
    // L4: заварен абонамент не е осиновен — видимо за админа (backfill/ръчно).
    console.warn(
      `[stripe-webhook] абонамент ${snapshot.id} не е осиновен за потребител ${user.id}: ${skip}`,
    );
  }
  if (decision.action === 'noop') {
    if (decision.reason === 'unknown-price') {
      console.error(
        `[stripe-webhook] абонамент ${snapshot.id}: цена извън STRIPE_PRICE_* — планът не е сменен`,
      );
    }
    return;
  }
  if (!row) return;
  const conditions: Prisma.UserWhereInput[] = [
    { OR: [{ planSubscriptionId: snapshot.id }, { planSubscriptionId: null }] },
  ];
  if (decision.plan !== 'FREE') {
    // O-1: платен план не се връща, докато трае спор ПО АБОНАМЕНТА (и при
    // състезание). Същият дискриминатор като isSubscriptionDispute: запазен
    // FOUNDER-спор (F13: FOUNDER PI зададен, без оспорен PI) не блокира.
    conditions.push({
      OR: [
        { planRevokedReason: null },
        { planRevokedReason: { not: 'dispute' } },
        { planDisputedPaymentIntentId: null, planPaymentIntentId: { not: null } },
      ],
    });
  }
  await prisma.user.updateMany({
    where: { id: row.id, plan: { not: 'FOUNDER' }, AND: conditions },
    data: {
      plan: decision.plan,
      ...(decision.adoptSubscriptionId
        ? { planSubscriptionId: decision.adoptSubscriptionId }
        : {}),
    },
  });
}

// Refund/спор на плащане → FOUNDER, плановия абонамент и реферала (D1, D3,
// O-1). Решението идва от живото състояние, затова е общо за всички
// charge.refunded / charge.dispute.* събития и е идемпотентно. Трите части са
// отделни опити (D11): провал в едната не спира другите, а първата грешка
// води до 500 и Stripe ретрайва (повторението е безвредно — решенията са CAS).
async function syncPaymentReversal(
  stripe: Stripe,
  paymentIntentId: string,
  eventId: string,
  priceMap: PriceMap,
): Promise<void> {
  const state = await loadPaymentState(stripe, paymentIntentId);
  const reversal = paymentReversal(state.charge, state.disputeStatuses);
  const now = new Date();
  const subscriptionId = state.subscriptionId;
  await runIsolated([
    () => syncFounderReversal(paymentIntentId, reversal, now),
    ...(subscriptionId
      ? [
          () =>
            syncSubscriptionDispute(
              stripe,
              subscriptionId,
              paymentIntentId,
              reversal,
              eventId,
              now,
              priceMap,
            ),
        ]
      : []),
    () => syncReferralReversal(paymentIntentId, reversal, now),
  ]);
}

async function syncFounderReversal(
  paymentIntentId: string,
  reversal: PaymentReversal,
  now: Date,
): Promise<void> {
  // FOUNDER: само по записания PaymentIntent на самото FOUNDER плащане.
  const founderRow = await prisma.user.findUnique({
    where: { planPaymentIntentId: paymentIntentId },
    select: PLAN_USER_SELECT,
  });
  const founder = decideFounderPayment(toPlanUser(founderRow), paymentIntentId, reversal);
  if (founderRow && founder.action === 'revoke') {
    await prisma.user.updateMany({
      where: { id: founderRow.id, plan: 'FOUNDER', planPaymentIntentId: paymentIntentId },
      data: { plan: 'FREE', planRevokedAt: now, planRevokedReason: founder.reason },
    });
  } else if (founderRow && founder.action === 'restore') {
    await prisma.user.updateMany({
      where: {
        id: founderRow.id,
        plan: 'FREE',
        planPaymentIntentId: paymentIntentId,
        planRevokedReason: 'dispute',
        // F14 и при състезание: не и докато тече спор по абонамента.
        planDisputedPaymentIntentId: null,
      },
      data: { plan: 'FOUNDER', planRevokedAt: null, planRevokedReason: null },
    });
  } else if (founderRow && founder.action === 'flag') {
    console.warn(
      `[stripe-webhook] FOUNDER плащането на потребител ${founderRow.id} вече не е оспорено, но планът е сменен или тече спор по абонамента — ръчно решение`,
    );
  }
}

// Плановият абонамент (O-1, D10, D11): пауза на таксуването + FREE при спор;
// възобновяване + план по живия статус при won по СЪЩОТО оспорено плащане.
// Ред: pause → първо БД, после Stripe; resume → първо Stripe, после БД.
// D12: необърнато плащане винаги завършва със синхронизация по живия абонамент.
async function syncSubscriptionDispute(
  stripe: Stripe,
  subscriptionId: string,
  paymentIntentId: string,
  reversal: PaymentReversal,
  eventId: string,
  now: Date,
  priceMap: PriceMap,
): Promise<void> {
  const subRow = await prisma.user.findUnique({
    where: { planSubscriptionId: subscriptionId },
    select: PLAN_USER_SELECT,
  });
  const subUser = toPlanUser(subRow);
  if (!subRow || !subUser) {
    // Няма вързан потребител: level-triggered sync (вкл. осиновяване на заварен).
    if (!reversal.reversed) await syncPlanSubscription(stripe, subscriptionId, priceMap);
    return;
  }
  const live = await loadSubscription(stripe, subscriptionId);
  const collection = decidePlanSubscriptionCollection(
    subUser,
    subscriptionId,
    reversal,
    live.snapshot.status,
    live.collectionPaused,
    paymentIntentId,
  );
  const dispute = decidePlanSubscriptionDispute(subUser, subscriptionId, reversal, paymentIntentId);
  const warning = planDisputeWarning(subUser, paymentIntentId, reversal, dispute);
  if (warning) {
    // R4/R5: ръчно наблюдение (id-та, без лични данни).
    console.warn(
      `[stripe-webhook] спор по абонамент ${subscriptionId}, потребител ${subRow.id}, плащане ${paymentIntentId}: ${warning}`,
    );
  }
  for (const step of planDisputeSteps(collection, dispute, reversal)) {
    if (step === 'db-revoke') {
      await prisma.user.updateMany({
        where: { id: subRow.id, planSubscriptionId: subscriptionId, plan: { not: 'FOUNDER' } },
        data: {
          plan: 'FREE',
          planRevokedAt: now,
          planRevokedReason: 'dispute',
          planDisputedPaymentIntentId: paymentIntentId,
        },
      });
    } else if (step === 'stripe-pause' || step === 'stripe-resume') {
      await setSubscriptionCollectionPaused(
        stripe,
        subscriptionId,
        step === 'stripe-pause',
        `plan-collection-${step}-${subscriptionId}-${eventId}`,
      );
    } else if (step === 'resync') {
      await syncPlanSubscription(stripe, subscriptionId, priceMap);
    } else {
      // db-restore: само за записания оспорен PI (или заварен ред без него).
      // Планът се връща от следващата стъпка 'resync'.
      await prisma.user.updateMany({
        where: {
          id: subRow.id,
          planSubscriptionId: subscriptionId,
          planRevokedReason: 'dispute',
          OR: [
            { planDisputedPaymentIntentId: null },
            { planDisputedPaymentIntentId: paymentIntentId },
          ],
        },
        data: { planRevokedAt: null, planRevokedReason: null, planDisputedPaymentIntentId: null },
      });
    }
  }
}

async function syncReferralReversal(
  paymentIntentId: string,
  reversal: PaymentReversal,
  now: Date,
): Promise<void> {
  // Реферал: сторно/възстановяване на наградата, породена от това плащане.
  const referral = await prisma.referral.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!referral) return;
  const payouts = await prisma.referralPayout.findMany({
    where: { userId: referral.referrerId },
    select: { id: true, requestedAt: true, status: true },
  });
  const decision = decideReferralReversal(
    {
      id: referral.id,
      referrerId: referral.referrerId,
      rewardCents: referral.rewardCents,
      createdAt: referral.createdAt,
      stripePaymentIntentId: referral.stripePaymentIntentId,
      reversedAt: referral.reversedAt,
      reversalReason:
        referral.reversalReason === 'refund' || referral.reversalReason === 'dispute'
          ? referral.reversalReason
          : null,
    },
    paymentIntentId,
    reversal,
    payouts.map((p) => ({
      id: p.id,
      requestedAt: p.requestedAt,
      status: p.status === 'paid' ? ('paid' as const) : ('pending' as const),
    })),
  );
  if (decision.action === 'reverse') {
    // CAS по reversedAt + промяната на баланса в ЕДНА транзакция.
    await prisma.$transaction(async (tx) => {
      const marked = await tx.referral.updateMany({
        where: { id: referral.id, reversedAt: null },
        data: {
          reversedAt: now,
          reversalReason: decision.reason,
          clawbackPayoutId: decision.clawbackPayoutId,
        },
      });
      if (marked.count !== 1) return;
      await tx.user.update({
        where: { id: referral.referrerId },
        data: { referralCreditCents: { decrement: decision.decrementCents } },
      });
    });
    if (decision.clawbackPayoutId) {
      console.warn(
        `[stripe-webhook] сторниран реферал ${referral.id}: наградата е в payout ${decision.clawbackPayoutId} (${decision.clawbackPayoutStatus}) — балансът е дълг`,
      );
    }
  } else if (decision.action === 'restore') {
    await prisma.$transaction(async (tx) => {
      const restored = await tx.referral.updateMany({
        where: { id: referral.id, reversalReason: 'dispute', reversedAt: { not: null } },
        data: { reversedAt: null, reversalReason: null, clawbackPayoutId: null },
      });
      if (restored.count !== 1) return;
      await tx.user.update({
        where: { id: referral.referrerId },
        data: { referralCreditCents: { increment: decision.incrementCents } },
      });
    });
  }
}

// PaymentIntent на спор; при липса — през charge-а му.
async function disputePaymentIntent(
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const direct = idOf(dispute.payment_intent);
  if (direct) return direct;
  const chargeId = idOf(dispute.charge);
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  return idOf(charge.payment_intent);
}

// Дава/подновява право на достъп на купувача (курс/членство). Идемпотентно
// по (productId, email). Членство → пази stripeSubscriptionId за отнемане.
async function grantEntitlement(
  productId: string,
  profileId: string,
  email: string,
  subscriptionId: string | null,
): Promise<void> {
  await prisma.entitlement
    .upsert({
      where: { productId_email: { productId, email } },
      create: {
        productId,
        profileId,
        email,
        active: true,
        stripeSubscriptionId: subscriptionId,
      },
      update: {
        active: true,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      },
    })
    .catch(() => undefined);
}

// Отнема еднократните (COURSE) права по покупките на даден PaymentIntent —
// при refund/chargeback купувачът връща парите и губи достъпа. Членствата
// (stripeSubscriptionId) се управляват от subscription.* събитията.
async function revokeOneOffEntitlements(paymentIntentId: string): Promise<void> {
  const purchases = await prisma.purchase.findMany({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { productId: true, buyerEmail: true },
  });
  for (const purchase of purchases) {
    if (!purchase.buyerEmail) continue;
    await prisma.entitlement
      .updateMany({
        where: {
          productId: purchase.productId,
          email: purchase.buyerEmail,
          stripeSubscriptionId: null,
        },
        data: { active: false },
      })
      .catch(() => undefined);
  }
}

// Доставка на купеното по имейл — от webhook-а, независимо от success_url
// redirect-а (затворен таб не бива да значи „платил без достъп“).
// Идемпотентно: праща само ако още не е доставено.
async function fulfilProduct(purchaseId: string): Promise<void> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      product: {
        include: { translations: true, profile: { select: { slug: true } } },
      },
    },
  });
  // Само DIGITAL продукти получават имейл с таен линк; COURSE/MEMBERSHIP
  // дават достъп през /learn (Entitlement), не през линк по имейл.
  if (
    !purchase ||
    purchase.deliveredAt ||
    !purchase.buyerEmail ||
    !purchase.product.deliveryUrl
  ) {
    return;
  }
  const deliveryUrl = purchase.product.deliveryUrl;
  const locale = purchase.locale ?? undefined;
  // Заглавие на езика на купувача (fallback към първия наличен превод).
  const title =
    (locale &&
      purchase.product.translations.find((t) => t.locale === locale)?.title) ||
    purchase.product.translations[0]?.title ||
    'Product';
  // Линк към печатната разписка (ако имаме публичен адрес).
  const base = process.env.PUBLIC_BASE_URL;
  const receiptUrl = base
    ? `${base}/u/${purchase.product.profile.slug}/receipt?session=${encodeURIComponent(purchase.stripeSessionId)}`
    : undefined;
  const sent = await sendEmail({
    to: purchase.buyerEmail,
    subject: deliverySubject(title, locale),
    html: deliveryEmailHtml({
      productTitle: title,
      deliveryUrl,
      amountCents: purchase.amountCents,
      locale,
      receiptUrl,
    }),
  });
  if (sent) {
    await prisma.purchase
      .update({ where: { id: purchaseId }, data: { deliveredAt: new Date() } })
      .catch(() => undefined);
  }
}

// Правата се дават САМО тук, след проверка на подписа — никога през
// success_url redirect-а, на който не може да се вярва.
export async function POST(request: Request): Promise<NextResponse> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  // false → отговаряме 500 и Stripe ретрайва събитието (обработчиците са
  // идемпотентни) — така транзиентно провален превод към продавача или
  // провален нов път (план/refund/спор/реферал) се лекува.
  let ok = true;
  // Карта цена → план; грешна конфигурация хвърля → 500 (видимо, не тихо).
  const priceMap = (): PriceMap => buildPlanPriceMap(process.env);

  switch (event.type) {
    // И двете събития: completed се излъчва и при delayed-notification методи
    // (SEPA/iDEAL…) с payment_status !== 'paid'; правата и записът се дават
    // само след потвърдено плащане, а забавените плащания идват през
    // async_payment_succeeded.
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      const checkout = classifyCheckout(session.metadata);
      if (checkout.kind === 'plan') {
        // payment_status се проверява в decideCheckoutPlanGrant (subscription
        // приема и no_payment_required само при жив active/trialing).
        ok =
          (await attempt('plan checkout', () =>
            grantPlanFromCheckout(stripe, session, checkout.userId, checkout.plan, priceMap()),
          )) && ok;
        break;
      }
      if (checkout.kind !== 'shop') {
        if (checkout.reason !== 'no-metadata') {
          console.warn(`[stripe-webhook] checkout ${session.id}: ignore ${checkout.reason}`);
        }
        break;
      }
      if (session.payment_status !== 'paid') break;
      // Продажба на дигитален продукт (магазина).
      const { productId, profileId } = checkout;
      const buyerEmail = session.customer_details?.email ?? null;
      if (productId && profileId && session.mode === 'subscription') {
        // Членство: право на достъп, докато Stripe абонаментът е активен.
        const subId =
          typeof session.subscription === 'string' ? session.subscription : null;
        if (buyerEmail) {
          await grantEntitlement(productId, profileId, buyerEmail, subId);
        }
      } else if (productId && profileId) {
        // Еднократно (DIGITAL/COURSE): записваме покупката идемпотентно.
        // ДДС слой (TAX.md): Stripe Tax е сметнал ДДС по държавата на
        // купувача (0 без данъчния слой); комисионата се смята върху
        // НЕТОТО — ДДС частта е задължение на платформата, не приход.
        const amountTotal = session.amount_total ?? 0;
        const vatCents = session.total_details?.amount_tax ?? 0;
        const netCents = Math.max(amountTotal - vatCents, 0);
        const metaPlan = (session.metadata?.plan ?? '') as PlanId;
        const feePlan: PlanId = PLANS[metaPlan] ? metaPlan : 'FREE';
        const feeCents = Math.max(
          Math.min(totalFeeCents(netCents, feePlan), netCents - 1),
          0,
        );
        const existing = await prisma.purchase.findUnique({
          where: { stripeSessionId: session.id },
          select: { id: true },
        });
        const purchase = await prisma.purchase
          .upsert({
            where: { stripeSessionId: session.id },
            create: {
              productId,
              profileId,
              stripeSessionId: session.id,
              stripePaymentIntentId:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : null,
              amountCents: amountTotal,
              feeCents,
              vatAmountCents: vatCents,
              netAmountCents: netCents,
              buyerCountry: session.customer_details?.address?.country ?? null,
              buyerEmail,
              locale: session.metadata?.locale ?? null,
              couponCode: session.metadata?.couponCode || null,
            },
            update: {},
          })
          .catch(() => null);
        // Делът на продавача — при ВСЯКА доставка (не само първата):
        // вътрешните гардове пазят от двоен превод, а извикването на всеки
        // ретрай лекува транзиентните провали (виж payoutSeller).
        if (purchase) {
          ok = (await payoutSeller(purchase.id)) && ok;
        }
        // Промо код: увеличаваме броя ползвания веднъж (само при първи запис),
        // атомарно и само ако е под лимита (пази брояча от преразходване).
        const couponId = session.metadata?.couponId;
        if (!existing && purchase && couponId) {
          await prisma
            .$executeRaw`UPDATE "Coupon" SET "timesRedeemed" = "timesRedeemed" + 1 WHERE "id" = ${couponId} AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")`
            .catch(() => undefined);
        }
        // Курс → доживотно право на достъп до уроците.
        if (session.metadata?.type === 'COURSE' && buyerEmail) {
          await grantEntitlement(productId, profileId, buyerEmail, null);
        }
        // Доставяме купеното по имейл (идемпотентно) — само DIGITAL.
        if (purchase) await fulfilProduct(purchase.id);
      }
      break;
    }
    case 'charge.refunded': {
      // Върнати пари → маркираме покупката (за отчетите и повторния достъп).
      const charge = event.data.object;
      const pi =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      // Действаме само при ПЪЛЕН refund — частичен (напр. жест от
      // Dashboard) не бива да отнема целия достъп, да маркира покупката
      // като върната, нито да прибира дела на продавача.
      if (pi && charge.amount_refunded === charge.amount) {
        await prisma.purchase
          .updateMany({
            where: { stripePaymentIntentId: pi },
            data: { refundedAt: new Date() },
          })
          .catch(() => undefined);
        // Върнати пари → връща се и достъпът до курса.
        await revokeOneOffEntitlements(pi).catch(() => undefined);
        // Separate charges & transfers: връщаме и дела на продавача
        // (пълен reversal — идемпотентен: повторният опит върху върнат
        // превод се проваля тихо).
        const refundedPurchases = await prisma.purchase.findMany({
          where: { stripePaymentIntentId: pi },
          select: { id: true, stripeTransferId: true },
        });
        for (const p of refundedPurchases) {
          if (!p.stripeTransferId) continue;
          await stripe.transfers
            .createReversal(
              p.stripeTransferId,
              {},
              { idempotencyKey: `reversal-${p.id}` },
            )
            .catch(() => undefined);
        }
      }
      // План/реферал по живото състояние (вкл. натрупани частични refund-и).
      if (pi) {
        ok =
          (await attempt('payment reversal', () =>
            syncPaymentReversal(stripe, pi, event.id, priceMap()),
          )) && ok;
      }
      break;
    }
    case 'charge.dispute.created': {
      // Спор/chargeback: маркираме за преглед (при destination charges
      // платформата носи отговорността — възстановяването е ръчно решение).
      const dispute = event.data.object;
      const pi =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
      if (pi) {
        await prisma.purchase
          .updateMany({
            where: { stripePaymentIntentId: pi },
            data: { disputedAt: new Date() },
          })
          .catch(() => undefined);
        // Chargeback → спираме достъпа веднага (при спечелен спор може да
        // се възстанови ръчно; загубата иначе е за продавача/платформата).
        await revokeOneOffEntitlements(pi).catch(() => undefined);
      }
      ok =
        (await attempt('dispute reversal', async () => {
          const disputedPi = await disputePaymentIntent(stripe, dispute);
          if (disputedPi) {
            await syncPaymentReversal(stripe, disputedPi, event.id, priceMap());
          }
        })) && ok;
      break;
    }
    // Жизненият цикъл на спора (won/lost/funds_*) → само план/реферал по
    // живото състояние; логиката на магазина не се пипа.
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated': {
      const dispute = event.data.object;
      ok =
        (await attempt('dispute reversal', async () => {
          const disputedPi = await disputePaymentIntent(stripe, dispute);
          if (disputedPi) {
            await syncPaymentReversal(stripe, disputedPi, event.id, priceMap());
          }
        })) && ok;
      break;
    }
    case 'account.application.deauthorized': {
      // Продавач разкачи Stripe акаунта → спираме магазина му.
      const application = event.data.object;
      const accountId =
        typeof event.account === 'string' ? event.account : null;
      void application;
      if (accountId) {
        await prisma.user
          .updateMany({
            where: { stripeAccountId: accountId },
            data: { stripeChargesEnabled: false },
          })
          .catch(() => undefined);
      }
      break;
    }
    case 'account.updated': {
      // Connect onboarding: отключваме магазина чак когато Stripe
      // потвърди, че акаунтът може да приема плащания.
      const account = event.data.object;
      await prisma.user.updateMany({
        where: { stripeAccountId: account.id },
        data: { stripeChargesEnabled: account.charges_enabled === true },
      });
      break;
    }
    case 'customer.subscription.updated': {
      // Членство (магазина): синхронизираме достъпа със статуса на абонамента.
      // Покрива ВСИЧКИ изходи на dunning (past_due/unpaid/paused/canceled),
      // независимо от Dashboard настройката — затваря тихия теч на достъп.
      const sub = event.data.object;
      const active = sub.status === 'active' || sub.status === 'trialing';
      const periodEnd = (sub as { current_period_end?: number })
        .current_period_end;
      await prisma.entitlement
        .updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            active,
            expiresAt:
              active && periodEnd ? new Date(periodEnd * 1000) : undefined,
          },
        })
        .catch(() => undefined);
      // Плановият абонамент (Portal смяна, dunning изходи) → User.plan.
      ok =
        (await attempt('plan subscription sync', () =>
          syncPlanSubscription(stripe, sub.id, priceMap()),
        )) && ok;
      break;
    }
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const sub = event.data.object;
      ok =
        (await attempt('plan subscription sync', () =>
          syncPlanSubscription(stripe, sub.id, priceMap()),
        )) && ok;
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      // Сваля се само потребителят, вързан към ТОЗИ абонамент (не по
      // customer); Founder не се пипа (решава decideSubscriptionSync).
      ok =
        (await attempt('plan subscription sync', () =>
          syncPlanSubscription(stripe, subscription.id, priceMap()),
        )) && ok;
      // Членство към създател (магазина): отнемаме достъпа по абонамента.
      await prisma.entitlement
        .updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { active: false },
        })
        .catch(() => undefined);
      break;
    }
    default:
      break;
  }

  return NextResponse.json(
    { received: true },
    { status: ok ? 200 : 500 },
  );
}
