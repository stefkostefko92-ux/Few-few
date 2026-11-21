'use server';

// Страницата „Сигурност“ (docs/security-2fa-settings-spec.md): 2FA, резервни
// кодове, парола, сесии, потвърждение на имейла, step-up за админа.
// Тайните (TOTP секрет) са шифровани; кодовете се показват само веднъж и
// пътуват само в отговора на действието (не в адреса, не в логове).

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isLocale } from '@/i18n/locales';
import {
  destroySession,
  getSession,
  hashPassword,
  markSessionMfa,
  revokeOtherSessions,
  verifyPassword,
} from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin-list';
import { notifyAdmins } from '@/lib/admin-alert';
import { canSeal, open as openSealed, seal, sealContext } from '@/lib/secret-box';
import { newTotpSecret, verifyTotp } from '@/lib/totp';
import { openTotpSecret } from '@/lib/totp-secret';
import { hashBackupCode, matchBackupCode, newBackupCodes } from '@/lib/backup-codes';
import { rateLimit } from '@/lib/rate-limit';
import { alertAtThreshold, recordSecurityEvent } from '@/lib/security-events';
import { notifyUserSecurity, sendVerificationEmail } from '@/lib/account-flows';

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const page = (locale: string, query = '') => `/${locale}/dashboard/security${query}`;

async function requireActive(locale: string) {
  const active = await getSession();
  if (!active) redirect(`/${locale}/login`);
  return active;
}

/** Код от приложението; при успех — новата стъпка (вече записана), иначе null. */
async function checkTotp(user: { id: string; totpSecretSealed: string | null; totpLastStep: number | null }, code: string) {
  const secret = await openTotpSecret(user);
  if (!secret) return null;
  const step = verifyTotp(secret, code, { lastStep: user.totpLastStep });
  if (step === null) return null;
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1 ? step : null;
}

export type CodesState = { codes?: string[]; error?: string };

// --- 2FA: записване -----------------------------------------------------------

export async function startTotpEnrollAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user } = await requireActive(locale);
  if (user.totpEnabledAt) redirect(page(locale));
  if (!canSeal()) redirect(page(locale, '?error=nokey'));
  await prisma.user.update({
    where: { id: user.id },
    data: { totpPendingSealed: seal(newTotpSecret(), sealContext.totpPending(user.id)) },
  });
  redirect(page(locale, '?step=scan'));
}

export async function cancelTotpEnrollAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user } = await requireActive(locale);
  await prisma.user.update({ where: { id: user.id }, data: { totpPendingSealed: null } });
  redirect(page(locale));
}

/** Потвърждение с код → 2FA включена + 10 резервни кода (показват се веднъж). */
export async function confirmTotpEnrollAction(_prev: CodesState, formData: FormData): Promise<CodesState> {
  const locale = localeFrom(formData);
  const { user, session } = await requireActive(locale);
  if (!rateLimit(`mfa-enroll:${user.id}`, 10, 15 * 60_000)) return { error: 'rate' };
  // Вече включена (състезание с друго записване) → без подмяна на секрета без стария фактор.
  if (user.totpEnabledAt || !user.totpPendingSealed) return { error: 'expired' };
  const secret = openSealed(user.totpPendingSealed, sealContext.totpPending(user.id));
  const code = String(formData.get('code') ?? '');
  const step = secret ? verifyTotp(secret, code) : null;
  if (!secret || step === null) return { error: 'code' };
  const codes = newBackupCodes();
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, totpEnabledAt: null, totpPendingSealed: user.totpPendingSealed },
    data: {
      totpSecretSealed: seal(secret, sealContext.totp(user.id)),
      totpPendingSealed: null,
      totpEnabledAt: new Date(),
      totpLastStep: step,
      backupCodeHashes: codes.map(hashBackupCode),
    },
  });
  if (count !== 1) return { error: 'expired' };
  // Новата защита важи веднага: другите устройства излизат, тази сесия е потвърдена.
  await revokeOtherSessions(user.id);
  await markSessionMfa(session.id);
  await recordSecurityEvent('mfa.enabled', { userId: user.id });
  await notifyUserSecurity(user, 'mfa-on');
  if (isAdminEmail(user.email)) await notifyAdmins('2FA включена за админ акаунт', [`Акаунт: ${user.email}`]).catch(() => false);
  return { codes };
}

export async function regenerateBackupCodesAction(_prev: CodesState, formData: FormData): Promise<CodesState> {
  const locale = localeFrom(formData);
  const { user, session } = await requireActive(locale);
  if (!user.totpEnabledAt) return { error: 'off' };
  if (!rateLimit(`mfa:${user.id}`, 5, 15 * 60_000)) return { error: 'rate' };
  if ((await checkTotp(user, String(formData.get('code') ?? ''))) === null) {
    await recordSecurityEvent('mfa.failed', { userId: user.id, meta: { where: 'regenerate' } });
    return { error: 'code' };
  }
  const codes = newBackupCodes();
  await prisma.user.update({ where: { id: user.id }, data: { backupCodeHashes: codes.map(hashBackupCode) } });
  await markSessionMfa(session.id);
  await recordSecurityEvent('mfa.backup_regenerated', { userId: user.id });
  await notifyUserSecurity(user, 'backup-new');
  return { codes };
}

/** Изключване: парола + код (или резервен код). Другите устройства излизат. */
export async function disableTotpAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user } = await requireActive(locale);
  if (!user.totpEnabledAt) redirect(page(locale));
  if (!rateLimit(`mfa:${user.id}`, 5, 15 * 60_000)) redirect(page(locale, '?error=rate'));
  const code = String(formData.get('code') ?? '');
  const passwordOk = await verifyPassword(user, String(formData.get('password') ?? ''));
  const codeOk = (await checkTotp(user, code)) !== null || matchBackupCode(code, user.backupCodeHashes) >= 0;
  if (!passwordOk || !codeOk) {
    await recordSecurityEvent('mfa.failed', { userId: user.id, meta: { where: 'disable' } });
    redirect(page(locale, '?error=disable'));
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretSealed: null, totpPendingSealed: null, totpEnabledAt: null, totpLastStep: null, backupCodeHashes: [] },
  });
  await revokeOtherSessions(user.id);
  await recordSecurityEvent('mfa.disabled', { userId: user.id });
  await notifyUserSecurity(user, 'mfa-off');
  if (isAdminEmail(user.email)) {
    await notifyAdmins('2FA ИЗКЛЮЧЕНА за админ акаунт', [`Акаунт: ${user.email}`, 'Админ достъпът е спрян до ново включване.']).catch(() => false);
  }
  redirect(page(locale, '?ok=mfa-off'));
}

// --- Парола и сесии -----------------------------------------------------------

const newPassword = z.string().min(10).max(200);

export async function changePasswordAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user } = await requireActive(locale);
  if (!rateLimit(`reset-pw:${user.id}`, 5, 15 * 60_000)) redirect(page(locale, '?error=rate'));
  const next = newPassword.safeParse(formData.get('next'));
  if (!next.success || next.data !== String(formData.get('confirm') ?? '')) redirect(page(locale, '?error=password'));
  if (!(await verifyPassword(user, String(formData.get('current') ?? '')))) redirect(page(locale, '?error=current'));
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next.data) } });
  const revoked = await revokeOtherSessions(user.id);
  await recordSecurityEvent('password.changed', { userId: user.id, meta: { revoked } });
  await notifyUserSecurity(user, 'password');
  redirect(page(locale, '?ok=password'));
}

/** Изход от всички устройства — включително това. */
export async function logoutEverywhereAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user } = await requireActive(locale);
  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });
  await destroySession();
  await recordSecurityEvent('sessions.revoked', { userId: user.id, meta: { count } });
  await notifyUserSecurity(user, 'sessions');
  redirect(`/${locale}/login?ok=signedout`);
}

export async function resendVerificationAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user } = await requireActive(locale);
  if (user.emailVerifiedAt) redirect(page(locale));
  if (!rateLimit(`verify-mail:${user.id}`, 3, 60 * 60_000)) redirect(page(locale, '?error=rate'));
  const sent = await sendVerificationEmail(user);
  redirect(page(locale, sent ? '?ok=sent' : '?error=email'));
}

// --- Step-up (админ) ------------------------------------------------------------

/** Пресен 2FA код за опасни админ действия (и за сесия без 2FA). */
export async function stepUpAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const { user, session } = await requireActive(locale);
  if (!isAdminEmail(user.email) || !user.totpEnabledAt) redirect(page(locale, '?need=admin2fa'));
  if (!rateLimit(`stepup:${user.id}`, 5, 15 * 60_000)) redirect(`/${locale}/admin/step-up?error=rate`);
  if ((await checkTotp(user, String(formData.get('code') ?? ''))) === null) {
    await recordSecurityEvent('stepup.failed', { userId: user.id });
    await alertAtThreshold({ name: 'admin-stepup-failed', key: user.id, threshold: 1 }, 1, 'Грешен код за потвърждение в админ акаунт', [
      `Акаунт: ${user.email}`,
      'Някой с активна админ сесия въведе грешен 2FA код за опасно действие.',
    ]);
    redirect(`/${locale}/admin/step-up?error=code`);
  }
  await markSessionMfa(session.id);
  await recordSecurityEvent('stepup.ok', { userId: user.id });
  redirect(`/${locale}/admin`);
}
