import { z } from 'zod';
import { money } from '../http/view.js';
import { bgDate } from '../time.js';

/**
 * Писмото до мастърите „върнете пари“ (`src/billing/refund-notice.ts`): колко, на кого, защо и до кога.
 * Самото връщане е ръчно — в Revolut Business или с превод; Фактурист не пипа плащането.
 */
const Refund = z.object({
  reason: z.enum(['mismatch', 'superseded', 'creditStale', 'legalRefused']),
  organizationId: z.string().min(1).max(100),
  legalName: z.string().min(1).max(300),
  paymentId: z.string().max(100).nullable(),
  amountCents: z.number().int().positive(),
  paidCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  paidAt: z.string().max(40).nullable(),
  dueBy: z.string().max(40).nullable(),
});

const WHY = {
  mismatch: {
    bg: 'платената сума или поръчката не съвпадат с поръчаното',
    en: 'the amount paid or the order does not match what was ordered',
  },
  superseded: {
    bg: 'поръчката е заменена, а друг платен план вече е активиран',
    en: 'the order was replaced and another paid plan is already active',
  },
  creditStale: {
    bg: 'приспаднатото неизползвано време е от план, който вече не е действащ',
    en: 'the unused time deducted is from a plan that is no longer current',
  },
} as const;

export function refundMail(
  payload: unknown,
  bg: boolean,
  base: string,
): { subject: string; paragraphs: string[] } {
  const r = Refund.parse(payload);
  const locale = bg ? 'bg' : 'en';
  const amount = money(r.amountCents, r.currency, locale);
  const paid = money(r.paidCents, r.currency, locale);
  const paidOn = r.paidAt ? bgDate(new Date(r.paidAt)) : null;
  const due = r.dueBy ? bgDate(new Date(r.dueBy)) : null;
  const link = r.paymentId
    ? `${base}/admin/r/payments/${r.paymentId}`
    : `${base}/admin/r/organizations/${r.organizationId}`;
  if (r.reason === 'legalRefused') {
    return {
      subject: bg
        ? `Фактурист — връщане на неизползвания период: ${r.legalName}`
        : `Fakturist — refund of the unused period: ${r.legalName}`,
      paragraphs: bg
        ? [
            `${r.legalName} прекрати ползването, без да приеме новата версия на общите условия.`,
            `По т. 11 и 15 от общите условия връщаме платеното за неизползвания период — ориентировъчно ${amount} (от ${paid}${paidOn ? `, платени на ${paidOn}` : ''}, пропорционално на оставащото време).`,
            `Сверете сумата и я върнете в Revolut Business или с превод (${link}). Фактурист не пипа плащането сам.`,
          ]
        : [
            `${r.legalName} ended the service without accepting the new version of the terms.`,
            `Under points 11 and 15 of the terms we refund what was paid for the unused period — about ${amount} (of ${paid}${paidOn ? ` paid on ${paidOn}` : ''}, in proportion to the time left).`,
            `Check the amount and refund it in Revolut Business or by bank transfer (${link}). Fakturist does not touch the payment on its own.`,
          ],
    };
  }
  const why = WHY[r.reason][locale];
  return {
    subject: bg
      ? `Фактурист — върнете плащане${due ? ` до ${due}` : ''}: ${r.legalName}`
      : `Fakturist — refund a payment${due ? ` by ${due}` : ''}: ${r.legalName}`,
    paragraphs: bg
      ? [
          `Плащане с карта от ${r.legalName}${paidOn ? ` (${paidOn})` : ''} за ${amount} не активира план: ${why}.`,
          `По т. 6 от общите условия връщаме го по същия път${due ? ` до ${due}` : ''}. Направете връщането в Revolut Business (${link}).`,
        ]
      : [
          `A card payment from ${r.legalName}${paidOn ? ` (${paidOn})` : ''} of ${amount} did not activate a plan: ${why}.`,
          `Under point 6 of the terms we refund it the same way${due ? ` by ${due}` : ''}. Make the refund in Revolut Business (${link}).`,
        ],
  };
}
