'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireAdmin, requireStepUp } from '@/lib/admin';
import { adminEmailChange, isAdminEmail, isWorkingAdmin } from '@/lib/admin-list';
import { recordSecurityEvent } from '@/lib/security-events';
import { notifyAdmins } from '@/lib/admin-alert';
import { notifyUserSecurity, sendVerificationEmail } from '@/lib/account-flows';
import { requestPlanRefund, type RefundRequest } from '@/lib/plan-order-service';
import { banAllowed, banNoticeEmail, isBanCategory, warningNoticeEmail } from '@/lib/dsa-notice';
import { emailReady, sendEmail } from '@/lib/email';
import { eraseUser } from '@/lib/account-erasure';
import { applyPlanLimits } from '@/lib/plan-limits';
import { autoTranslateNoticeEmail, autoTranslateStartDate } from '@/lib/auto-translate-notice';
import { SITE_URL } from '@/lib/seo';
import { isLocale } from '@/i18n/locales';
import type { Plan, Prisma } from '@prisma/client';
import { newPasswordSchema } from '@/lib/password-policy';

// Админ действия — само за ADMIN_EMAILS. Всяко действие проверява наново.

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const PLAN_VALUES = ['FREE', 'PRO', 'BUSINESS', 'FOUNDER'] as const;

/**
 * Червен екип: админ не може да превземе ДРУГ админ (имейл, парола, изход,
 * изтриване) — само самият той от „Сигурност“. Връща целевия потребител.
 */
async function guardTarget(uiLocale: string, adminId: string, userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, locale: true, emailVerifiedAt: true, totpEnabledAt: true },
  });
  if (!target) redirect(`/${uiLocale}/admin?error=input`);
  // Защитен е само РАБОТЕЩ админ (потвърден + 2FA). Акаунт, „заел“ админ адрес
  // без потвърждение/2FA, админът може да изтрие (Разбивача F1).
  if (target.id !== adminId && isWorkingAdmin(target)) redirect(`/${uiLocale}/admin?error=admin-target`);
  return target;
}

/** Бан/отбан на профил: баннат = невидим публично (без публичен банер). */
export async function setProfileBanAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const ban = formData.get('ban') === '1';
  if (!ban) {
    await prisma.profile.updateMany({
      where: { id: profileId },
      data: { bannedAt: null, bannedCategory: null, bannedReason: null, banNoticeSentAt: null },
    });
    redirect(`/${uiLocale}/admin?ok=1`);
  }
  // DSA чл. 17: без категория и обосновка няма мярка — собственикът получава
  // мотивите и пътищата за обжалване. ОУ: леките нарушения (спам/друго) —
  // първо предупреждение със срок; тежките — веднага.
  const mode = formData.get('mode') === 'warn' ? 'warn' : 'ban';
  const category = String(formData.get('category') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const legalGround = String(formData.get('legalGround') ?? '').trim().slice(0, 300);
  if (!isBanCategory(category) || reason.length < 10 || reason.length > 2000) {
    redirect(`/${uiLocale}/admin?error=ban`);
  }
  if (mode === 'ban' && category === 'illegal' && legalGround.length < 3) {
    redirect(`/${uiLocale}/admin?error=ban-ground`);
  }
  const decidedAt = new Date();
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { slug: true, warnedAt: true, user: { select: { email: true, locale: true } } },
  });
  if (!profile) redirect(`/${uiLocale}/admin?error=input`);
  const fromReport = formData.get('fromReport') === 'on';

  if (mode === 'warn') {
    await prisma.profile.update({
      where: { id: profileId },
      data: { warnedAt: decidedAt, warnedCategory: category, warnedReason: reason },
    });
    if (await emailReady()) {
      const { subject, html } = warningNoticeEmail({
        locale: profile.user.locale,
        slug: profile.slug,
        category,
        reason,
        decidedAt,
        fromReport,
      });
      await sendEmail({ to: profile.user.email, subject, html, tag: 'dsa-warning' }).catch(() => false);
    }
    redirect(`/${uiLocale}/admin?ok=1`);
  }

  const allowed = banAllowed({ category, warnedAt: profile.warnedAt, now: decidedAt });
  if (allowed !== 'ok') redirect(`/${uiLocale}/admin?error=ban-warn`);
  await prisma.profile.update({
    where: { id: profileId },
    data: { bannedAt: decidedAt, bannedCategory: category, bannedReason: reason, banNoticeSentAt: null },
  });
  let sent = false;
  if (await emailReady()) {
    const { subject, html } = banNoticeEmail({
      locale: profile.user.locale,
      slug: profile.slug,
      category,
      reason,
      legalGround: legalGround || undefined,
      decidedAt,
      fromReport,
    });
    sent = await sendEmail({ to: profile.user.email, subject, html, tag: 'dsa-notice' }).catch(() => false);
  }
  if (sent) {
    await prisma.profile.updateMany({ where: { id: profileId, bannedAt: decidedAt }, data: { banNoticeSentAt: new Date() } });
  }
  // Мотивите се виждат и в таблото на собственика; неизпратен имейл — видимо в админа.
  redirect(`/${uiLocale}/admin?${sent ? 'ok=1' : 'error=ban-notice'}`);
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
  const admin = await requireStepUp(uiLocale);
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
  const target = await guardTarget(uiLocale, admin.id, userId);
  const change = adminEmailChange({ adminId: admin.id, targetId: userId, current: target.email, next: email });
  if (change === 'forbidden') redirect(`/${uiLocale}/admin?error=admin-target`);
  try {
    // Атомарно: нов адрес без потвърждение + без висящи токени/сесии в един запис
    // (иначе стар токен може да „потвърди“ новия адрес в прозореца между тях).
    const updateUser = prisma.user.update({
      where: { id: userId },
      data: {
        email,
        // Новият адрес трябва да се потвърди наново (иначе старото потвърждение „важи“ за него).
        ...(change === 'changed' ? { emailVerifiedAt: null } : {}),
        name: name || null,
        plan: plan as Plan,
        // FREE/FOUNDER нямат изтичане; ръчно даден PRO/BUSINESS пази текущото
        // (null = без срок — подарък от админа).
        ...(plan === 'FREE' || plan === 'FOUNDER' ? { planExpiresAt: null, planReminded: null } : {}),
      },
    });
    const ops: Prisma.PrismaPromise<unknown>[] = [updateUser];
    if (change === 'changed') {
      ops.push(prisma.userToken.deleteMany({ where: { userId } }), prisma.session.deleteMany({ where: { userId } }));
    }
    await prisma.$transaction(ops);
    // Ръчно свален план → платените функции спират (виж lib/plan-limits.ts).
    await applyPlanLimits(userId);
    if (change === 'changed') {
      // Старият адрес научава за смяната (иначе тихо превземане на акаунта).
      await notifyUserSecurity(target, 'admin-email');
      // Стражата: смяната на имейл (път към превземане) — и до всички админи.
      await notifyAdmins('Админ смени имейла на акаунт', [`Админ: ${admin.email}`, `Акаунт (id): ${userId}`]).catch(() => false);
      await sendVerificationEmail({ id: userId, email, locale: target.locale }).catch(() => false);
      await recordSecurityEvent('admin.action', { userId: admin.id, meta: { action: 'change-email', target: userId } });
    }
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
  const admin = await requireAdmin(uiLocale);
  const userId = String(formData.get('userId') ?? '');
  await guardTarget(uiLocale, admin.id, userId);
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  await recordSecurityEvent('admin.action', { userId: admin.id, meta: { action: 'force-logout', target: userId, count } });
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Изтриване на акаунт: без покупки — каскадно (профили, линкове, продукти,
    съобщения, сесии, IP логове); с покупки — анонимизиране, за да се пазят
    фискалните записи 10 г. Не можеш да изтриеш себе си. */
export async function adminDeleteUserAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const admin = await requireStepUp(uiLocale);
  const userId = String(formData.get('userId') ?? '');
  if (formData.get('confirm') !== 'on' || userId === admin.id) {
    redirect(`/${uiLocale}/admin?error=input`);
  }
  await guardTarget(uiLocale, admin.id, userId);
  await recordSecurityEvent('admin.action', { userId: admin.id, meta: { action: 'delete-user', target: userId } });
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
  const stepAdmin = await requireStepUp(uiLocale);
  await recordSecurityEvent('admin.action', { userId: stepAdmin.id, meta: { action: 'refund' } });
  const planOrderId = String(formData.get('planOrderId') ?? '');
  let result: RefundRequest;
  try {
    result = await requestPlanRefund(planOrderId);
  } catch {
    redirect(`/${uiLocale}/admin?error=refund`);
  }
  if (result === 'newer-first') redirect(`/${uiLocale}/admin?error=refund-order`);
  // Revolut не отговори ясно — връщането е в ход; повторът е със същия ключ.
  if (result === 'stuck') redirect(`/${uiLocale}/admin?error=refund-pending`);
  if (result === 'not-refundable') redirect(`/${uiLocale}/admin?error=refund`);
  redirect(`/${uiLocale}/admin?ok=1`);
}

/** Маркира заявка за изплащане на реферал бонус като платена. */
export async function adminMarkPayoutPaidAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const stepAdmin = await requireStepUp(uiLocale);
  await recordSecurityEvent('admin.action', { userId: stepAdmin.id, meta: { action: 'payout-paid' } });
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
  password: newPasswordSchema,
});

/** Ръчна нова парола (старата не се вижда никъде — пази се само хеш).
    Всички активни сесии на потребителя се прекратяват. */
export async function adminSetPasswordAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const stepAdmin = await requireStepUp(uiLocale);
  const parsed = passwordSchema.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/admin?error=password`);
  }
  const target = await guardTarget(uiLocale, stepAdmin.id, parsed.data.userId);
  // Разбивача N3: чужд акаунт с админ адрес (дори непотвърден) — никога нова парола от друг админ.
  if (target.id !== stepAdmin.id && isAdminEmail(target.email)) redirect(`/${uiLocale}/admin?error=admin-target`);
  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash },
  });
  await prisma.session.deleteMany({
    where: { userId: parsed.data.userId },
  });
  await recordSecurityEvent('admin.action', { userId: stepAdmin.id, meta: { action: 'set-password', target: target.id } });
  await notifyUserSecurity(target, 'admin-password');
  redirect(`/${uiLocale}/admin?ok=1`);
}

/**
 * Уведомление до създателите с профили отпреди автоматичния превод (правен
 * преглед, ОРЗД чл. 12–13): по едно писмо на собственик; датата на включване
 * (≥14 дни) се насрочва САМО за профилите, чийто собственик реално е получил
 * писмото. Без Brevo — нищо не се насрочва.
 */
export async function adminNotifyAutoTranslateAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  if (!(await emailReady())) redirect(`/${uiLocale}/admin?error=autonotice-email#autotranslate`);
  const pending = await prisma.profile.findMany({
    where: { autoTranslateMode: 'pending', autoTranslateStartsAt: null },
    select: { id: true, slug: true, user: { select: { id: true, email: true, locale: true } } },
  });
  const byUser = new Map<string, { email: string; locale: string; ids: string[]; slugs: string[] }>();
  for (const profile of pending) {
    const entry = byUser.get(profile.user.id) ?? {
      email: profile.user.email,
      locale: profile.user.locale,
      ids: [],
      slugs: [],
    };
    entry.ids.push(profile.id);
    entry.slugs.push(profile.slug);
    byUser.set(profile.user.id, entry);
  }
  const startsAt = autoTranslateStartDate(new Date());
  let sent = 0;
  for (const owner of byUser.values()) {
    const mail = autoTranslateNoticeEmail({ locale: owner.locale, slugs: owner.slugs, startsAt, baseUrl: SITE_URL });
    const ok = await sendEmail({ to: owner.email, subject: mail.subject, html: mail.html, tag: 'notice' });
    if (!ok) continue;
    // Само „pending“ без дата — ако междувременно създателят е избрал сам, не пипаме.
    await prisma.profile.updateMany({
      where: { id: { in: owner.ids }, autoTranslateMode: 'pending', autoTranslateStartsAt: null },
      data: { autoTranslateStartsAt: startsAt },
    });
    sent += 1;
  }
  redirect(`/${uiLocale}/admin?ok=autonotice&count=${sent}#autotranslate`);
}
