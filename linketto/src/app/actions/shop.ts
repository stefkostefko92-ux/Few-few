'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { isLocale } from '@/i18n/locales';
import { MIN_PRODUCT_PRICE_EUR, planFor, totalFeeCents } from '@/lib/plans';

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

// Stripe Connect (Express) onboarding — създателят свързва акаунт, в който
// получава парите от продажбите; ние удържаме application_fee по плана.
export async function connectStripeAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const stripe = getStripe();
  if (!stripe) redirect(`/${uiLocale}/dashboard?error=stripe`);

  let accountId = user.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      metadata: { userId: user.id },
    });
    accountId = account.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeAccountId: accountId },
    });
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${baseUrl()}/${uiLocale}/dashboard`,
    return_url: `${baseUrl()}/${uiLocale}/dashboard?connected=1`,
  });
  redirect(link.url);
}

// Публично: купувач натиска „Купи“ на профила. Destination charge към
// акаунта на създателя; нашата комисиона (по плана му) е application_fee.
// Сумата и целта се четат САМО от базата — на клиента не се вярва.
export async function startProductPurchaseAction(
  formData: FormData,
): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const hl = String(formData.get('hl') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const back = `/u/${slug}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`;

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      active: true,
      profile: { slug, published: true },
    },
    include: {
      translations: true,
      profile: { include: { user: true } },
    },
  });
  const owner = product?.profile.user;
  const stripe = getStripe();
  if (
    !product ||
    !owner?.stripeAccountId ||
    !owner.stripeChargesEnabled ||
    !stripe
  ) {
    redirect(`${back}${hl ? '&' : '?'}shopError=1`);
  }

  const title =
    product.translations.find((t) => t.locale === hl)?.title ??
    product.translations.find(
      (t) => t.locale === product.profile.defaultLocale,
    )?.title ??
    product.translations[0]?.title ??
    'Product';
  // Комисиона по плана + такса за обработка (покрива Stripe таксите).
  const fee = totalFeeCents(product.priceCents, planFor(owner.plan).id);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: product.priceCents,
          product_data: { name: title },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: owner.stripeAccountId },
    },
    metadata: {
      productId: product.id,
      profileId: product.profileId,
      feeCents: String(fee),
    },
    locale: 'auto',
    success_url: `${baseUrl()}/u/${slug}/delivery?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl()}${back}`,
  });
  redirect(session.url ?? `${back}${hl ? '&' : '?'}shopError=1`);
}

const productSchema = z.object({
  title: z.string().trim().min(1).max(100),
  priceEur: z.coerce.number().min(MIN_PRODUCT_PRICE_EUR).max(10000),
  deliveryUrl: z
    .string()
    .trim()
    .url()
    .max(2000)
    .refine((value) => /^https?:\/\//.test(value)),
});

export async function addProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const profileId = String(formData.get('profileId') ?? '');
  const parsed = productSchema.safeParse({
    title: formData.get('title'),
    priceEur: formData.get('priceEur'),
    deliveryUrl: formData.get('deliveryUrl'),
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/dashboard?error=product`);
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { _count: { select: { products: true } } },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);
  await prisma.product.create({
    data: {
      profileId,
      priceCents: Math.round(parsed.data.priceEur * 100),
      deliveryUrl: parsed.data.deliveryUrl,
      position: profile._count.products,
      translations: {
        create: { locale: profile.defaultLocale, title: parsed.data.title },
      },
    },
  });
  redirect(`/${uiLocale}/dashboard`);
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const productId = String(formData.get('productId') ?? '');
  await prisma.product.deleteMany({
    where: { id: productId, profile: { userId: user.id } },
  });
  redirect(`/${uiLocale}/dashboard`);
}

export async function upsertProductTranslationAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const productId = String(formData.get('productId') ?? '');
  const locale = String(formData.get('locale') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 100);
  if (!isLocale(locale)) redirect(`/${uiLocale}/dashboard?error=generic`);
  const product = await prisma.product.findFirst({
    where: { id: productId, profile: { userId: user.id } },
    include: { profile: true },
  });
  if (!product) redirect(`/${uiLocale}/dashboard?error=generic`);
  if (!title) {
    if (locale !== product.profile.defaultLocale) {
      await prisma.productTranslation
        .delete({ where: { productId_locale: { productId, locale } } })
        .catch(() => undefined);
    }
    redirect(`/${uiLocale}/dashboard`);
  }
  await prisma.productTranslation.upsert({
    where: { productId_locale: { productId, locale } },
    create: { productId, locale, title },
    update: { title },
  });
  redirect(`/${uiLocale}/dashboard`);
}
