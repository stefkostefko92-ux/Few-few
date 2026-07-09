'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { isLocale } from '@/i18n/locales';
import {
  membershipFeePercent,
  membershipInterval,
  MIN_PRODUCT_PRICE_EUR,
  planFor,
  totalFeeCents,
} from '@/lib/plans';
import {
  COUPON_MAX_PERCENT,
  COUPON_MIN_PERCENT,
  discountedPriceCents,
  isCouponUsable,
  normalizeCouponCode,
} from '@/lib/coupon';

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

  // ЗЗП чл. 57, т. 13: без изрично съгласие за незабавна доставка
  // (= отказ от 14-дневното право) покупка не се стартира.
  if (formData.get('waiver') !== 'on') {
    redirect(`${back}${hl ? '&' : '?'}shopError=1`);
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      active: true,
      profile: { slug, published: true, bannedAt: null },
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

  const localized =
    product.translations.find((t) => t.locale === hl) ??
    product.translations.find(
      (t) => t.locale === product.profile.defaultLocale,
    ) ??
    product.translations[0];
  const title = localized?.title ?? 'Product';
  const description = localized?.description?.trim() || undefined;

  // Промо код (по избор): валидира се и сумата се ПРЕИЗЧИСЛЯВА на сървъра.
  // Не важи за абонаменти (членства) — там цената е периодична.
  const couponInput = normalizeCouponCode(String(formData.get('coupon') ?? ''));
  let unitAmount = product.priceCents;
  let appliedCoupon: { id: string; code: string } | null = null;
  if (couponInput && product.type !== 'MEMBERSHIP') {
    const coupon = await prisma.coupon.findUnique({
      where: {
        profileId_code: { profileId: product.profileId, code: couponInput },
      },
    });
    if (!coupon || !isCouponUsable(coupon, new Date())) {
      redirect(`${back}${hl ? '&' : '?'}couponError=1`);
    }
    unitAmount = discountedPriceCents(product.priceCents, coupon.percentOff);
    appliedCoupon = { id: coupon.id, code: coupon.code };
  }

  const planId = planFor(owner.plan).id;
  const productName = { name: title, ...(description ? { description } : {}) };
  const metadata = {
    productId: product.id,
    profileId: product.profileId,
    type: product.type,
    locale: isLocale(hl) ? hl : product.profile.defaultLocale,
    couponId: appliedCoupon?.id ?? '',
    couponCode: appliedCoupon?.code ?? '',
  };
  // COURSE/MEMBERSHIP → достъп до заключеното съдържание; DIGITAL → таен линк.
  const successUrl =
    product.type === 'DIGITAL'
      ? `${baseUrl()}/u/${slug}/delivery?session_id={CHECKOUT_SESSION_ID}`
      : `${baseUrl()}/u/${slug}/learn/${product.id}?session_id={CHECKOUT_SESSION_ID}`;

  let session;
  if (product.type === 'MEMBERSHIP') {
    // Абонамент: recurring цена, комисионата е application_fee_percent.
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: product.priceCents,
            recurring: { interval: membershipInterval(product.interval) },
            product_data: productName,
          },
        },
      ],
      subscription_data: {
        application_fee_percent: membershipFeePercent(planId),
        transfer_data: { destination: owner.stripeAccountId },
        on_behalf_of: owner.stripeAccountId,
      },
      metadata: { ...metadata, feeCents: '' },
      locale: 'auto',
      success_url: successUrl,
      cancel_url: `${baseUrl()}${back}`,
    });
  } else {
    // Еднократно (DIGITAL или COURSE): destination charge.
    // Инвариант: application_fee трябва да е < сумата (Stripe го изисква).
    const fee = Math.min(totalFeeCents(unitAmount, planId), unitAmount - 1);
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Платежните методи се управляват от Stripe Dashboard. ВНИМАНИЕ: при
      // destination charges PayPal НЕ се поддържа — карти/wallets работят.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: unitAmount,
            product_data: productName,
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: fee,
        transfer_data: { destination: owner.stripeAccountId },
        on_behalf_of: owner.stripeAccountId,
      },
      metadata: { ...metadata, feeCents: String(fee) },
      locale: 'auto',
      success_url: successUrl,
      cancel_url: `${baseUrl()}${back}`,
    });
  }
  redirect(session.url ?? `${back}${hl ? '&' : '?'}shopError=1`);
}

// Продавачът декларира статута си (Дир. 2011/83 чл. 6а): търговец или
// частно лице. Показва се до всеки продукт преди покупка.
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
  redirect(`/${uiLocale}/dashboard`);
}

// Продавачът сам връща пари за своя продажба (merchant-of-record носи
// законовата отговорност за съответствие — Дир. ЕС 2019/770).
export async function sellerRefundAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const purchaseId = String(formData.get('purchaseId') ?? '');
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
  });
  // Скоуп: покупката трябва да е по профил на текущия потребител.
  const owned = purchase
    ? await prisma.profile.findFirst({
        where: { id: purchase.profileId, userId: user.id },
        select: { id: true },
      })
    : null;
  const stripe = getStripe();
  if (
    !purchase ||
    !owned ||
    !purchase.stripePaymentIntentId ||
    purchase.refundedAt ||
    !stripe
  ) {
    redirect(`/${uiLocale}/dashboard?error=refund`);
  }
  try {
    await stripe.refunds.create({
      payment_intent: purchase.stripePaymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
    });
  } catch {
    redirect(`/${uiLocale}/dashboard?error=refund`);
  }
  await prisma.purchase.update({
    where: { id: purchaseId },
    data: { refundedAt: new Date() },
  });
  redirect(`/${uiLocale}/dashboard`);
}

const PRODUCT_TYPES = ['DIGITAL', 'COURSE', 'MEMBERSHIP'] as const;

const productSchema = z.object({
  title: z.string().trim().min(1).max(100),
  priceEur: z.coerce.number().min(MIN_PRODUCT_PRICE_EUR).max(10000),
  type: z.enum(PRODUCT_TYPES).default('DIGITAL'),
  interval: z.enum(['month', 'year']).optional(),
  deliveryUrl: z.string().trim().max(2000).optional(),
});

const httpUrl = (value: string) => /^https?:\/\/.+/.test(value);

export async function addProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const profileId = String(formData.get('profileId') ?? '');
  const parsed = productSchema.safeParse({
    title: formData.get('title'),
    priceEur: formData.get('priceEur'),
    type: formData.get('type') ?? 'DIGITAL',
    interval: formData.get('interval') || undefined,
    deliveryUrl: formData.get('deliveryUrl') || undefined,
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/dashboard?error=product`);
  }
  const type = parsed.data.type;
  // DIGITAL иска валиден линк за доставка; COURSE/MEMBERSHIP ползват уроци.
  let deliveryUrl: string | null = null;
  if (type === 'DIGITAL') {
    const du = (parsed.data.deliveryUrl ?? '').trim();
    if (!httpUrl(du)) redirect(`/${uiLocale}/dashboard?error=product`);
    deliveryUrl = du;
  }
  const interval = type === 'MEMBERSHIP' ? (parsed.data.interval ?? 'month') : null;
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { _count: { select: { products: true } } },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);
  await prisma.product.create({
    data: {
      profileId,
      priceCents: Math.round(parsed.data.priceEur * 100),
      type,
      interval,
      deliveryUrl,
      position: profile._count.products,
      translations: {
        create: { locale: profile.defaultLocale, title: parsed.data.title },
      },
    },
  });
  redirect(`/${uiLocale}/dashboard`);
}

// Редакция на цена, линк за доставка и активност (типът не се мени след
// създаване — за да не се обърква билингът).
export async function updateProductAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const productId = String(formData.get('productId') ?? '');
  const priceEur = z.coerce
    .number()
    .min(MIN_PRODUCT_PRICE_EUR)
    .max(10000)
    .safeParse(formData.get('priceEur'));
  if (!priceEur.success) {
    redirect(`/${uiLocale}/dashboard?error=product`);
  }
  const product = await prisma.product.findFirst({
    where: { id: productId, profile: { userId: user.id } },
    select: { id: true, type: true },
  });
  if (!product) redirect(`/${uiLocale}/dashboard?error=generic`);
  // deliveryUrl важи само за DIGITAL.
  let deliveryUrl: string | null | undefined = undefined;
  if (product.type === 'DIGITAL') {
    const du = String(formData.get('deliveryUrl') ?? '').trim();
    if (!httpUrl(du)) redirect(`/${uiLocale}/dashboard?error=product`);
    deliveryUrl = du;
  }
  await prisma.product.update({
    where: { id: productId },
    data: {
      priceCents: Math.round(priceEur.data * 100),
      active: formData.get('active') === 'on',
      ...(deliveryUrl !== undefined ? { deliveryUrl } : {}),
    },
  });
  redirect(`/${uiLocale}/dashboard`);
}

// ── Уроци (за COURSE/MEMBERSHIP) ──────────────────────────────────────
const lessonSchema = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().max(5000).optional(),
  videoUrl: z.string().trim().max(2000).optional(),
});

export async function addLessonAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const productId = String(formData.get('productId') ?? '');
  const parsed = lessonSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body') || undefined,
    videoUrl: formData.get('videoUrl') || undefined,
  });
  if (!parsed.success) redirect(`/${uiLocale}/dashboard?error=product`);
  const product = await prisma.product.findFirst({
    where: { id: productId, profile: { userId: user.id } },
    include: { _count: { select: { lessons: true } } },
  });
  if (!product) redirect(`/${uiLocale}/dashboard?error=generic`);
  await prisma.lesson.create({
    data: {
      productId,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      videoUrl: parsed.data.videoUrl ?? null,
      position: product._count.lessons,
    },
  });
  redirect(`/${uiLocale}/dashboard`);
}

export async function deleteLessonAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const lessonId = String(formData.get('lessonId') ?? '');
  await prisma.lesson.deleteMany({
    where: { id: lessonId, product: { profile: { userId: user.id } } },
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
  const description =
    String(formData.get('description') ?? '').trim().slice(0, 500) || null;
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
    create: { productId, locale, title, description },
    update: { title, description },
  });
  redirect(`/${uiLocale}/dashboard`);
}

// ── Промо кодове ──────────────────────────────────────────────────────
const couponSchema = z.object({
  code: z.string().trim().min(3).max(24),
  percentOff: z.coerce
    .number()
    .int()
    .min(COUPON_MIN_PERCENT)
    .max(COUPON_MAX_PERCENT),
  maxRedemptions: z.coerce.number().int().min(1).max(100000).optional(),
  expiresAt: z.string().trim().optional(),
});

export async function addCouponAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const profileId = String(formData.get('profileId') ?? '');
  const rawMax = String(formData.get('maxRedemptions') ?? '').trim();
  const rawExpires = String(formData.get('expiresAt') ?? '').trim();
  const parsed = couponSchema.safeParse({
    code: formData.get('code'),
    percentOff: formData.get('percentOff'),
    maxRedemptions: rawMax || undefined,
    expiresAt: rawExpires || undefined,
  });
  const code = parsed.success ? normalizeCouponCode(parsed.data.code) : '';
  if (!parsed.success || code.length < 3) {
    redirect(`/${uiLocale}/dashboard?error=coupon`);
  }
  // Собственост: профилът трябва да е на текущия потребител.
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);
  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    redirect(`/${uiLocale}/dashboard?error=coupon`);
  }
  try {
    await prisma.coupon.create({
      data: {
        profileId,
        code,
        percentOff: parsed.data.percentOff,
        maxRedemptions: parsed.data.maxRedemptions ?? null,
        expiresAt,
      },
    });
  } catch {
    // Уникалност (profileId, code) — кодът вече съществува.
    redirect(`/${uiLocale}/dashboard?error=coupon`);
  }
  redirect(`/${uiLocale}/dashboard`);
}

export async function deleteCouponAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const couponId = String(formData.get('couponId') ?? '');
  await prisma.coupon.deleteMany({
    where: { id: couponId, profile: { userId: user.id } },
  });
  redirect(`/${uiLocale}/dashboard`);
}
