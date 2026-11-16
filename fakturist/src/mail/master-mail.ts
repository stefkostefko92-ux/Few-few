import { z } from 'zod';
import { config } from '../config.js';
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

export const MASTER_MAIL_KINDS = ['master.granted', 'master.revoked', 'master.notice'] as const;
