import type { Prisma, User } from '@prisma/client';
import { audited } from '../audit.js';
import { LEGAL_UPDATED } from '../company.js';
import { prisma } from '../db.js';
import { deviceCookieHash, deviceSummary } from '../auth/device.js';
import type { RequestMeta } from '../http/meta.js';
import { customerActor } from './auth-common.js';

/**
 * Съгласието за отпечатъка на устройството. Отпечатъкът и бисквитката на устройството служат на
 * целите на доставчика — откриване на повторни тестови периоди и на споделени акаунти — само със
 * съгласие: отделна, неотметната отметка при регистрация. Без него отпечатък не се взема и не се
 * пази, а свързаните акаунти не ползват устройството и отпечатъка на човека. Тестовият период не
 * зависи от съгласието; сигурността на входа (познато устройство, писмо за нов вход, заключване) е
 * строго необходима и остава за всички.
 */

/** Версията на текста, на който се дава съгласието: датата на политиката за поверителност. */
export const DEVICE_CONSENT_VERSION: string = LEGAL_UPDATED.privacy;

/** Акаунтите със съгласие — само те се свързват по устройство и отпечатък. */
export const CONSENTED = { deviceConsentAt: { not: null } } satisfies Prisma.UserWhereInput;

/** Полетата на акаунта при регистрация с отметната отметка: кога и на коя версия на текста. */
export function consentGiven(now = new Date()): {
  deviceConsentAt: Date;
  deviceConsentVersion: string;
} {
  return { deviceConsentAt: now, deviceConsentVersion: DEVICE_CONSENT_VERSION };
}

/**
 * Дали формата за вход в този браузър да чете отпечатъка. Кой влиза, още не се знае, затова решава
 * браузърът: от него трябва да са се регистрирали или влизали само акаунти със съгласие. Непознат
 * браузър или браузър, ползван и от акаунт без съгласие — не. Сървърът и без това пази отпечатъка
 * само на акаунт със съгласие (`attemptLogin`).
 */
export async function signInMayReadFingerprint(cookieId: string | null): Promise<boolean> {
  if (!cookieId) return false;
  const hash = deviceCookieHash(cookieId);
  const fromBrowser: Prisma.UserWhereInput = {
    OR: [{ signupDeviceHash: hash }, { devices: { some: { cookieHash: hash } } }],
  };
  const [consenting, without] = await Promise.all([
    prisma.user.count({ where: { AND: [fromBrowser, CONSENTED] } }),
    prisma.user.count({ where: { AND: [fromBrowser, { deviceConsentAt: null }] } }),
  ]);
  return consenting > 0 && without === 0;
}

/**
 * Изтрива пазения отпечатък на човека: от регистрацията, от устройствата му (описанието остава само
 * система и браузър) и от историята на входовете. Бисквитката на устройството остава — тя е за
 * сигурността на входа.
 */
async function forgetFingerprints(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { signupFingerprint: null } });
  const devices = await tx.device.findMany({
    where: { userId },
    select: { id: true, userAgent: true },
  });
  for (const device of devices) {
    await tx.device.update({
      where: { id: device.id },
      data: { fingerprintHash: null, summary: deviceSummary(null, device.userAgent) },
    });
  }
  await tx.loginEvent.updateMany({
    where: { userId, fingerprintHash: { not: null } },
    data: { fingerprintHash: null },
  });
}

/**
 * Оттегляне от „Сигурност“: едно натискане, както се дава с една отметка. Съгласието и пазеният
 * отпечатък се изтриват заедно; повторно натискане не пише нищо в одита.
 */
export async function withdrawDeviceConsent(user: User, meta: RequestMeta): Promise<void> {
  await audited(
    customerActor(user, meta),
    async (tx) => {
      const cleared = await tx.user.updateMany({
        where: { id: user.id, ...CONSENTED },
        data: { deviceConsentAt: null, deviceConsentVersion: null },
      });
      await forgetFingerprints(tx, user.id);
      return cleared.count > 0;
    },
    (withdrawn) =>
      withdrawn
        ? {
            action: 'account.deviceConsent.withdrawn',
            targetType: 'user',
            targetId: user.id,
            detail: { version: user.deviceConsentVersion },
          }
        : null,
  );
}

/**
 * Поддръжката: отпечатък на акаунт без съгласие не се пази — нито взетият преди отметката, нито
 * случайно дошъл. Отпечатък от опит за вход без акаунт — също. Връща колко записа е почистила.
 */
export async function purgeUnconsentedFingerprints(): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      deviceConsentAt: null,
      OR: [
        { signupFingerprint: { not: null } },
        { devices: { some: { fingerprintHash: { not: null } } } },
        { logins: { some: { fingerprintHash: { not: null } } } },
      ],
    },
    select: { id: true },
    take: 500,
  });
  for (const user of users) await prisma.$transaction((tx) => forgetFingerprints(tx, user.id));
  const anonymous = await prisma.loginEvent.updateMany({
    where: { userId: null, fingerprintHash: { not: null } },
    data: { fingerprintHash: null },
  });
  return users.length + anonymous.count;
}
