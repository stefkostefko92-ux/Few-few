import { z } from 'zod';
import { config } from '../config.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import { wrap } from './document-mail.js';
import type { MailMessage } from './mailer.js';

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
] as const;

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('bg-BG', { dateStyle: 'long', timeZone: 'Europe/Sofia' }).format(
    new Date(iso),
  );
}

export async function composeOrgMail(
  kind: string,
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const base = config().PUBLIC_BASE_URL;
  let subject: string;
  let paragraphs: string[];
  if (kind === 'org.terminated') {
    const { legalName, purgeAfter } = Terminated.parse(payload);
    subject = `Фактурист — „${legalName}“ е прекратена`;
    paragraphs = [
      `Ползването на Фактурист за „${legalName}“ е прекратено. До ${longDate(purgeAfter)} можете да преглеждате и изтегляте документите — архивът е в „Износ (ZIP)“ на фирмата (${base}/app).`,
      'След тази дата изтриваме данните на фирмата по договора за обработване (т. 11). Задължението да пазите фактурите си по Закона за счетоводството остава ваше.',
      'Собственикът може да отмени прекратяването до датата от „Прекратяване“. Ако не сте го заявили вие, отговорете ни веднага.',
    ];
  } else if (kind === 'org.termination.cancelled') {
    const { legalName } = Named.parse(payload);
    subject = `Фактурист — прекратяването на „${legalName}“ е отменено`;
    paragraphs = [
      `Прекратяването на „${legalName}“ е отменено — фирмата работи отново (${base}/app).`,
      'API ключовете остават оттеглени, а повтарящите се фактури — на пауза; включете ги, ако ви трябват.',
    ];
  } else if (kind === 'org.purged') {
    const { legalName } = Named.parse(payload);
    subject = `Фактурист — данните на „${legalName}“ са изтрити`;
    paragraphs = [
      `Данните на „${legalName}“ във Фактурист са изтрити след срока за изтегляне. Резервните копия ги губят до 90 дни.`,
      'Пазим само наименованието, одита, приетите условия и фактурите за плана — те са и наши счетоводни документи. Документите, изпратени до други фирми във Фактурист, остават при тях.',
    ];
  } else {
    throw new Error(`Непознат вид писмо: ${kind}`);
  }
  const signature = (await setting('documents.signature')) || BRAND.signature;
  return { to: toEmail, subject, ...wrap(paragraphs, signature), attachments: [] };
}
