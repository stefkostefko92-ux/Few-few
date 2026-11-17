import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { money } from '../http/view.js';
import { wrap } from './document-mail.js';
import type { MailMessage } from './mailer.js';
import { mailSignature, recipientLocale } from './locale.js';

/**
 * Писмата за мастър ролята (src/accounts/masters.ts): на засегнатия — дадена/отнета; на останалите
 * мастъри — известие кой е добавен или махнат. Без връзки с токени (връзката за парола е отделно писмо).
 */
const Granted = z.object({ created: z.boolean() });
const Notice = z.object({
  action: z.enum(['granted', 'revoked']),
  email: z.string().min(3).max(254),
});

/** Спор за плащане (src/billing/disputes.ts) — идентификатори и суми; фирмата се чете при изпращането. */
const Dispute = z.object({
  disputeId: z.string().min(1).max(100),
  event: z.string().max(100),
  state: z.enum(['needs_response', 'under_review', 'won', 'lost', 'unread']),
  substate: z.string().max(40).nullable(),
  amountCents: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  responseDueAt: z.string().max(40).nullable(),
  organizationId: z.string().max(100).nullable(),
  paymentId: z.string().max(100).nullable(),
  planCode: z.string().max(40).nullable(),
});

const DISPUTE_STATE = {
  needs_response: { bg: 'нужен е отговор', en: 'response needed' },
  under_review: { bg: 'в преглед', en: 'under review' },
  won: { bg: 'спечелен', en: 'won' },
  lost: { bg: 'загубен', en: 'lost' },
  unread: { bg: 'не се прочете', en: 'could not be read' },
} as const;

/** „ДД.ММ.ГГГГ ЧЧ:ММ“ по софийско време — един запис за двата езика. */
function sofiaDateTime(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sofia',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts['day']}.${parts['month']}.${parts['year']} ${parts['hour']}:${parts['minute']}`;
}

async function disputeMail(
  payload: unknown,
  bg: boolean,
  base: string,
): Promise<{ subject: string; paragraphs: string[] }> {
  const d = Dispute.parse(payload);
  const org = d.organizationId
    ? await prisma.organization.findUnique({
        where: { id: d.organizationId },
        select: { legalName: true, eik: true },
      })
    : null;
  const state = DISPUTE_STATE[d.state][bg ? 'bg' : 'en'];
  const due = d.responseDueAt ? sofiaDateTime(d.responseDueAt) : null;
  const amount =
    d.amountCents !== null && d.currency
      ? money(d.amountCents, d.currency, bg ? 'bg' : 'en')
      : null;
  const link = org
    ? `${base}/admin/r/organizations/${d.organizationId}`
    : d.paymentId
      ? `${base}/admin/r/payments/${d.paymentId}`
      : `${base}/admin/r/audit`;
  const unread = d.state === 'unread';
  // Чие е плащането: при непрочетен спор не знаем нищо (без ред); иначе — фирмата, плащането без фирма
  // (изтрита) или изобщо без плащане при нас.
  const whose = (bgText: boolean): string[] => {
    if (unread) return [];
    if (org) {
      return [
        bgText
          ? `Фирма: ${org.legalName} (ЕИК ${org.eik})${d.planCode ? `, план ${d.planCode}` : ''}.`
          : `Company: ${org.legalName} (UIC ${org.eik})${d.planCode ? `, plan ${d.planCode}` : ''}.`,
      ];
    }
    if (d.paymentId) {
      return [
        bgText
          ? `Плащане № ${d.paymentId} е при нас, но фирмата му вече я няма (изтрита).`
          : `Payment ${d.paymentId} is here, but its company no longer exists (deleted).`,
      ];
    }
    return [
      bgText
        ? 'Плащането не е намерено при нас по поръчката на Revolut.'
        : 'No payment with this Revolut order was found here.',
    ];
  };
  const subject = bg
    ? `Фактурист — спор за плащане с карта: ${state}${due && d.state === 'needs_response' ? `, отговор до ${due}` : ''}`
    : `Fakturist — card payment dispute: ${state}${due && d.state === 'needs_response' ? `, respond by ${due}` : ''}`;
  const paragraphs = bg
    ? [
        `Revolut съобщи за спор (chargeback) по плащане с карта (${d.event}). Спор № ${d.disputeId}, състояние: „${state}“${d.substate ? ` (${d.substate})` : ''}.`,
        ...(unread
          ? [
              'Подробностите (сума, срок, плащане) не се прочетоха от Revolut. Проверете спора сега в Revolut Business — срокът за отговор тече.',
            ]
          : []),
        ...(amount ? [`Сума: ${amount}.`] : []),
        ...whose(true),
        ...(due ? [`Срок за отговор: ${due} ч. (софийско време).`] : []),
        `Отговорът се дава в Revolut Business. Фактурист не спира плана и не пипа плащането сам — решавате вие (${link}).`,
      ]
    : [
        `Revolut reported a dispute (chargeback) on a card payment (${d.event}). Dispute ${d.disputeId}, state: “${state}”${d.substate ? ` (${d.substate})` : ''}.`,
        ...(unread
          ? [
              'The details (amount, deadline, payment) could not be read from Revolut. Check the dispute in Revolut Business now — the response deadline is running.',
            ]
          : []),
        ...(amount ? [`Amount: ${amount}.`] : []),
        ...whose(false),
        ...(due ? [`Respond by: ${due} (Sofia time).`] : []),
        `You respond in Revolut Business. Fakturist does not stop the plan or touch the payment on its own — you decide (${link}).`,
      ];
  return { subject, paragraphs };
}

export async function composeMasterMail(
  kind: string,
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const base = config().PUBLIC_BASE_URL;
  const locale = await recipientLocale(toEmail);
  const bg = locale === 'bg';
  let subject: string;
  let paragraphs: string[];
  if (kind === 'master.granted') {
    const { created } = Granted.parse(payload);
    subject = bg
      ? 'Фактурист — дадена ви е мастър роля'
      : 'Fakturist — you have been given the master role';
    paragraphs = bg
      ? [
          `Дадена ви е мастър роля във Фактурист — достъп до мастър панела (${base}/admin).`,
          created
            ? `Задайте парола от връзката в отделното писмо (важи 1 час) или от „Забравена парола“: ${base}/zabravena-parola.`
            : 'Влезте наново с паролата си.',
          'При първия вход в панела трябва да включите двуфакторен вход. Ако не очаквате това писмо, отговорете ни веднага.',
        ]
      : [
          `You have been given the master role in Fakturist — access to the master panel (${base}/admin).`,
          created
            ? `Set a password from the link in the separate email (valid for 1 hour) or from “Forgot password”: ${base}/zabravena-parola?lang=en.`
            : 'Sign in again with your password.',
          'On your first sign-in to the panel you must turn on two-factor sign-in. If you do not expect this email, reply to us at once.',
        ];
  } else if (kind === 'master.revoked') {
    subject = bg
      ? 'Фактурист — мастър ролята ви е отнета'
      : 'Fakturist — your master role has been removed';
    paragraphs = bg
      ? [
          'Мастър ролята ви във Фактурист е отнета. Профилът ви остава, без достъп до мастър панела.',
          'Ако не очаквате това писмо, отговорете ни.',
        ]
      : [
          'Your master role in Fakturist has been removed. Your account stays, without access to the master panel.',
          'If you do not expect this email, reply to us.',
        ];
  } else if (kind === 'master.notice') {
    const { action, email } = Notice.parse(payload);
    const granted = action === 'granted';
    subject = bg
      ? granted
        ? 'Фактурист — добавен е мастър'
        : 'Фактурист — махнат е мастър'
      : granted
        ? 'Fakturist — a master was added'
        : 'Fakturist — a master was removed';
    paragraphs = bg
      ? [
          granted ? `Мастър ролята е дадена на ${email}.` : `Мастър ролята на ${email} е отнета.`,
          `Списъкът е в мастър панела → Мастъри (${base}/admin/mastari); кой го е направил — в одита.`,
        ]
      : [
          granted
            ? `The master role was given to ${email}.`
            : `The master role of ${email} was removed.`,
          `The list is in the master panel → Masters (${base}/admin/mastari); who did it — in the audit log.`,
        ];
  } else if (kind === 'master.dispute') {
    ({ subject, paragraphs } = await disputeMail(payload, bg, base));
  } else {
    throw new Error(`Непознат вид писмо: ${kind}`);
  }
  return {
    to: toEmail,
    subject,
    ...wrap(paragraphs, await mailSignature(locale), locale),
    attachments: [],
  };
}

export const MASTER_MAIL_KINDS = [
  'master.granted',
  'master.revoked',
  'master.notice',
  'master.dispute',
] as const;
