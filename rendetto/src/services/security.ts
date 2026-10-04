import type { User } from '@prisma/client';
import QRCode from 'qrcode';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { issueRecoveryCodes } from '../auth/recovery.js';
import { isStaff } from '../auth/rbac.js';
import { destroyAllSessions } from '../auth/sessions.js';
import {
  consumeEmailToken,
  issueEmailToken,
  peekEmailToken,
  recentTokenCount,
  revokeEmailTokens,
} from '../auth/tokens.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../auth/totp.js';
import { isLocale, type Locale } from '../i18n.js';
import type { RequestMeta } from '../http/meta.js';
import {
  greetingName,
  mailChangeEmail,
  mailEmailChangeNotice,
  mailPasswordChanged,
  mailResetPassword,
  mailTwoFactor,
} from '../mail/templates.js';
import { customerActor, emailSchema, newPasswordProblem } from './auth-common.js';
import { reauthCode, reauthPassword } from './reauth.js';
import { markEmailVerified } from './registration.js';

const HOUR = 60 * 60 * 1000;

function localeOf(user: User): Locale {
  return isLocale(user.locale) ? user.locale : 'bg';
}

/* ----------------------------------- пароли ----------------------------------- */

export type PasswordChange = { ok: true } | { ok: false; key: string };

export async function changePassword(
  user: User,
  current: string,
  next: string,
  sessionId: string,
  meta: RequestMeta,
): Promise<PasswordChange> {
  const denied = await reauthPassword(user, current, meta);
  if (denied) return { ok: false, key: denied };
  const problem = await newPasswordProblem(next, [user.email, user.name]);
  if (problem) return { ok: false, key: problem };
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  await destroyAllSessions(user.id, sessionId);
  // връзка за нова парола или за смяна на имейла, поискана преди това, вече не върши работа
  await revokeEmailTokens(user.id, ['RESET_PASSWORD', 'CHANGE_EMAIL']);
  await audit(customerActor(user, meta), {
    action: 'auth.password.changed',
    targetType: 'user',
    targetId: user.id,
  });
  void mailPasswordChanged(user.email, localeOf(user), greetingName(user));
  return { ok: true };
}

/** Писмо за нова парола. Отговорът към формата е еднакъв, независимо дали имейлът съществува. */
export async function requestPasswordReset(rawEmail: string, meta: RequestMeta): Promise<void> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return;
  const user = await prisma.user.findUnique({ where: { email: email.data } });
  if (!user || user.bannedAt) return;
  if ((await recentTokenCount(user.id, 'RESET_PASSWORD', HOUR)) >= 3) return;
  const token = await issueEmailToken(user.id, 'RESET_PASSWORD');
  void mailResetPassword(user.email, localeOf(user), greetingName(user), token);
  await audit(customerActor(user, meta), {
    action: 'auth.reset.requested',
    targetType: 'user',
    targetId: user.id,
  });
}

export async function resetTokenValid(token: string): Promise<boolean> {
  return (await peekEmailToken(token, 'RESET_PASSWORD')) !== null;
}

/** Нова парола по връзка: всички сесии падат, заключването се маха. Вторият фактор остава. */
export async function resetPassword(
  token: string,
  next: string,
  meta: RequestMeta,
): Promise<PasswordChange> {
  const row = await peekEmailToken(token, 'RESET_PASSWORD');
  if (!row) return { ok: false, key: 'auth.errors.linkExpired' };
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user) return { ok: false, key: 'auth.errors.linkExpired' };
  const problem = await newPasswordProblem(next, [user.email, user.name]);
  if (problem) return { ok: false, key: problem };
  if (!(await consumeEmailToken(token, 'RESET_PASSWORD')))
    return { ok: false, key: 'auth.errors.linkExpired' };
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), failedLogins: 0, lockedUntil: null },
  });
  await markEmailVerified(user, meta);
  await destroyAllSessions(user.id);
  await revokeEmailTokens(user.id);
  await audit(customerActor(user, meta), {
    action: 'auth.password.reset',
    targetType: 'user',
    targetId: user.id,
  });
  void mailPasswordChanged(user.email, localeOf(user), greetingName(user));
  return { ok: true };
}

/* ------------------------------- втори фактор (TOTP) ------------------------------- */

export interface TotpSetup {
  secret: string;
  qrDataUrl: string;
}

/** Започва настройка: тайната се пази криптирана, но не е активна, докато кодът не бъде потвърден. */
export async function startTotp(user: User): Promise<TotpSetup | null> {
  if (user.totpEnabledAt) return null;
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecretEnc: encryptSecret(secret, config().ENC_KEY),
      totpEnabledAt: null,
      totpLastStep: null,
    },
  });
  const url = otpauthUrl(config().TOTP_ISSUER, user.email, secret);
  return { secret, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 232 }) };
}

/** Връща резервните кодове (показват се веднъж) или null при грешен код. */
export async function confirmTotp(
  user: User,
  code: string,
  meta: RequestMeta,
): Promise<string[] | null> {
  if (user.totpEnabledAt || !user.totpSecretEnc) return null;
  const step = verifyTotp(decryptSecret(user.totpSecretEnc, config().ENC_KEY), code, null);
  if (step === null) return null;
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastStep: step },
  });
  const codes = await issueRecoveryCodes(user.id);
  await audit(customerActor(user, meta), {
    action: 'auth.totp.enabled',
    targetType: 'user',
    targetId: user.id,
  });
  void mailTwoFactor(user.email, localeOf(user), greetingName(user), true);
  return codes;
}

export type TotpDisable = { ok: true } | { ok: false; key: string };

/** Изключване: парола + код. За персонала вторият фактор е задължителен и не се изключва. */
export async function disableTotp(
  user: User,
  password: string,
  code: string,
  meta: RequestMeta,
): Promise<TotpDisable> {
  if (isStaff(user.role)) return { ok: false, key: 'flash.staffKeeps2fa' };
  const denied =
    (await reauthPassword(user, password, meta)) ?? (await reauthCode(user, code, meta));
  if (denied) return { ok: false, key: denied };
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit(customerActor(user, meta), {
    action: 'auth.totp.disabled',
    targetType: 'user',
    targetId: user.id,
  });
  void mailTwoFactor(user.email, localeOf(user), greetingName(user), false);
  return { ok: true };
}

export type RecoveryCodes = { ok: true; codes: string[] } | { ok: false; key: string };

export async function regenerateRecoveryCodes(
  user: User,
  code: string,
  meta: RequestMeta,
): Promise<RecoveryCodes> {
  if (!user.totpEnabledAt) return { ok: false, key: 'flash.wrongCode' };
  const denied = await reauthCode(user, code, meta);
  if (denied) return { ok: false, key: denied };
  const codes = await issueRecoveryCodes(user.id);
  await audit(customerActor(user, meta), {
    action: 'auth.recovery.regenerated',
    targetType: 'user',
    targetId: user.id,
  });
  return { ok: true, codes };
}

/* ------------------------------------ имейл ------------------------------------ */

export type EmailChange = { ok: true } | { ok: false; key: string };

/** Смяна на имейла: връзка до НОВИЯ адрес; старият остава, докато новият не бъде потвърден. */
export async function requestEmailChange(
  user: User,
  rawEmail: string,
  password: string,
  meta: RequestMeta,
): Promise<EmailChange> {
  const denied = await reauthPassword(user, password, meta);
  if (denied) return { ok: false, key: denied };
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success || email.data === user.email) return { ok: false, key: 'auth.errors.email' };
  // Таванът брои ИСКАНИЯТА (одита), не пратените връзки: за зает адрес връзка не тръгва, и броят
  // на връзките би издал кой адрес вече има акаунт.
  const asked = await prisma.auditLog.count({
    where: {
      action: 'account.email.change.requested',
      targetId: user.id,
      at: { gte: new Date(Date.now() - HOUR) },
    },
  });
  if (asked >= 3) return { ok: false, key: 'error.tooMany' };
  // Зает адрес не се издава: писмо не тръгва, но отговорът е същият.
  const taken = await prisma.user.findUnique({ where: { email: email.data } });
  if (!taken) {
    const token = await issueEmailToken(user.id, 'CHANGE_EMAIL', email.data);
    void mailChangeEmail(email.data, localeOf(user), token);
  }
  // Старият адрес научава винаги — смяна с откраднатата парола не минава тихо.
  void mailEmailChangeNotice(user.email, localeOf(user), greetingName(user), email.data);
  await audit(customerActor(user, meta), {
    action: 'account.email.change.requested',
    targetType: 'user',
    targetId: user.id,
  });
  return { ok: true };
}
