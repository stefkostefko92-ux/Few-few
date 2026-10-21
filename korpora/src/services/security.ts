import type { User } from '@prisma/client';
import { audit, audited, SYSTEM_ACTOR } from '../audit.js';
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
  MAIL_CAP_PER_HOUR,
  peekEmailToken,
  recentTokenCount,
  revokeEmailTokens,
} from '../auth/tokens.js';
import { generateTotpSecret, verifyTotp } from '../auth/totp.js';
import { accountLocale } from '../i18n.js';
import type { RequestMeta } from '../http/meta.js';
import {
  greetingName,
  mailChangeEmail,
  mailEmailChangeNotice,
  mailPasswordChanged,
  mailResetPassword,
  mailTwoFactor,
} from '../mail/templates.js';
import { HOUR } from '../time.js';
import { customerActor, emailSchema, newPasswordProblem } from './auth-common.js';
import { reauthCode, reauthPassword } from './reauth.js';
import { markEmailVerified } from './registration.js';
import { totpSetupView, type TotpSetup } from './totp-setup.js';

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
  const passwordHash = await hashPassword(next);
  // Едно цяло: сменена парола с оцелели чужди сесии или връзки е по-лошо от несменена.
  await audited(
    customerActor(user, meta),
    async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await destroyAllSessions(user.id, sessionId, tx);
      // връзка за нова парола или за смяна на имейла, поискана преди това, вече не върши работа
      await revokeEmailTokens(user.id, ['RESET_PASSWORD', 'CHANGE_EMAIL'], tx);
    },
    { action: 'auth.password.changed', targetType: 'user', targetId: user.id },
  );
  void mailPasswordChanged(user.email, accountLocale(user), greetingName(user));
  return { ok: true };
}

/** Писмо за нова парола. Отговорът към формата е еднакъв, независимо дали имейлът съществува. */
export async function requestPasswordReset(rawEmail: string, meta: RequestMeta): Promise<void> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return;
  const user = await prisma.user.findUnique({ where: { email: email.data } });
  if (!user || user.bannedAt) return;
  if ((await recentTokenCount(user.id, 'RESET_PASSWORD', HOUR)) >= MAIL_CAP_PER_HOUR) return;
  const token = await issueEmailToken(user.id, 'RESET_PASSWORD');
  void mailResetPassword(user.email, accountLocale(user), greetingName(user), token);
  // Заявката е на непознат, не непременно на собственика: системата записва, IP-то е на заявителя.
  await audit(
    { ...SYSTEM_ACTOR, ip: meta.ip },
    {
      action: 'auth.reset.requested',
      targetType: 'user',
      targetId: user.id,
    },
  );
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
  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    });
    await destroyAllSessions(user.id, undefined, tx);
    await revokeEmailTokens(user.id, undefined, tx);
  });
  await markEmailVerified(user, meta);
  await audit(customerActor(user, meta), {
    action: 'auth.password.reset',
    targetType: 'user',
    targetId: user.id,
  });
  void mailPasswordChanged(user.email, accountLocale(user), greetingName(user));
  return { ok: true };
}

/* ------------------------------- втори фактор (TOTP) ------------------------------- */

export type TotpStart = { ok: true; setup: TotpSetup } | { ok: false; key: string };

/**
 * Започва настройка: тайната се пази криптирана, но не е активна, докато кодът не бъде потвърден. Иска
 * паролата — иначе чужда (открадната) сесия би включила 2FA със свое приложение, а собственикът не би
 * могъл да влезе: новата парола по имейл не маха втория фактор.
 */
export async function startTotp(
  user: User,
  password: string,
  meta: RequestMeta,
): Promise<TotpStart> {
  if (user.totpEnabledAt) return { ok: false, key: 'flash.twoFactorAlreadyOn' };
  const denied = await reauthPassword(user, password, meta);
  if (denied) return { ok: false, key: denied };
  const secret = generateTotpSecret();
  // само докато 2FA не е включена: паралелно потвърждение не се подменя с нова тайна
  const started = await prisma.user.updateMany({
    where: { id: user.id, totpEnabledAt: null },
    data: { totpSecretEnc: encryptSecret(secret, config().ENC_KEY), totpLastStep: null },
  });
  if (started.count !== 1) return { ok: false, key: 'flash.twoFactorAlreadyOn' };
  return { ok: true, setup: await totpSetupView(user, secret) };
}

export type TotpConfirm = { ok: true; codes: string[] } | { ok: false; key: string };

/** Включва 2FA и връща резервните кодове (показват се веднъж). */
export async function confirmTotp(
  user: User,
  code: string,
  meta: RequestMeta,
): Promise<TotpConfirm> {
  if (user.totpEnabledAt) return { ok: false, key: 'flash.twoFactorAlreadyOn' };
  if (!user.totpSecretEnc) return { ok: false, key: 'flash.codeMismatch' };
  const step = verifyTotp(decryptSecret(user.totpSecretEnc, config().ENC_KEY), code, null);
  if (step === null) return { ok: false, key: 'flash.codeMismatch' };
  // Включва я само една заявка и само с тайната, показана на човека: при двойно изпращане втората не
  // издава втори комплект кодове — иначе на екрана биха останали кодове, които вече ги няма в базата.
  const enabled = await prisma.user.updateMany({
    where: { id: user.id, totpEnabledAt: null, totpSecretEnc: user.totpSecretEnc },
    data: { totpEnabledAt: new Date(), totpLastStep: step },
  });
  if (enabled.count !== 1) return { ok: false, key: 'flash.twoFactorAlreadyOn' };
  const codes = await issueRecoveryCodes(user.id);
  await audit(customerActor(user, meta), {
    action: 'auth.totp.enabled',
    targetType: 'user',
    targetId: user.id,
  });
  void mailTwoFactor(user.email, accountLocale(user), greetingName(user), true);
  return { ok: true, codes };
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
  // вече изключена (двоен клик, повторно изпращане): нищо не се пише в одита и писмо не тръгва
  if (!user.totpEnabledAt) return { ok: true };
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
  void mailTwoFactor(user.email, accountLocale(user), greetingName(user), false);
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
  if (asked >= MAIL_CAP_PER_HOUR) return { ok: false, key: 'error.tooMany' };
  // Зает адрес не се издава: писмо не тръгва, но отговорът е същият.
  const taken = await prisma.user.findUnique({ where: { email: email.data } });
  if (!taken) {
    const token = await issueEmailToken(user.id, 'CHANGE_EMAIL', email.data);
    void mailChangeEmail(email.data, accountLocale(user), token);
  }
  // Старият адрес научава винаги — смяна с откраднатата парола не минава тихо.
  void mailEmailChangeNotice(user.email, accountLocale(user), greetingName(user), email.data);
  await audit(customerActor(user, meta), {
    action: 'account.email.change.requested',
    targetType: 'user',
    targetId: user.id,
  });
  return { ok: true };
}
