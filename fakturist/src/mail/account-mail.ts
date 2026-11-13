import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import { decryptUserToken } from '../auth/keys.js';
import { accountMail, type AccountMailKind } from './account-templates.js';
import type { MailMessage } from './mailer.js';

const Payload = z.object({ tokenId: z.string().min(1), tokenEnc: z.string().min(1) });

/** Видът в опашката → писмото и пътят на връзката. */
export const ACCOUNT_MAILS: Record<string, { kind: AccountMailKind; path: string }> = {
  'account.passwordReset': { kind: 'passwordReset', path: '/nova-parola' },
  'account.verifyEmail': { kind: 'verifyEmail', path: '/potvardi-imeyl' },
};

function validity(kind: AccountMailKind, expiresAt: Date, locale: 'bg' | 'en'): string {
  if (kind === 'passwordReset') return locale === 'bg' ? '1 час' : 'for 1 hour';
  const date = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Sofia',
  }).format(expiresAt);
  return locale === 'bg' ? `до ${date}` : `until ${date}`;
}

/**
 * Писмото с връзка за профила. Използвана, изтекла или за стар имейл връзка не се праща (хвърля — опашката
 * я отбелязва като неуспешна след опитите си).
 */
export async function composeAccountMail(
  queueKind: string,
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const meta = Object.hasOwn(ACCOUNT_MAILS, queueKind) ? ACCOUNT_MAILS[queueKind] : undefined;
  if (!meta) throw new Error(`Непознат вид писмо: ${queueKind}`);
  const { tokenId, tokenEnc } = Payload.parse(payload);
  const row = await prisma.userToken.findUniqueOrThrow({
    where: { id: tokenId },
    select: {
      usedAt: true,
      expiresAt: true,
      email: true,
      user: { select: { name: true, locale: true, email: true } },
    },
  });
  if (row.usedAt || row.expiresAt <= new Date() || row.user.email !== row.email) {
    throw new Error('Връзката вече не е отворена');
  }
  const token = decryptUserToken(tokenEnc, tokenId);
  const locale = row.user.locale === 'en' ? 'en' : 'bg';
  const signature = (await setting('documents.signature')) || BRAND.signature;
  const mail = accountMail(meta.kind, {
    locale,
    name: row.user.name,
    link: `${config().PUBLIC_BASE_URL}${meta.path}/${token}`,
    validity: validity(meta.kind, row.expiresAt, locale),
    signature,
    domain: BRAND.signatureDomain,
  });
  return { to: toEmail, ...mail, attachments: [] };
}
