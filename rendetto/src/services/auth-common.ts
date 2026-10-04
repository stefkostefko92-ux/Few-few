import type { LoginOutcome } from '@prisma/client';
import { z } from 'zod';
import type { AuditActor } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isBreachedPassword } from '../auth/breached.js';
import { passwordProblem } from '../auth/password.js';
import { ipNetwork } from '../http/ip.js';
import type { RequestMeta } from '../http/meta.js';
import { customerLabel } from '../labels.js';
import { hasUnsafeChars } from './names.js';

export const emailSchema = z.string().trim().toLowerCase().max(254).email();

/**
 * Име на човек или фирма. Без адреси и връзки: името стига до писма и до панела, а не бива да носи
 * „кликни тук“ от чужда ръка.
 */
const LINK_LIKE =
  /(:\/\/|www\.|@|\bhttps?\b|\.(com|net|org|info|xyz|top|ru|bg|eu|io|me|link|click)\b)/i;

export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[^<>{}\n\r]+$/)
  .refine((value) => !hasUnsafeChars(value))
  .refine((value) => !LINK_LIKE.test(value));

export function customerActor(user: { id: string }, meta?: RequestMeta): AuditActor {
  return { type: 'HUMAN', id: user.id, label: customerLabel(user.id), ip: meta?.ip ?? null };
}

/** Проблем с новата парола като ключ от речника (`password.*`) или null. */
export async function newPasswordProblem(
  password: string,
  personal: Array<string | null | undefined>,
): Promise<string | null> {
  const problem = passwordProblem(password, personal);
  if (problem) return `password.${problem}`;
  if (config().BREACH_CHECK && (await isBreachedPassword(password)) === true)
    return 'password.breached';
  return null;
}

export async function recordLogin(
  outcome: LoginOutcome,
  meta: RequestMeta,
  extra: { userId?: string | null; deviceId?: string | null; fingerprint?: string | null } = {},
): Promise<void> {
  await prisma.loginEvent.create({
    data: {
      outcome,
      userId: extra.userId ?? null,
      deviceId: extra.deviceId ?? null,
      fingerprintHash: extra.fingerprint ?? null,
      ip: meta.ip,
      ipNet: ipNetwork(meta.ip),
      country: meta.country,
      userAgent: meta.userAgent,
    },
  });
}

/**
 * Кодът от приложението важи веднъж: стъпката се „заема“ атомно в базата — от паралелни заявки с един
 * и същ код минава само едната.
 */
export async function claimTotpStep(userId: string, step: number): Promise<boolean> {
  const claimed = await prisma.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}
