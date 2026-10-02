import type { LoginOutcome, User } from '@prisma/client';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { decryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { fingerprintHash } from '../auth/device.js';
import { dummyHash, hashPassword, needsRehash, verifyPassword } from '../auth/password.js';
import { consumeRecoveryCode } from '../auth/recovery.js';
import { createSession, markMfaPassed, type NewSession } from '../auth/sessions.js';
import { verifyTotp } from '../auth/totp.js';
import type { RequestMeta } from '../http/meta.js';
import { claimTotpStep, customerActor, emailSchema, recordLogin } from './auth-common.js';
import {
  countDeviceLogin,
  isNewDeviceForAccount,
  touchDevice,
  type DeviceContext,
} from './devices.js';
import { mailCodeFailures } from '../mail/templates.js';
import { isLocale } from '../i18n.js';
import { notifyNewDevice } from './notify.js';
import { resendVerification } from './registration.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES = 20;
const MAX_MFA_FAILURES = 5;

/* -------------------------------------- вход -------------------------------------- */

export type LoginResult =
  | { kind: 'ok'; user: User; session: NewSession; mfaRequired: boolean }
  | { kind: 'invalid' }
  | { kind: 'throttled' }
  | { kind: 'banned'; reason: string }
  | { kind: 'unverified'; resent: boolean };

/**
 * Грешна парола или грешен код. Броячът расте атомно в базата — паралелни опити не могат да прочетат
 * една и съща стойност и да го заобиколят. На петия неуспех акаунтът се заключва за 15 минути; заключва
 * го точно една от заявките, тя пише и в одита.
 */
async function countFailure(
  user: User,
  meta: RequestMeta,
): Promise<{ count: number; locked: boolean; lockedNow: boolean }> {
  const { failedLogins } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  if (failedLogins < MAX_FAILED_LOGINS)
    return { count: failedLogins, locked: false, lockedNow: false };
  const lock = await prisma.user.updateMany({
    where: { id: user.id, failedLogins: { gte: MAX_FAILED_LOGINS } },
    data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  if (lock.count === 1)
    await audit(customerActor(user, meta), {
      action: 'auth.locked',
      targetType: 'user',
      targetId: user.id,
    });
  return { count: failedLogins, locked: true, lockedNow: lock.count === 1 };
}

/** Колко неуспешни опита е имало от това IP в последните 15 минути. */
async function ipFailures(ip: string | null): Promise<number> {
  if (!ip) return 0;
  return prisma.loginEvent.count({
    where: {
      ip,
      createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) },
      outcome: { in: ['BAD_PASSWORD', 'UNKNOWN_EMAIL', 'LOCKED', 'MFA_FAILED'] },
    },
  });
}

/**
 * Вход с имейл и парола. Непознат имейл, грешна парола и заключен акаунт дават ЕДНО И СЪЩО
 * съобщение. Причината за бан се показва само след вярна парола — тя е доказателство, че това е
 * собственикът на акаунта.
 */
export async function attemptLogin(
  rawEmail: string,
  password: string,
  meta: RequestMeta,
  device: DeviceContext,
): Promise<LoginResult> {
  const fp = device.fingerprint ? fingerprintHash(device.fingerprint) : null;
  if ((await ipFailures(meta.ip)) >= IP_MAX_FAILURES) {
    await recordLogin('THROTTLED', meta, { fingerprint: fp });
    return { kind: 'throttled' };
  }
  const email = emailSchema.safeParse(rawEmail);
  const user = email.success
    ? await prisma.user.findUnique({ where: { email: email.data } })
    : null;
  if (!user) {
    await verifyPassword(password, await dummyHash());
    await recordLogin('UNKNOWN_EMAIL', meta, { fingerprint: fp });
    return { kind: 'invalid' };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyPassword(password, await dummyHash());
    await recordLogin('LOCKED', meta, { userId: user.id, fingerprint: fp });
    return { kind: 'invalid' };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await countFailure(user, meta);
    await recordLogin('BAD_PASSWORD', meta, { userId: user.id, fingerprint: fp });
    return { kind: 'invalid' };
  }

  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
  }
  if (user.bannedAt) {
    await recordLogin('BANNED', meta, { userId: user.id, fingerprint: fp });
    return { kind: 'banned', reason: user.banReason ?? '' };
  }
  if (!user.emailVerifiedAt) {
    await recordLogin('UNVERIFIED', meta, { userId: user.id, fingerprint: fp });
    return { kind: 'unverified', resent: await resendVerification(user) };
  }

  const mfaRequired = Boolean(user.totpEnabledAt);
  // С двуфакторна защита броячът пада едва след верния код: самата парола не изчиства опитите с кодове.
  if (!mfaRequired)
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  const dev = await touchDevice(user.id, device, meta);
  const session = await createSession(
    user,
    { ip: meta.ip, country: meta.country, userAgent: meta.userAgent, deviceId: dev.id },
    { mfaPassed: !mfaRequired },
  );
  if (!mfaRequired) await finishLogin(user, dev.id, meta, 'SUCCESS');
  return { kind: 'ok', user, session, mfaRequired };
}

/** Успешен вход до край: запис, последен вход, писмо при ново устройство, одит. */
async function finishLogin(
  user: User,
  deviceId: string,
  meta: RequestMeta,
  outcome: LoginOutcome,
): Promise<void> {
  const dev = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
  const isNew = await isNewDeviceForAccount(dev, user.signupDeviceHash);
  await countDeviceLogin(dev.id);
  await recordLogin(outcome, meta, {
    userId: user.id,
    deviceId: dev.id,
    fingerprint: dev.fingerprintHash,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: meta.ip, lastLoginCountry: meta.country },
  });
  if (isNew) void notifyNewDevice(user, dev, meta);
  await audit(customerActor(user, meta), {
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
  });
}

/* -------------------------------- втори фактор при вход -------------------------------- */

export type MfaResult =
  { kind: 'ok'; recovery: boolean } | { kind: 'invalid'; left: number } | { kind: 'reset' };

/**
 * Кодът от приложението или резервен код. Грешните кодове се броят към акаунта заедно с грешните пароли:
 * на петия входът спира за 15 минути и човекът получава писмо — паролата му явно е известна на друг.
 * Нова сесия с паролата не дава нови опити.
 */
export async function completeMfa(
  sessionId: string,
  input: string,
  meta: RequestMeta,
): Promise<MfaResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.mfaPassed) return { kind: 'reset' };
  const user = session.user;
  if (!user.totpSecretEnc || !user.totpEnabledAt) return { kind: 'reset' };
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    // заключен междувременно (например от паралелен опит) — и този недовършен вход пада
    await prisma.session.deleteMany({ where: { id: session.id } });
    return { kind: 'reset' };
  }

  const code = input.trim();
  let recovery = false;
  let step: number | null = null;
  if (/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
    step = verifyTotp(decryptSecret(user.totpSecretEnc, config().ENC_KEY), code, user.totpLastStep);
  } else if (await consumeRecoveryCode(user.id, code)) {
    recovery = true;
  }

  // същият код, вече приет в паралелна заявка, не минава втори път
  if (step !== null && !(await claimTotpStep(user.id, step))) step = null;

  if (step === null && !recovery) {
    await recordLogin('MFA_FAILED', meta, { userId: user.id, deviceId: session.deviceId });
    const account = await countFailure(user, meta);
    const touched = await prisma.session.updateMany({
      where: { id: session.id },
      data: { mfaFailures: { increment: 1 } },
    });
    const failures = session.mfaFailures + 1;
    if (touched.count === 0 || account.locked || failures >= MAX_MFA_FAILURES) {
      await prisma.session.deleteMany({ where: { id: session.id } });
      await audit(customerActor(user, meta), {
        action: 'auth.mfa.reset',
        targetType: 'user',
        targetId: user.id,
      });
      if (account.lockedNow)
        void mailCodeFailures(user.email, isLocale(user.locale) ? user.locale : 'bg', user.name);
      return { kind: 'reset' };
    }
    return {
      kind: 'invalid',
      left: Math.min(MAX_MFA_FAILURES - failures, MAX_FAILED_LOGINS - account.count),
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });
  await markMfaPassed(session.id, user.role);
  if (session.deviceId)
    await finishLogin(user, session.deviceId, meta, recovery ? 'MFA_RECOVERY' : 'SUCCESS');
  if (recovery) {
    await audit(customerActor(user, meta), {
      action: 'auth.recovery.used',
      targetType: 'user',
      targetId: user.id,
    });
  }
  return { kind: 'ok', recovery };
}
