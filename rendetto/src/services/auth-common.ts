import type { LoginOutcome } from '@prisma/client';
import { z } from 'zod';
import type { AuditActor } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { isBreachedPassword } from '../auth/breached.js';
import { passwordProblem } from '../auth/password.js';
import type { RequestMeta } from '../http/meta.js';
import { customerLabel } from '../labels.js';

export const emailSchema = z.string().trim().toLowerCase().max(254).email();

export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[^<>{}\n\r]+$/);

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
