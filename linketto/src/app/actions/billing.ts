'use server';

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getStripe, stripeTaxEnabled } from '@/lib/stripe';
import {
  BILLING_INTERVALS,
  PLANS,
  stripePriceEnvFor,
  type BillingIntervalId,
  type PlanId,
} from '@/lib/plans';
import { isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { paymentReversal } from '@/lib/billing-sync';
import { loadPaymentState } from '@/lib/stripe-state';
import { createPlanStripePorts } from '@/lib/plan-checkout-stripe';
import {
  customerClaimWhere,
  planCheckoutSessionParams,
  preparePlanCheckout,
  type PlanCheckoutPorts,
} from '@/lib/plan-checkout';
import type Stripe from 'stripe';

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

// Адаптери на PlanCheckoutPorts (чистата логика: lib/plan-checkout.ts;
// Stripe частта: lib/plan-checkout-stripe.ts).
function planCheckoutPorts(stripe: Stripe): PlanCheckoutPorts {
  return {
    ...createPlanStripePorts(stripe),
    async claimCustomer(userId, customerId) {
      // CAS: записва само ако още е null; загубена надпревара → записания.
      await prisma.user.updateMany({
        where: customerClaimWhere(userId),
        data: { stripeCustomerId: customerId },
      });
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true },
      });
      if (!row?.stripeCustomerId) throw new Error('stripeCustomerId not stored');
      return row.stripeCustomerId;
    },
    async isPaymentReversed(paymentIntentId) {
      const state = await loadPaymentState(stripe, paymentIntentId);
      return paymentReversal(state.charge, state.disputeStatuses) !== null;
    },
  };
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);

  const planId = String(formData.get('plan') ?? '') as PlanId;
  const plan = PLANS[planId];
  if (!plan || plan.id === 'FREE') {
    redirect(`/${uiLocale}/dashboard?error=generic`);
  }
  const paidPlanId = plan.id;

  // Сървърен гейт (UI-то също крие бутоните): нов checkout само от FREE —
  // иначе втори активен абонамент върху същия customer (двойно таксуване).
  // Смяната на план минава през Customer Portal, не през нов Checkout.
  if (user.plan !== 'FREE') {
    redirect(`/${uiLocale}/dashboard?error=plan`);
  }

  // Founder е еднократен (без период); абонаментните планове ползват
  // избрания период → съответния Stripe Price ID от env.
  let priceEnv: string | null;
  if (plan.oneTime) {
    priceEnv = plan.stripePriceEnv;
  } else {
    const rawInterval = String(formData.get('interval') ?? 'monthly');
    const interval = BILLING_INTERVALS.find((i) => i.id === rawInterval)
      ? (rawInterval as BillingIntervalId)
      : 'monthly';
    priceEnv = stripePriceEnvFor(planId, interval);
  }
  const priceId = priceEnv ? process.env[priceEnv] : undefined;
  const stripe = getStripe();
  if (!stripe || !priceId) {
    redirect(`/${uiLocale}/dashboard?error=stripe`);
  }

  // Един Stripe Customer на потребител + живото състояние в Stripe (базата
  // може още да казва FREE, ако webhook-ът не е дошъл): втори абонамент или
  // втори „Основател“ → error=plan; другите отворени plan сесии се изтичат.
  let prepared: Awaited<ReturnType<typeof preparePlanCheckout>>;
  try {
    prepared = await preparePlanCheckout(
      {
        id: user.id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
        planPaymentIntentId: user.planPaymentIntentId,
      },
      planCheckoutPorts(stripe),
    );
  } catch (error) {
    console.error(
      '[billing] plan checkout prepare failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    redirect(`/${uiLocale}/dashboard?error=stripe`);
  }
  if (!prepared.ok) {
    redirect(`/${uiLocale}/dashboard?error=plan`);
  }

  const session = await stripe.checkout.sessions.create(
    planCheckoutSessionParams({
      customerId: prepared.customerId,
      userId: user.id,
      plan: paidPlanId,
      priceId,
      oneTime: Boolean(plan.oneTime),
      taxEnabled: stripeTaxEnabled(),
      successUrl: `${baseUrl()}/${uiLocale}/dashboard?upgraded=1`,
      cancelUrl: `${baseUrl()}/${uiLocale}/dashboard`,
    }),
  );
  redirect(session.url ?? `/${uiLocale}/dashboard?error=stripe`);
}

// Stripe Customer Portal: самостоятелно управление на абонамента (смяна на
// план/период, начин на плащане, фактури, ОТМЯНА — изискване на Дир. 2011/83
// за лесен отказ от авто-подновяване). Порталът се конфигурира еднократно в
// Stripe Dashboard → Settings → Billing → Customer portal.
export async function openBillingPortalAction(
  formData: FormData,
): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const stripe = getStripe();
  if (!stripe || !user.stripeCustomerId) {
    redirect(`/${uiLocale}/dashboard?error=stripe`);
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl()}/${uiLocale}/dashboard`,
  });
  redirect(session.url);
}
