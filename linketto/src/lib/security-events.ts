import 'server-only';
import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/db';
import { notifyAdmins } from '@/lib/admin-alert';

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
        meta: (data.meta ?? undefined) as never,
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
 * Аларма до админите при точно достигнат праг (а не при всяко следващо
 * събитие) — едно писмо на вълна, без да се залива пощата.
 */
export async function alertAtThreshold(
  count: number,
  threshold: number,
  subject: string,
  lines: string[],
): Promise<void> {
  if (count === threshold) await notifyAdmins(subject, lines).catch(() => false);
}
