import type { Device } from '@prisma/client';
import { prisma } from '../db.js';
import {
  deviceCookieHash,
  deviceSummary,
  fingerprintHash,
  type Fingerprint,
} from '../auth/device.js';
import type { RequestMeta } from '../http/meta.js';

export interface DeviceContext {
  cookieId: string;
  fingerprint: Fingerprint | null;
}

/** Записва (или обновява) устройството на акаунта при вход с вярна парола. */
export async function touchDevice(
  userId: string,
  ctx: DeviceContext,
  meta: RequestMeta,
): Promise<Device> {
  const cookieHash = deviceCookieHash(ctx.cookieId);
  const fpHash = ctx.fingerprint ? fingerprintHash(ctx.fingerprint) : null;
  const summary = deviceSummary(ctx.fingerprint, meta.userAgent);
  return prisma.device.upsert({
    where: { userId_cookieHash: { userId, cookieHash } },
    create: {
      userId,
      cookieHash,
      fingerprintHash: fpHash,
      summary,
      userAgent: meta.userAgent,
      lastIp: meta.ip,
      lastCountry: meta.country,
    },
    update: {
      // Отпечатък без данни (изключен JavaScript) не трие стария.
      ...(fpHash ? { fingerprintHash: fpHash } : {}),
      summary,
      userAgent: meta.userAgent,
      lastSeenAt: new Date(),
      lastIp: meta.ip,
      lastCountry: meta.country,
    },
  });
}

/**
 * Първи успешен вход от това устройство на акаунт, който вече е влизал от друго — тогава човекът
 * получава писмо. Първият вход изобщо (след регистрация) не е „ново устройство“.
 */
export async function isNewDeviceForAccount(
  device: Device,
  signupDeviceHash: string | null,
): Promise<boolean> {
  if (device.loginCount > 0) return false;
  if (signupDeviceHash && signupDeviceHash === device.cookieHash) return false;
  const others = await prisma.device.count({
    where: { userId: device.userId, id: { not: device.id }, loginCount: { gt: 0 } },
  });
  return others > 0;
}

export async function countDeviceLogin(deviceId: string): Promise<void> {
  await prisma.device.update({
    where: { id: deviceId },
    data: { loginCount: { increment: 1 }, lastSeenAt: new Date() },
  });
}
