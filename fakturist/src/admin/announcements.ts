import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { consumeTotpCode } from '../auth/step-up.js';
import { DAY, sofiaToday } from '../time.js';

/**
 * Съобщение до клиентите от мастъра (одитът на правния, M4): промяна в условията (общите условия т. 15 —
 * писмо поне 30 дни преди), инцидент със сигурността (SECURITY.md, „Инцидент“) или обявление за услугата.
 * До собствениците и администраторите на всяка неизтрита фирма — едно писмо на адрес. Записът
 * `Announcement` остава доказателство кога и до колко адреса е пратено (писмата в опашката се трият
 * след 90 дни). Само с 2FA кода на действащия мастър.
 */
export const ANNOUNCEMENT_KINDS = ['legal', 'incident', 'service'] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

/** Съществена промяна — поне 30 дни предизвестие (общите условия, т. 15). */
export const LEGAL_NOTICE_DAYS = 30;

export const AnnouncementSchema = z.object({
  kind: z.enum(ANNOUNCEMENT_KINDS),
  subject: z.string().trim().min(3).max(150),
  body: z.string().trim().min(10).max(5000),
  effectiveOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(''),
  confirm: z.literal('on'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export type AnnouncementForm = z.infer<typeof AnnouncementSchema>;

export class AnnouncementError extends Error {
  constructor(readonly code: 'code' | 'effective' | 'noRecipients') {
    super(code);
  }
}

/** Най-ранната дата „в сила от“ за промяна в условията — по софийско време. */
export function earliestEffective(today = sofiaToday()): string {
  const date = new Date(`${today}T00:00:00Z`);
  return new Date(date.getTime() + LEGAL_NOTICE_DAYS * DAY).toISOString().slice(0, 10);
}

export async function sendAnnouncement(input: {
  actorId: string;
  form: AnnouncementForm;
  today?: string;
}): Promise<{ id: string; recipients: number }> {
  const { form } = input;
  const today = input.today ?? sofiaToday();
  if (form.kind === 'legal' && (!form.effectiveOn || form.effectiveOn < earliestEffective(today))) {
    throw new AnnouncementError('effective');
  }
  return prisma.$transaction(async (tx) => {
    if (!(await consumeTotpCode(tx, input.actorId, form.code))) {
      throw new AnnouncementError('code');
    }
    const members = await tx.membership.findMany({
      where: {
        role: { in: ['OWNER', 'ADMIN'] },
        user: { disabledAt: null },
        organization: { deletedAt: null },
      },
      select: { user: { select: { email: true } } },
    });
    const emails = [...new Set(members.map((m) => m.user.email.toLowerCase()))];
    if (emails.length === 0) throw new AnnouncementError('noRecipients');
    const announcement = await tx.announcement.create({
      data: {
        kind: form.kind,
        subject: form.subject,
        body: form.body,
        effectiveOn: form.effectiveOn ? new Date(`${form.effectiveOn}T00:00:00Z`) : null,
        recipients: emails.length,
        createdById: input.actorId,
      },
      select: { id: true },
    });
    await tx.notification.createMany({
      data: emails.map((toEmail) => ({
        kind: 'org.notice',
        toEmail,
        payload: { announcementId: announcement.id },
      })),
    });
    await audit(tx, {
      actorId: input.actorId,
      action: 'announcement.sent',
      targetType: 'Announcement',
      targetId: announcement.id,
      details: { kind: form.kind, recipients: emails.length },
    });
    return { id: announcement.id, recipients: emails.length };
  });
}
