import { z } from 'zod';
import { config } from '../config.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import { wrap } from './document-mail.js';
import type { MailMessage } from './mailer.js';

/**
 * Писмата за мастър ролята (src/accounts/masters.ts): на засегнатия — дадена/отнета; на останалите
 * мастъри — известие кой е добавен или махнат. Без връзки с токени (връзката за парола е отделно писмо).
 */
const Granted = z.object({ created: z.boolean() });
const Notice = z.object({
  action: z.enum(['granted', 'revoked']),
  email: z.string().min(3).max(254),
});

async function signature(): Promise<string> {
  return (await setting('documents.signature')) || BRAND.signature;
}

export async function composeMasterMail(
  kind: string,
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const base = config().PUBLIC_BASE_URL;
  let subject: string;
  let paragraphs: string[];
  if (kind === 'master.granted') {
    const { created } = Granted.parse(payload);
    subject = 'Фактурист — дадена ви е мастър роля';
    paragraphs = [
      `Дадена ви е мастър роля във Фактурист — достъп до мастър панела (${base}/admin).`,
      created
        ? `Задайте парола от връзката в отделното писмо (важи 1 час) или от „Забравена парола“: ${base}/zabravena-parola.`
        : 'Влезте наново с паролата си.',
      'При първия вход в панела трябва да включите двуфакторен вход. Ако не очаквате това писмо, отговорете ни веднага.',
    ];
  } else if (kind === 'master.revoked') {
    subject = 'Фактурист — мастър ролята ви е отнета';
    paragraphs = [
      'Мастър ролята ви във Фактурист е отнета. Профилът ви остава, без достъп до мастър панела.',
      'Ако не очаквате това писмо, отговорете ни.',
    ];
  } else if (kind === 'master.notice') {
    const { action, email } = Notice.parse(payload);
    subject = action === 'granted' ? 'Фактурист — добавен е мастър' : 'Фактурист — махнат е мастър';
    paragraphs = [
      action === 'granted'
        ? `Мастър ролята е дадена на ${email}.`
        : `Мастър ролята на ${email} е отнета.`,
      `Списъкът е в мастър панела → Мастъри (${base}/admin/mastari); кой го е направил — в одита.`,
    ];
  } else {
    throw new Error(`Непознат вид писмо: ${kind}`);
  }
  return { to: toEmail, subject, ...wrap(paragraphs, await signature()), attachments: [] };
}

export const MASTER_MAIL_KINDS = ['master.granted', 'master.revoked', 'master.notice'] as const;
