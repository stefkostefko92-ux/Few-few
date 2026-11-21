import 'server-only';
import { createHmac } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { notifyAdmins } from '@/lib/admin-alert';
import { alertDue } from '@/lib/alert-policy';

// Дневник на събитията по сигурност + аларми (син екип, детекция D1–D7).
// Никога: пароли, кодове, тайни, токени, IP. Имейлът при неуспешен вход е
// HMAC (ключ извън базата), за да се броят опитите, без да се пази адресът.

export type SecurityEventType =
  | 'auth.login.failed'
  | 'auth.login'
  | 'admin.login'
  | 'mfa.enabled'
  | 'mfa.disabled'
  | 'mfa.failed'
  | 'mfa.backup_used'
  | 'mfa.backup_regenerated'
  | 'password.changed'
  | 'sessions.revoked'
  | 'stepup.ok'
  | 'stepup.failed'
  | 'email.verified'
  | 'email.verify_blocked'
  | 'admin.register'
  | 'webhook.bad_signature'
  | 'setting.changed'
  | 'admin.action';

/** HMAC на имейла; без таен ключ — null (константен ключ би направил хеша обратим с речник). */
export function subjectHash(value: string): string | null {
  const key = process.env.SETTINGS_KEY || process.env.CRON_SECRET;
  if (!key) return null;
  return createHmac('sha256', key).update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export async function recordSecurityEvent(
  type: SecurityEventType,
  data: { userId?: string | null; subject?: string | null; country?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  await prisma.securityEvent
    .create({
      data: {
        type,
        userId: data.userId ?? null,
        subject: data.subject ?? null,
        country: data.country ?? null,
        meta: (data.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    .catch(() => undefined);
}

/** Брой събития от вида за последните `minutes` (по субект или потребител). */
export async function countRecent(
  type: SecurityEventType,
  minutes: number,
  where: { subject?: string; userId?: string } = {},
): Promise<number> {
  return prisma.securityEvent
    .count({ where: { type, ...where, createdAt: { gte: new Date(Date.now() - minutes * 60_000) } } })
    .catch(() => 0);
}

/**
 * Аларма до админите по детекционно правило (lib/alert-policy.ts): при
 * count >= праг, веднъж на прозорец за правило+ключ, с общ таван на правило —
 * външен човек нито залива пощата, нито заглушава правилото.
 */
export async function alertAtThreshold(
  rule: { name: string; key?: string; threshold: number; windowMs?: number },
  count: number,
  subject: string,
  lines: string[],
): Promise<void> {
  const due = alertDue({
    count,
    threshold: rule.threshold,
    rule: rule.name,
    key: rule.key ?? 'all',
    windowMs: rule.windowMs,
  });
  if (due) await notifyAdmins(subject, lines).catch(() => false);
}
