'use server';

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { PLANS, type PlanId } from '@/lib/plans';
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
  if (!plan || !plan.stripePriceEnv) {
    redirect(`/${uiLocale}/dashboard?error=generic`);
  }
  const priceId = process.env[plan.stripePriceEnv];
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
