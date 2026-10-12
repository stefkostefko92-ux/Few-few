import { Prisma, type EmailDigest, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notificationView } from './notify.js';
import type { Viewer } from './access.js';

/**
 * Известията на човека (§14.1 GET /notifications „notifiche e preferenze per utente“): страница по
 * курсор (непрочетените първо, после прочетените, всяка група — най-новите първо) + личните
 * предпочитания (имейл, дайджест, тихи часове, часова зона) + предпочитанията по разговор,
 * които не са подразбиращите се (ALL). Само собственото — tenantId и userId във всяка заявка.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Rome';

/** Валидна IANA зона (тази, която Intl на сървъра познава). */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .transform((v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3)));

export const PreferencesInput = z
  .object({
    emailEnabled: z.boolean().optional(),
    digest: z.enum(['OFF', 'DAILY']).optional(),
    quietHours: z
      .object({ start: HHMM, end: HHMM })
      .refine((q) => q.start !== q.end)
      .nullable()
      .optional(),
    timeZone: z.string().min(1).max(64).refine(isTimeZone).optional(),
  })
  .strict()
  .refine((p) => Object.values(p).some((v) => v !== undefined));

export type PreferencesPatch = z.infer<typeof PreferencesInput>;

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface EmailPreferences {
  emailEnabled: boolean;
  digest: EmailDigest;
  quietStart: number | null;
  quietEnd: number | null;
  timeZone: string;
}

export const DEFAULT_PREFERENCES: EmailPreferences = {
  emailEnabled: true,
  digest: 'OFF',
  quietStart: null,
  quietEnd: null,
  timeZone: DEFAULT_TIME_ZONE,
};

export async function preferencesOf(db: PrismaClient, userId: string): Promise<EmailPreferences> {
  const row = await db.notificationSettings.findUnique({ where: { userId } });
  return row ?? DEFAULT_PREFERENCES;
}

export function preferencesView(p: EmailPreferences, emailAvailable: boolean) {
  return {
    email: {
      // Без конфигуриран доставчик писмата не тръгват — UI го казва, вместо да лъже „включено“.
      available: emailAvailable,
      enabled: p.emailEnabled,
      digest: p.digest,
      quietHours:
        p.quietStart !== null && p.quietEnd !== null
          ? { start: hhmm(p.quietStart), end: hhmm(p.quietEnd) }
          : null,
      timeZone: p.timeZone,
    },
  };
}

export async function updatePreferences(
  db: PrismaClient,
  viewer: Pick<Viewer, 'id' | 'tenantId'>,
  patch: PreferencesPatch,
): Promise<EmailPreferences> {
  const data = {
    ...(patch.emailEnabled !== undefined ? { emailEnabled: patch.emailEnabled } : {}),
    ...(patch.digest !== undefined ? { digest: patch.digest } : {}),
    ...(patch.quietHours !== undefined
      ? {
          quietStart: patch.quietHours?.start ?? null,
          quietEnd: patch.quietHours?.end ?? null,
        }
      : {}),
    ...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
  };
  return db.notificationSettings.upsert({
    where: { userId: viewer.id },
    create: { userId: viewer.id, tenantId: viewer.tenantId, ...data },
    update: data,
  });
}

/** Предпочитанията по разговор, различни от ALL (до 500 — останалите са подразбиращите се). */
export async function conversationPreferences(db: PrismaClient, viewer: Viewer) {
  const rows = await db.conversationMember.findMany({
    where: {
      userId: viewer.id,
      notificationPref: { not: 'ALL' },
      conversation: { tenantId: viewer.tenantId },
    },
    select: { conversationId: true, notificationPref: true },
    orderBy: { conversationId: 'asc' },
    take: 500,
  });
  return rows;
}

// ─── Страница известия по курсор ─────────────────────────────────────────────────────────────

const Cursor = z.object({ s: z.enum(['u', 'r']), t: z.iso.datetime(), id: z.string().max(40) });
type CursorValue = { s: 'u' | 'r'; at: Date; id: string };

export function encodeNotificationCursor(c: CursorValue): string {
  return Buffer.from(JSON.stringify({ s: c.s, t: c.at.toISOString(), id: c.id })).toString(
    'base64url',
  );
}

export function decodeNotificationCursor(raw: string): CursorValue | null {
  try {
    const parsed = Cursor.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed.success
      ? { s: parsed.data.s, at: new Date(parsed.data.t), id: parsed.data.id }
      : null;
  } catch {
    return null;
  }
}

const olderThan = (c: { at: Date; id: string }): Prisma.NotificationWhereInput => ({
  OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }],
});
const NEWEST = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

export async function notificationPage(
  db: PrismaClient,
  viewer: Pick<Viewer, 'id' | 'tenantId'>,
  cursor: CursorValue | null,
  limit: number,
) {
  const mine = { userId: viewer.id, tenantId: viewer.tenantId };
  const unread =
    !cursor || cursor.s === 'u'
      ? await db.notification.findMany({
          where: { AND: [mine, { readAt: null }, ...(cursor ? [olderThan(cursor)] : [])] },
          orderBy: NEWEST,
          take: limit + 1,
        })
      : [];
  const room = limit + 1 - unread.length;
  const read =
    room > 0
      ? await db.notification.findMany({
          where: {
            AND: [
              mine,
              { readAt: { not: null } },
              ...(cursor?.s === 'r' ? [olderThan(cursor)] : []),
            ],
          },
          orderBy: NEWEST,
          take: room,
        })
      : [];
  const rows = [
    ...unread.map((n) => ({ n, s: 'u' as const })),
    ...read.map((n) => ({ n, s: 'r' as const })),
  ];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    notifications: page.map((r) => notificationView(r.n)),
    nextCursor:
      rows.length > limit && last
        ? encodeNotificationCursor({ s: last.s, at: last.n.createdAt, id: last.n.id })
        : null,
  };
}
