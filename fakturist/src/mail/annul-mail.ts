import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { escapeHtml } from './templates.js';
import type { MailMessage } from './mailer.js';
import { mailSignature, recipientLocale } from './locale.js';

const Payload = z.object({ inboxEntryId: z.string().min(1), newDocumentId: z.string().min(1) });

/**
 * „Документ № X е анулиран и заменен с № Y“ — до получателя на анулиран документ в шкафчето (SPEC 47).
 * Без прикачени файлове: новият документ идва със своето писмо, ако получателят е регистриран.
 */
export async function composeAnnulledMail(toEmail: string, payload: unknown): Promise<MailMessage> {
  const { inboxEntryId, newDocumentId } = Payload.parse(payload);
  const entry = await prisma.inboxEntry.findUniqueOrThrow({
    where: { id: inboxEntryId },
    include: {
      senderOrg: { select: { legalName: true } },
      document: { select: { number: true, issueDate: true } },
    },
  });
  const replacement = await prisma.document.findUniqueOrThrow({
    where: { id: newDocumentId },
    select: { number: true },
  });
  const locale = await recipientLocale(toEmail);
  const bg = locale === 'bg';
  const [y, m, d] = entry.document.issueDate.toISOString().slice(0, 10).split('-');
  const date = bg ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
  const link = `${config().PUBLIC_BASE_URL}/app/o/${entry.recipientOrgId}/shkafche/${entry.id}`;
  const signature = await mailSignature(locale);
  const oldNumber = entry.document.number ?? '';
  const newNumber = replacement.number ?? '';
  const sender = entry.senderOrg.legalName;
  const body = bg
    ? `${sender} анулира документ № ${oldNumber} от ${date} (чл. 116 ЗДДС) и го замени с № ${newNumber}. Не плащайте по анулирания документ.`
    : `${sender} annulled document No. ${oldNumber} of ${date} (Art. 116 of the Bulgarian VAT Act) and replaced it with No. ${newNumber}. Do not pay the annulled document.`;
  const text = [
    bg ? 'Здравейте,' : 'Hello,',
    '',
    body,
    '',
    `${bg ? 'Шкафчето' : 'The inbox'}: ${link}`,
    '',
    '—',
    signature,
    BRAND.signatureDomain,
  ].join('\n');
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0c1929">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d5dbe3;border-radius:8px;padding:24px">
<p style="margin:0 0 16px">${escapeHtml(body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#03756c;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${bg ? 'Отвори шкафчето' : 'Open the inbox'}</a></p>
<p style="margin:0;font-size:12px;color:#4a5568">${escapeHtml(signature)}</p>
</div></body></html>`;
  return {
    to: toEmail,
    subject: bg
      ? `Анулиран документ № ${oldNumber} от ${sender}`
      : `Annulled document No. ${oldNumber} from ${sender}`,
    text,
    html,
    attachments: [],
  };
}
