import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { InvoiceInputSchema } from '../einvoice/index.js';
import { addDays } from '../recurring/schedule.js';
import { sofiaToday } from '../time.js';
import { PAYABLE_TYPES } from './payments.js';
import { externalMailAllowed } from '../mail/external-quota.js';

/**
 * Напомняния за просрочени фактури (SPEC 52): +3 и +10 дни след падежа, до имейла на получателя от
 * документа (BG-9, контакт на купувача). Само ако фирмата ги е включила (`remindersEnabled`) и планът ѝ
 * има `reminders`. Всяка стъпка — веднъж (уникален ред); най-много едно писмо на ден за документ (след
 * прекъсване по-ранните стъпки се отбелязват без писмо). Фактура с кредитно известие — без автоматично
 * напомняне. Дневен таван на писмата навън на фирма (`external-quota.ts`).
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

const PAGE = 200;
const MAX_PAGES = 50;

/** Фирмите с включени напомняния и план с `reminders`. */
async function allowedOrganizations(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: { remindersEnabled: true },
    select: { id: true },
  });
  const allowed: string[] = [];
  for (const org of orgs) {
    if (await orgHasFeature(org.id, 'reminders')) allowed.push(org.id);
  }
  return allowed;
}

/**
 * Всеки ред от заявката е за изпращане днес: условията (план, имейл, стъпка, „не днес“, без кредитно
 * известие) са в SQL, обходът е с курсор — неподходящи документи не запушват опашката.
 */
function candidates(organizationIds: string[], today: string): Prisma.DocumentWhereInput {
  const todayDate = new Date(`${today}T00:00:00Z`);
  return {
    organizationId: { in: organizationIds },
    status: 'ISSUED',
    typeCode: { in: [...PAYABLE_TYPES] },
    paymentState: { in: ['UNPAID', 'PARTIAL'] },
    payableCents: { gt: 0 },
    input: { path: ['buyer', 'contact', 'email'], string_contains: '@' },
    // Кредитно известие към фактурата: остатъкът е спорен — без автоматично напомняне.
    followers: { none: { typeCode: '381', status: 'ISSUED' } },
    reminders: { none: { sentOn: todayDate } },
    OR: REMINDER_STEPS.map((step) => ({
      dueDate: { lte: new Date(`${addDays(today, -step)}T00:00:00Z`) },
      reminders: { none: { step } },
    })),
  };
}

export async function runReminders(now = new Date()): Promise<number> {
  const today = sofiaToday(now);
  const organizationIds = await allowedOrganizations();
  if (organizationIds.length === 0) return 0;
  let sent = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const docs = await prisma.document.findMany({
      where: candidates(organizationIds, today),
      select: {
        id: true,
        organizationId: true,
        number: true,
        dueDate: true,
        input: true,
        reminders: { select: { step: true } },
      },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const doc of docs) {
      if (await remind(doc, today, now)) sent += 1;
    }
    if (docs.length < PAGE) break;
    cursor = docs[docs.length - 1]?.id;
  }
  return sent;
}

async function remind(
  doc: {
    id: string;
    organizationId: string;
    number: string | null;
    dueDate: Date | null;
    input: Prisma.JsonValue;
    reminders: Array<{ step: number }>;
  },
  today: string,
  now: Date,
): Promise<boolean> {
  if (!doc.dueDate) return false;
  const step = dueStep(
    daysBetween(doc.dueDate.toISOString().slice(0, 10), today),
    doc.reminders.map((r) => r.step),
  );
  if (!step) return false;
  const input = InvoiceInputSchema.safeParse(doc.input);
  const email = input.success ? input.data.buyer.contact?.email?.trim().toLowerCase() : undefined;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await externalMailAllowed(tx, doc.organizationId, now))) return false;
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
      return true;
    });
  } catch (error) {
    // Друг работник го е пратил в същия момент (уникалната стъпка) — нищо.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false;
    }
    throw error;
  }
}
