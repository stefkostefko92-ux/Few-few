import type { User } from '@prisma/client';
import { audit, SYSTEM_ACTOR } from '../audit.js';
import { prisma } from '../db.js';
import { deviceCookieHash, fingerprintHash } from '../auth/device.js';
import { dummyHash, hashPassword, verifyPassword } from '../auth/password.js';
import {
  consumeEmailToken,
  HOUR,
  issueEmailToken,
  MAIL_CAP_PER_HOUR,
  recentTokenCount,
  revokeEmailTokens,
} from '../auth/tokens.js';
import { isLocale, type Locale } from '../i18n.js';
import type { RequestMeta } from '../http/meta.js';
import { LABEL } from '../labels.js';
import { greetingName, mailAlreadyRegistered, mailVerifyEmail } from '../mail/templates.js';
import { trialStart } from '../plans/plan.js';
import { customerActor, emailSchema, nameSchema, newPasswordProblem } from './auth-common.js';
import type { DeviceContext } from './devices.js';

/* ---------------------------------- регистрация ---------------------------------- */

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
  acceptTerms: boolean;
}

export type RegisterResult =
  { ok: true } | { ok: false; field: 'email' | 'name' | 'password' | 'terms'; key: string };

/**
 * Регистрация. Отговорът е ЕДНАКЪВ за нов и за вече регистриран имейл („провери пощата си“) —
 * формата не издава кой има акаунт. Тестовият период тръгва при потвърждаване на имейла.
 */
export async function registerAccount(
  input: RegisterInput,
  meta: RequestMeta,
  device: DeviceContext,
  locale: Locale,
): Promise<RegisterResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, field: 'email', key: 'auth.errors.email' };
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, field: 'name', key: 'auth.errors.name' };
  if (!input.acceptTerms) return { ok: false, field: 'terms', key: 'auth.errors.terms' };
  // Паролата се проверява преди имейла: слаба парола дава същия отговор за свободен и за зает адрес.
  const problem = await newPasswordProblem(input.password, [email.data, name.data]);
  if (problem) return { ok: false, field: 'password', key: problem };

  const existing = await prisma.user.findUnique({ where: { email: email.data } });
  if (existing) {
    // Същата работа по време като при нов акаунт; после писмо само до собственика на имейла.
    await dummyHash().then((hash) => verifyPassword(input.password, hash));
    if (!existing.emailVerifiedAt) {
      await resendVerification(existing);
      return { ok: true };
    }
    const recentNotices = await prisma.auditLog.count({
      where: {
        action: 'account.register.duplicate',
        targetId: existing.id,
        at: { gte: new Date(Date.now() - HOUR) },
      },
    });
    // Опитът е на непознат, не на собственика: системата записва, IP-то е на опитващия.
    await audit(
      { ...SYSTEM_ACTOR, ip: meta.ip },
      {
        action: 'account.register.duplicate',
        targetType: 'user',
        targetId: existing.id,
      },
    );
    if (recentNotices === 0) {
      const target = isLocale(existing.locale) ? existing.locale : locale;
      void mailAlreadyRegistered(existing.email, target, greetingName(existing));
    }
    return { ok: true };
  }

  const user = await prisma.user.create({
    data: {
      email: email.data,
      name: name.data,
      passwordHash: await hashPassword(input.password),
      locale,
      plan: 'TRIAL',
      planExpiresAt: null,
      signupIp: meta.ip,
      signupCountry: meta.country,
      signupDeviceHash: deviceCookieHash(device.cookieId),
      signupFingerprint: device.fingerprint ? fingerprintHash(device.fingerprint) : null,
    },
  });
  await prisma.planChange.create({
    data: { userId: user.id, actorLabel: LABEL.system, toPlan: 'TRIAL', note: LABEL.signup },
  });
  const token = await issueEmailToken(user.id, 'VERIFY_EMAIL');
  void mailVerifyEmail(user.email, locale, token);
  await audit(customerActor(user, meta), {
    action: 'account.registered',
    targetType: 'user',
    targetId: user.id,
  });
  return { ok: true };
}

/** Ново писмо за потвърждаване — най-много MAIL_CAP_PER_HOUR на час на акаунт. */
export async function resendVerification(user: User): Promise<boolean> {
  if (user.emailVerifiedAt) return false;
  if ((await recentTokenCount(user.id, 'VERIFY_EMAIL', HOUR)) >= MAIL_CAP_PER_HOUR) return false;
  const token = await issueEmailToken(user.id, 'VERIFY_EMAIL');
  const locale = isLocale(user.locale) ? user.locale : 'bg';
  void mailVerifyEmail(user.email, locale, token);
  return true;
}

/* ------------------------------ потвърждаване на имейл ------------------------------ */

export type VerifyResult =
  | { ok: true; kind: 'verified' | 'changed' }
  | { ok: true; kind: 'setPassword'; resetToken: string }
  | { ok: false };

/**
 * Отбелязва имейла като потвърден. При първото потвърждаване тръгват 30-те дни тестов период.
 * Вика се и от връзката за нова парола — получената връзка също доказва, че адресът е негов.
 */
export async function markEmailVerified(user: User, meta: RequestMeta): Promise<void> {
  if (user.emailVerifiedAt) return;
  const now = new Date();
  const trial = trialStart(user, now, { id: null, label: LABEL.system });
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: now, ...(trial ? { planExpiresAt: trial.planExpiresAt } : {}) },
    }),
    ...(trial ? [prisma.planChange.create({ data: trial.change })] : []),
  ]);
  await audit(customerActor(user, meta), {
    action: 'account.email.verified',
    targetType: 'user',
    targetId: user.id,
  });
}

/**
 * Потвърждава имейла по връзката от писмото (или смяната на имейл). `deviceHash` е устройството, на което
 * е отворена връзката.
 *
 * Връзката доказва пощата, не паролата. Отворена на устройство, различно от това на регистрацията,
 * тя може да е собственикът на адреса, който намира акаунт, създаден от друг с неговия имейл
 * (pre-hijacking): тогава паролата от регистрацията не оцелява — човекът задава своя веднага, а
 * имейлът се потвърждава с нея.
 */
export async function verifyEmailToken(
  token: string,
  meta: RequestMeta,
  deviceHash: string,
): Promise<VerifyResult> {
  const change = await consumeEmailToken(token, 'CHANGE_EMAIL');
  if (change?.newEmail) {
    const taken = await prisma.user.findUnique({ where: { email: change.newEmail } });
    if (taken) return { ok: false };
    const user = await prisma.user.update({
      where: { id: change.userId },
      data: { email: change.newEmail },
    });
    // връзки, пратени преди смяната (и до стария адрес), вече не вършат работа
    await revokeEmailTokens(user.id);
    await audit(customerActor(user, meta), {
      action: 'account.email.changed',
      targetType: 'user',
      targetId: user.id,
    });
    return { ok: true, kind: 'changed' };
  }
  const row = change ?? (await consumeEmailToken(token, 'VERIFY_EMAIL'));
  if (!row) return { ok: false };
  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user) return { ok: false };
  if (!user.emailVerifiedAt && user.signupDeviceHash !== deviceHash) {
    const resetToken = await issueEmailToken(user.id, 'RESET_PASSWORD');
    await audit(customerActor(user, meta), {
      action: 'account.email.verify.otherDevice',
      targetType: 'user',
      targetId: user.id,
    });
    return { ok: true, kind: 'setPassword', resetToken };
  }
  await markEmailVerified(user, meta);
  return { ok: true, kind: 'verified' };
}
