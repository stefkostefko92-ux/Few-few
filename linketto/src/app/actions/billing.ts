'use server';

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import {
  BILLING_INTERVALS,
  PLANS,
  stripePriceEnvFor,
  type BillingIntervalId,
  type PlanId,
} from '@/lib/plans';
import { isLocale } from '@/i18n/locales';

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);

  const planId = String(formData.get('plan') ?? '') as PlanId;
  const plan = PLANS[planId];
  if (!plan) {
    redirect(`/${uiLocale}/dashboard?error=generic`);
  }

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

  const session = await stripe.checkout.sessions.create({
    mode: plan.oneTime ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    // Планът се дава само през проверения webhook, не през redirect-а.
    metadata: { userId: user.id, plan: plan.id },
    locale: 'auto',
    success_url: `${baseUrl()}/${uiLocale}/dashboard?upgraded=1`,
    cancel_url: `${baseUrl()}/${uiLocale}/dashboard`,
  });
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
