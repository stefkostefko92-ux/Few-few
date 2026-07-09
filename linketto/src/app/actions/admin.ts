'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { getStripe } from '@/lib/stripe';
import { isLocale } from '@/i18n/locales';
import type { Plan } from '@prisma/client';

// Админ действия — само за ADMIN_EMAILS. Всяко действие проверява наново.

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const PLAN_VALUES = ['FREE', 'PRO', 'BUSINESS', 'FOUNDER'] as const;

/** Бан/отбан на профил: баннат = невидим публично (без публичен банер). */
export async function setProfileBanAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const ban = formData.get('ban') === '1';
  await prisma.profile.updateMany({
    where: { id: profileId },
    data: { bannedAt: ban ? new Date() : null },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

const updateUserSchema = z.object({
  userId: z.string().min(1),
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(100),
  plan: z.enum(PLAN_VALUES),
});

/** Пълна промяна на данните на потребител (имейл, име, план). */
export async function adminUpdateUserAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const parsed = updateUserSchema.safeParse({
    userId: formData.get('userId'),
    email: formData.get('email'),
    name: formData.get('name') ?? '',
    plan: formData.get('plan'),
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/admin?error=input`);
  }
  const { userId, email, name, plan } = parsed.data;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { email, name: name || null, plan: plan as Plan },
    });
  } catch (error) {
    // P2002 = зает имейл
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      redirect(`/${uiLocale}/admin?error=email`);
    }
    throw error;
  }
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Принудителен изход: всички активни сесии на потребителя се прекратяват. */
export async function adminForceLogoutAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const userId = String(formData.get('userId') ?? '');
  await prisma.session.deleteMany({ where: { userId } });
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Пълно изтриване на акаунт (каскадно: профили, линкове, продукти,
    покупки, съобщения, сесии, IP логове). Не можеш да изтриеш себе си. */
export async function adminDeleteUserAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const admin = await requireAdmin(uiLocale);
  const userId = String(formData.get('userId') ?? '');
  if (formData.get('confirm') !== 'on' || userId === admin.id) {
    redirect(`/${uiLocale}/admin?error=input`);
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Публикуване/сваляне на профил от админа. */
export async function adminSetPublishedAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const publish = formData.get('publish') === '1';
  await prisma.profile.updateMany({
    where: { id: profileId },
    data: { published: publish },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Маха собствения домейн на профил (при злоупотреба/изтекъл план). */
export async function adminClearDomainAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  await prisma.profile.updateMany({
    where: { id: profileId },
    data: { customDomain: null },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Връщане на пари за покупка: refund с reverse на transfer-а към продавача
    и връщане на нашата комисиона (при destination charges платформата иначе
    носи загубата). Маркира Purchase.refundedAt (и през charge.refunded). */
export async function adminRefundPurchaseAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const purchaseId = String(formData.get('purchaseId') ?? '');
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
  });
  const stripe = getStripe();
  if (!purchase?.stripePaymentIntentId || !stripe) {
    redirect(`/${uiLocale}/admin?error=refund`);
  }
  try {
    await stripe.refunds.create({
      payment_intent: purchase.stripePaymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
    });
  } catch {
    redirect(`/${uiLocale}/admin?error=refund`);
  }
  await prisma.purchase.update({
    where: { id: purchaseId },
    data: { refundedAt: new Date() },
  });
  // Върнати пари → отнемаме и еднократното право на достъп (курс).
  if (purchase.buyerEmail) {
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
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Маркира заявка за изплащане на реферал бонус като платена. */
export async function adminMarkPayoutPaidAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const payoutId = String(formData.get('payoutId') ?? '');
  await prisma.referralPayout.updateMany({
    where: { id: payoutId, status: 'pending' },
    data: { status: 'paid', paidAt: new Date() },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Маркира DSA сигнал като разгледан. */
export async function adminResolveReportAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const reportId = String(formData.get('reportId') ?? '');
  await prisma.report.updateMany({
    where: { id: reportId },
    data: { resolvedAt: new Date() },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

const passwordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(200),
});

/** Ръчна нова парола (старата не се вижда никъде — пази се само хеш).
    Всички активни сесии на потребителя се прекратяват. */
export async function adminSetPasswordAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const parsed = passwordSchema.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/admin?error=password`);
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash },
  });
  await prisma.session.deleteMany({
    where: { userId: parsed.data.userId },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}
