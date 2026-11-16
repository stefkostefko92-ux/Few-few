import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { decryptMemberInviteToken } from '../auth/keys.js';
import { escapeHtml } from './templates.js';
import type { MailMessage } from './mailer.js';
import type { Locale } from '../i18n.js';
import { mailShortDate, mailSignature, recipientLocale } from './locale.js';

const Payload = z.object({ inviteId: z.string().min(1), tokenEnc: z.string().min(1) });

const ROLE: Record<Locale, Record<string, string>> = {
  bg: {
    ADMIN: 'администратор',
    ACCOUNTANT: 'счетоводител',
    ISSUER: 'издава документи',
    VIEWER: 'само преглед',
  },
  en: {
    ADMIN: 'administrator',
    ACCOUNTANT: 'accountant',
    ISSUER: 'issues documents',
    VIEWER: 'view only',
  },
};

const COPY = {
  bg: {
    hello: 'Здравейте,',
    team: 'Екипът на фирмата',
    intro: (who: string, company: string, role: string) =>
      `${who} ви кани в профила на ${company} във Фактурист с роля „${role}“.`,
    validity: (date: string) => `Връзката важи до ${date} и се използва веднъж.`,
    ignore: 'Ако не очаквате тази покана, не правете нищо — без приемане нищо не се променя.',
    accept: 'Приемете поканата',
    button: 'Приеми поканата',
    subject: (company: string) => `Покана: ${company} във Фактурист`,
  },
  en: {
    hello: 'Hello,',
    team: 'The company’s team',
    intro: (who: string, company: string, role: string) =>
      `${who} invites you to the account of ${company} in Fakturist with the role “${role}”.`,
    validity: (date: string) => `The link is valid until ${date} and can be used once.`,
    ignore:
      'If you do not expect this invitation, do nothing — nothing changes without accepting it.',
    accept: 'Accept the invitation',
    button: 'Accept the invitation',
    subject: (company: string) => `Invitation: ${company} in Fakturist`,
  },
} as const;

/**
 * Поканата за член на фирмата (SPEC 45). Отменена, приета или изтекла покана не се праща. Връзката е
 * единственото копие на токена. Езикът — на профила на поканения, ако има; иначе на поканилия (и
 * страницата на поканата се отваря на него).
 */
export async function composeMemberInviteMail(
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const { inviteId, tokenEnc } = Payload.parse(payload);
  const invite = await prisma.memberInvite.findUniqueOrThrow({
    where: { id: inviteId },
    include: {
      organization: { select: { legalName: true } },
      createdBy: { select: { name: true, locale: true } },
    },
  });
  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
    throw new Error('Поканата вече не е отворена');
  }
  const locale = await recipientLocale(toEmail, invite.createdBy?.locale === 'en' ? 'en' : 'bg');
  const copy = COPY[locale];
  const token = decryptMemberInviteToken(tokenEnc, inviteId);
  const link = `${config().PUBLIC_BASE_URL}/chlen/${token}${locale === 'en' ? '?lang=en' : ''}`;
  const signature = await mailSignature(locale);
  const who = invite.createdBy?.name ?? copy.team;
  const role = ROLE[locale][invite.role] ?? invite.role;
  const intro = copy.intro(who, invite.organization.legalName, role);
  const validity = copy.validity(mailShortDate(invite.expiresAt, locale));
  const text = [
    copy.hello,
    '',
    intro,
    '',
    `${copy.accept}: ${link}`,
    validity,
    '',
    copy.ignore,
    '',
    '—',
    signature,
    BRAND.signatureDomain,
  ].join('\n');
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0c1929">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d5dbe3;border-radius:8px;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(copy.button)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#4a5568">${escapeHtml(validity)}</p>
<p style="margin:0 0 24px;font-size:13px;color:#4a5568">${escapeHtml(copy.ignore)}</p>
<p style="margin:0;font-size:12px;color:#4a5568">${escapeHtml(signature)}</p>
</div></body></html>`;
  return {
    to: toEmail,
    subject: copy.subject(invite.organization.legalName),
    text,
    html,
    attachments: [],
  };
}
