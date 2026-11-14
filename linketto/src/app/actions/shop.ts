'use server';

import { redirect } from 'next/navigation';
import { dash } from '@/lib/dashboard-url';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { isExternalPaymentUrl } from '@/lib/external-url';

// Магазинът на създателите (docs/revolut-migration-spec.md §7, решение О-1):
// продажбите ПРЕЗ Linketto са спрени. Продуктът е витрина — заглавие, цена,
// описание и СОБСТВЕН линк за плащане на създателя (Revolut, PayPal…). Linketto
// не пипа парите, не взима комисиона и не доставя.

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

// Продавачът декларира статута си (Дир. 2011/83 чл. 6а): търговец или
// частно лице. Показва се до всеки продукт.
export async function setTraderStatusAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  await prisma.user.update({
    where: { id: user.id },
    data: { isTrader: formData.get('isTrader') === 'on' },
  });
  redirect(await dash(uiLocale));
}

const productSchema = z.object({
  title: z.string().trim().min(1).max(100),
  priceEur: z.coerce.number().min(0).max(10000),
  externalUrl: z.string().trim().max(2000),
});

export async function addProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const profileId = String(formData.get('profileId') ?? '');
  const parsed = productSchema.safeParse({
    title: formData.get('title'),
    priceEur: formData.get('priceEur'),
    externalUrl: formData.get('externalUrl') ?? '',
  });
  if (!parsed.success || !isExternalPaymentUrl(parsed.data.externalUrl)) {
    redirect(await dash(uiLocale, '?error=product'));
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { _count: { select: { products: true } } },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));
  await prisma.product.create({
    data: {
      profileId,
      priceCents: Math.round(parsed.data.priceEur * 100),
      type: 'DIGITAL',
      externalUrl: parsed.data.externalUrl,
      position: profile._count.products,
      translations: {
        create: { locale: profile.defaultLocale, title: parsed.data.title },
      },
    },
  });
  redirect(await dash(uiLocale));
}

// Редакция на цена, линк за плащане и активност.
export async function updateProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const productId = String(formData.get('productId') ?? '');
  const priceEur = z.coerce.number().min(0).max(10000).safeParse(formData.get('priceEur'));
  const externalUrl = String(formData.get('externalUrl') ?? '').trim();
  if (!priceEur.success || !isExternalPaymentUrl(externalUrl)) {
    redirect(await dash(uiLocale, '?error=product'));
  }
  const { count } = await prisma.product.updateMany({
    where: { id: productId, profile: { userId: user.id } },
    data: {
      priceCents: Math.round(priceEur.data * 100),
      externalUrl,
      active: formData.get('active') === 'on',
    },
  });
  if (count === 0) redirect(await dash(uiLocale, '?error=generic'));
  redirect(await dash(uiLocale));
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const productId = String(formData.get('productId') ?? '');
  const product = await prisma.product.findFirst({
    where: { id: productId, profile: { userId: user.id } },
    select: { id: true, _count: { select: { purchases: true, entitlements: true } } },
  });
  if (!product) redirect(await dash(uiLocale));
  if (product._count.purchases > 0 || product._count.entitlements > 0) {
    // Заварени покупки (OSS/Н-18, 10 г.) и платен достъп не се трият —
    // продуктът се архивира (FK-ът е Restrict).
    await prisma.product.update({
      where: { id: product.id },
      data: { active: false },
    });
  } else {
    await prisma.product.delete({ where: { id: product.id } });
  }
  redirect(await dash(uiLocale));
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
  const description =
    String(formData.get('description') ?? '').trim().slice(0, 500) || null;
  if (!isLocale(locale)) redirect(await dash(uiLocale, '?error=generic'));
  const product = await prisma.product.findFirst({
    where: { id: productId, profile: { userId: user.id } },
    include: { profile: true },
  });
  if (!product) redirect(await dash(uiLocale, '?error=generic'));
  if (!title) {
    if (locale !== product.profile.defaultLocale) {
      await prisma.productTranslation
        .delete({ where: { productId_locale: { productId, locale } } })
        .catch(() => undefined);
    }
    redirect(await dash(uiLocale));
  }
  await prisma.productTranslation.upsert({
    where: { productId_locale: { productId, locale } },
    create: { productId, locale, title, description },
    update: { title, description },
  });
  redirect(await dash(uiLocale));
}
