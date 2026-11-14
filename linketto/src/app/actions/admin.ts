'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { requestPlanRefund, type RefundRequest } from '@/lib/plan-order-service';
import { banNoticeEmail, isBanCategory } from '@/lib/dsa-notice';
import { emailConfigured, sendEmail } from '@/lib/email';
import { eraseUser } from '@/lib/account-erasure';
import { applyPlanLimits } from '@/lib/plan-limits';
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
  if (!ban) {
    await prisma.profile.updateMany({
      where: { id: profileId },
      data: { bannedAt: null, bannedCategory: null, bannedReason: null },
    });
    redirect(`/${uiLocale}/admin?ok=1`);
  }
  // DSA чл. 17: без категория и обосновка няма бан — собственикът получава
  // изложение на мотивите с възможностите за обжалване.
  const category = String(formData.get('category') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!isBanCategory(category) || reason.length < 10 || reason.length > 2000) {
    redirect(`/${uiLocale}/admin?error=ban`);
  }
  const decidedAt = new Date();
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { slug: true, bannedAt: true, user: { select: { email: true, locale: true } } },
  });
  if (!profile) redirect(`/${uiLocale}/admin?error=input`);
  await prisma.profile.update({
    where: { id: profileId },
    data: { bannedAt: decidedAt, bannedCategory: category, bannedReason: reason },
  });
  if (emailConfigured()) {
    const { subject, html } = banNoticeEmail({
      locale: profile.user.locale,
      slug: profile.slug,
      category,
      reason,
      decidedAt,
      fromReport: formData.get('fromReport') === 'on',
    });
    await sendEmail({ to: profile.user.email, subject, html, tag: 'dsa-notice' }).catch(() => false);
  }
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
      data: {
        email,
        name: name || null,
        plan: plan as Plan,
        // FREE/FOUNDER нямат изтичане; ръчно даден PRO/BUSINESS пази текущото
        // (null = без срок — подарък от админа).
        ...(plan === 'FREE' || plan === 'FOUNDER' ? { planExpiresAt: null, planReminded: null } : {}),
      },
    });
    // Ръчно свален план → платените функции спират (виж lib/plan-limits.ts).
    await applyPlanLimits(userId);
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

/** Изтриване на акаунт: без покупки — каскадно (профили, линкове, продукти,
    съобщения, сесии, IP логове); с покупки — анонимизиране, за да се пазят
    фискалните записи 10 г. Не можеш да изтриеш себе си. */
export async function adminDeleteUserAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const admin = await requireAdmin(uiLocale);
  const userId = String(formData.get('userId') ?? '');
  if (formData.get('confirm') !== 'on' || userId === admin.id) {
    redirect(`/${uiLocale}/admin?error=input`);
  }
  // Има ли покупки → анонимизиране (фискалните записи се пазят 10 г.),
  // иначе пълно каскадно изтриване (виж lib/account-erasure.ts).
  await eraseUser(userId).catch((error: unknown) => {
    console.error('[admin] eraseUser failed', userId, error);
    redirect(`/${uiLocale}/admin?error=input`);
  });
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
    data: { customDomain: null, domainToken: null, domainVerifiedAt: null },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** P10: пълно връщане на поръчка за план (lib/plan-order-service.ts
    requestPlanRefund): refund при Revolut с Idempotency-Key; при `completed` на
    refund поръчката планът се връща към този отпреди поръчката, а бонусът на
    поканилия се сторнира. По-новата приложена поръчка се връща първа. */
export async function adminRefundPlanOrderAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const planOrderId = String(formData.get('planOrderId') ?? '');
  let result: RefundRequest;
  try {
    result = await requestPlanRefund(planOrderId);
  } catch {
    redirect(`/${uiLocale}/admin?error=refund`);
  }
  if (result === 'newer-first') redirect(`/${uiLocale}/admin?error=refund-order`);
  if (result === 'not-refundable') redirect(`/${uiLocale}/admin?error=refund`);
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
