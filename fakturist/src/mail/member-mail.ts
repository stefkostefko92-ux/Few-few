import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import { decryptMemberInviteToken } from '../auth/keys.js';
import { escapeHtml } from './templates.js';
import type { MailMessage } from './mailer.js';

const Payload = z.object({ inviteId: z.string().min(1), tokenEnc: z.string().min(1) });

const ROLE_BG: Record<string, string> = {
  ADMIN: 'администратор',
  ACCOUNTANT: 'счетоводител',
  ISSUER: 'издава документи',
  VIEWER: 'само преглед',
};

function dateBg(date: Date): string {
  return new Intl.DateTimeFormat('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Sofia',
  }).format(date);
}

/**
 * Поканата за член на фирмата (SPEC 45). Отменена, приета или изтекла покана не се праща. Връзката е
 * единственото копие на токена.
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
      createdBy: { select: { name: true } },
    },
  });
  if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
    throw new Error('Поканата вече не е отворена');
  }
  const token = decryptMemberInviteToken(tokenEnc, inviteId);
  const link = `${config().PUBLIC_BASE_URL}/chlen/${token}`;
  const signature = (await setting('documents.signature')) || BRAND.signature;
  const who = invite.createdBy?.name ?? 'Екипът на фирмата';
  const role = ROLE_BG[invite.role] ?? invite.role;
  const intro = `${who} ви кани в профила на ${invite.organization.legalName} във Фактурист с роля „${role}“.`;
  const validity = `Връзката важи до ${dateBg(invite.expiresAt)} и се използва веднъж.`;
  const ignore = 'Ако не очаквате тази покана, не правете нищо — без приемане нищо не се променя.';
  const text = [
    'Здравейте,',
    '',
    intro,
    '',
    `Приемете поканата: ${link}`,
    validity,
    '',
    ignore,
    '',
    '—',
    signature,
    BRAND.signatureDomain,
  ].join('\n');
  const html = `<!doctype html><html lang="bg"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0c1929">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d5dbe3;border-radius:8px;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Приеми поканата</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#4a5568">${escapeHtml(validity)}</p>
<p style="margin:0 0 24px;font-size:13px;color:#4a5568">${escapeHtml(ignore)}</p>
<p style="margin:0;font-size:12px;color:#4a5568">${escapeHtml(signature)}</p>
</div></body></html>`;
  return {
    to: toEmail,
    subject: `Покана: ${invite.organization.legalName} във Фактурист`,
    text,
    html,
    attachments: [],
  };
}
