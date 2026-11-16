import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { wrap } from './document-mail.js';
import type { MailMessage } from './mailer.js';
import { mailLongDate, mailSignature, recipientLocale } from './locale.js';

/**
 * Писмата за прекратяването на фирма (src/accounts/termination.ts, termination-purge.ts): до
 * собствениците и администраторите — заявено (с датата на изтриването), отменено, изтрито. Без токени.
 */
const Terminated = z.object({
  legalName: z.string().min(1).max(300),
  purgeAfter: z.string().datetime(),
});
const Named = z.object({ legalName: z.string().min(1).max(300) });

export const ORG_MAIL_KINDS = [
  'org.terminated',
  'org.termination.cancelled',
  'org.purged',
  'org.notice',
] as const;

const Notice = z.object({ announcementId: z.string().min(1).max(40) });

/**
 * Писмата са на езика на профила на получателя (src/mail/locale.ts). Съобщението от мастъра е написано
 * от него — то остава както е; преведени са темата и изречението за влизането в сила.
 */
export async function composeOrgMail(
  kind: string,
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const base = config().PUBLIC_BASE_URL;
  const locale = await recipientLocale(toEmail);
  const bg = locale === 'bg';
  const longDate = (iso: string) => mailLongDate(new Date(iso), locale);
  let subject: string;
  let paragraphs: string[];
  if (kind === 'org.terminated') {
    const { legalName, purgeAfter } = Terminated.parse(payload);
    subject = bg
      ? `Фактурист — „${legalName}“ е прекратена`
      : `Fakturist — “${legalName}” is terminated`;
    paragraphs = bg
      ? [
          `Ползването на Фактурист за „${legalName}“ е прекратено. До ${longDate(purgeAfter)} можете да преглеждате и изтегляте документите — архивът е в „Износ (ZIP)“ на фирмата (${base}/app).`,
          'След тази дата изтриваме данните на фирмата по договора за обработване (т. 11). Задължението да пазите фактурите си по Закона за счетоводството остава ваше.',
          'Собственикът може да отмени прекратяването до датата от „Прекратяване“. Ако не сте го заявили вие, отговорете ни веднага.',
        ]
      : [
          `The use of Fakturist for “${legalName}” has been terminated. Until ${longDate(purgeAfter)} you can view and download the documents — the archive is under “Export (ZIP)” of the company (${base}/app).`,
          'After that date we delete the company’s data under the data processing agreement (item 11). Keeping your invoices under the Bulgarian Accountancy Act remains your obligation.',
          'The owner can cancel the termination until that date from “Termination”. If you did not request it, reply to us at once.',
        ];
  } else if (kind === 'org.termination.cancelled') {
    const { legalName } = Named.parse(payload);
    subject = bg
      ? `Фактурист — прекратяването на „${legalName}“ е отменено`
      : `Fakturist — the termination of “${legalName}” is cancelled`;
    paragraphs = bg
      ? [
          `Прекратяването на „${legalName}“ е отменено — фирмата работи отново (${base}/app).`,
          'API ключовете остават оттеглени, а повтарящите се фактури — на пауза; включете ги, ако ви трябват.',
        ]
      : [
          `The termination of “${legalName}” is cancelled — the company works again (${base}/app).`,
          'The API keys stay revoked and the recurring invoices stay paused; turn them on if you need them.',
        ];
  } else if (kind === 'org.purged') {
    const { legalName } = Named.parse(payload);
    subject = bg
      ? `Фактурист — данните на „${legalName}“ са изтрити`
      : `Fakturist — the data of “${legalName}” is deleted`;
    paragraphs = bg
      ? [
          `Данните на „${legalName}“ във Фактурист са изтрити след срока за изтегляне. Резервните копия ги губят до 90 дни.`,
          'Пазим само наименованието, одита, приетите условия и фактурите за плана — те са и наши счетоводни документи. Документите, изпратени до други фирми във Фактурист, остават при тях.',
        ]
      : [
          `The data of “${legalName}” in Fakturist was deleted after the download period. The backups lose it within 90 days.`,
          'We keep only the legal name, the audit log, the accepted terms and the invoices for the plan — they are our accounting documents too. Documents sent to other companies in Fakturist stay with them.',
        ];
  } else if (kind === 'org.notice') {
    // Съобщението от мастъра (src/admin/announcements.ts): текстът е в записа, не в опашката.
    const { announcementId } = Notice.parse(payload);
    const notice = await prisma.announcement.findUniqueOrThrow({ where: { id: announcementId } });
    subject = `${bg ? 'Фактурист' : 'Fakturist'} — ${notice.subject}`;
    paragraphs = notice.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (notice.kind === 'legal' && notice.effectiveOn) {
      const date = longDate(notice.effectiveOn.toISOString());
      paragraphs.push(
        bg
          ? `Промяната е в сила от ${date}. Ако не сте съгласни, можете да прекратите ползването преди това без неустойка (общите условия, т. 15).`
          : `The change takes effect on ${date}. If you do not agree, you can stop using the service before then without a penalty (terms of service, item 15).`,
      );
    }
  } else {
    throw new Error(`Непознат вид писмо: ${kind}`);
  }
  const signature = await mailSignature(locale);
  return { to: toEmail, subject, ...wrap(paragraphs, signature, locale), attachments: [] };
}
