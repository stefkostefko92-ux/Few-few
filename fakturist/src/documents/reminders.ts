import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { InvoiceInputSchema } from '../einvoice/index.js';
import { addDays } from '../recurring/schedule.js';
import { sofiaToday } from '../time.js';
import { PAYABLE_TYPES } from './payments.js';

/**
 * Напомняния за просрочени фактури (SPEC 52): +3 и +10 дни след падежа, до имейла на получателя от
 * документа (BG-9, контакт на купувача). Само ако фирмата ги е включила (`remindersEnabled`) и планът ѝ
 * има `reminders`. Всяка стъпка — веднъж (уникален ред); най-много едно писмо на ден за документ (след
 * прекъсване по-ранните стъпки се отбелязват без писмо).
 */
export const REMINDER_STEPS = [3, 10] as const;

/** Коя стъпка се праща днес: най-високата достигната и неизпратена; null — нищо. */
export function dueStep(
  overdueDays: number,
  sent: readonly number[],
): { send: number; skip: number[] } | null {
  const reached = REMINDER_STEPS.filter((step) => overdueDays >= step && !sent.includes(step));
  const send = reached[reached.length - 1];
  return send === undefined ? null : { send, skip: reached.slice(0, -1) };
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

export async function runReminders(now = new Date()): Promise<number> {
  const today = sofiaToday(now);
  const firstStep = REMINDER_STEPS[0];
  const docs = await prisma.document.findMany({
    where: {
      status: 'ISSUED',
      typeCode: { in: [...PAYABLE_TYPES] },
      paymentState: { in: ['UNPAID', 'PARTIAL'] },
      payableCents: { gt: 0 },
      dueDate: { lte: new Date(`${addDays(today, -firstStep)}T00:00:00Z`) },
      organization: { remindersEnabled: true },
      // Последната стъпка вече е пратена — документът не се чете повече.
      NOT: { reminders: { some: { step: REMINDER_STEPS[REMINDER_STEPS.length - 1] } } },
    },
    select: {
      id: true,
      organizationId: true,
      number: true,
      dueDate: true,
      input: true,
      reminders: { select: { step: true, sentOn: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 200,
  });
  const allowed = new Map<string, boolean>();
  let sent = 0;
  for (const doc of docs) {
    if (!allowed.has(doc.organizationId)) {
      allowed.set(doc.organizationId, await orgHasFeature(doc.organizationId, 'reminders'));
    }
    if (!allowed.get(doc.organizationId)) continue;
    if (doc.reminders.some((r) => r.sentOn.toISOString().slice(0, 10) === today)) continue;
    const step = dueStep(
      daysBetween(doc.dueDate!.toISOString().slice(0, 10), today),
      doc.reminders.map((r) => r.step),
    );
    if (!step) continue;
    const input = InvoiceInputSchema.safeParse(doc.input);
    const email = input.success ? input.data.buyer.contact?.email?.trim().toLowerCase() : undefined;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const sentOn = new Date(`${today}T00:00:00Z`);
        await tx.paymentReminder.createMany({
          data: [...step.skip, step.send].map((s) => ({ documentId: doc.id, step: s, sentOn })),
        });
        await tx.notification.create({
          data: {
            organizationId: doc.organizationId,
            kind: 'document.reminder',
            toEmail: email,
            payload: { documentId: doc.id, step: step.send },
          },
        });
        await audit(tx, {
          actorId: null,
          organizationId: doc.organizationId,
          action: 'document.reminder.sent',
          targetType: 'Document',
          targetId: doc.id,
          details: { number: doc.number, step: step.send },
        });
      });
      sent += 1;
    } catch (error) {
      // Друг работник го е пратил в същия момент (уникалната стъпка) — нищо.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }
  return sent;
}
