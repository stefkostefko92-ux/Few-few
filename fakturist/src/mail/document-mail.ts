import { z } from 'zod';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import { documentPdf } from '../documents/render.js';
import { bgAmount } from '../documents/pdf.js';
import { fromCents } from '../einvoice/decimal.js';
import { InvoiceInputSchema } from '../einvoice/index.js';
import { DOWNLOAD_SELECT } from '../routes/app-shared.js';
import { escapeHtml } from './templates.js';
import type { MailMessage } from './mailer.js';

/**
 * Писмата на фирмата до получателя на документ, който не е във Фактурист (SPEC 51–52): издадената
 * повтаряща се фактура (PDF + UBL) и напомнянето за просрочено плащане (PDF). Отговорът отива при
 * фирмата (`replyTo` — имейлът ѝ). Платен или анулиран документ не получава напомняне — писмото се
 * отказва дори да е в опашката.
 */
const SentPayload = z.object({ documentId: z.string().min(1) });
const ReminderPayload = z.object({ documentId: z.string().min(1), step: z.number().int() });

const bgDate = (date: Date) => date.toISOString().slice(0, 10).split('-').reverse().join('.');

async function load(documentId: string) {
  return prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: {
      ...DOWNLOAD_SELECT,
      id: true,
      typeCode: true,
      issueDate: true,
      dueDate: true,
      currency: true,
      payableCents: true,
      paidCents: true,
      paymentState: true,
      organization: { select: { legalName: true, email: true } },
    },
  });
}

function wrap(paragraphs: string[], signature: string): { text: string; html: string } {
  const text = [
    'Здравейте,',
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    '—',
    signature,
    BRAND.signatureDomain,
  ].join('\n');
  const html = `<!doctype html><html lang="bg"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0c1929">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d5dbe3;border-radius:8px;padding:24px">
${paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('\n')}
<p style="margin:0;font-size:12px;color:#4a5568">${escapeHtml(signature)}</p>
</div></body></html>`;
  return { text, html };
}

export async function composeDocumentSentMail(
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const { documentId } = SentPayload.parse(payload);
  const doc = await load(documentId);
  if (doc.status !== 'ISSUED') throw new Error('Документът не е издаден');
  const number = doc.number ?? '';
  const signature = (await setting('documents.signature')) || BRAND.signature;
  const amount = `${bgAmount(fromCents(doc.payableCents))} ${doc.currency}`;
  const body = wrap(
    [
      `${doc.organization.legalName} ви изпраща фактура № ${number} от ${bgDate(doc.issueDate)} за ${amount}${
        doc.dueDate ? `, с падеж ${bgDate(doc.dueDate)}` : ''
      }.`,
      'Прикачени са PDF копие и структурираната е-фактура (UBL 2.1, EN 16931).',
    ],
    signature,
  );
  return {
    to: toEmail,
    subject: `Фактура № ${number} от ${doc.organization.legalName}`,
    ...body,
    ...(doc.organization.email ? { replyTo: doc.organization.email } : {}),
    attachments: [
      {
        filename: `${number}.pdf`,
        content: await documentPdf(doc),
        contentType: 'application/pdf',
      },
      { filename: `${number}-ubl.xml`, content: doc.ublXml ?? '', contentType: 'application/xml' },
    ],
  };
}

export async function composeReminderMail(toEmail: string, payload: unknown): Promise<MailMessage> {
  const { documentId } = ReminderPayload.parse(payload);
  const doc = await load(documentId);
  if (doc.status !== 'ISSUED' || doc.paymentState === 'PAID') {
    throw new Error('Документът е платен или анулиран — без напомняне');
  }
  const number = doc.number ?? '';
  const signature = (await setting('documents.signature')) || BRAND.signature;
  const remaining = `${bgAmount(fromCents(doc.payableCents - doc.paidCents))} ${doc.currency}`;
  const input = InvoiceInputSchema.safeParse(doc.input);
  const account = input.success ? input.data.payment?.accountId : undefined;
  const body = wrap(
    [
      `Напомняне от ${doc.organization.legalName}: фактура № ${number} от ${bgDate(doc.issueDate)}${
        doc.dueDate ? ` с падеж ${bgDate(doc.dueDate)}` : ''
      } не е платена изцяло. Остатък за плащане: ${remaining}.`,
      ...(account ? [`Сметка: ${account}, основание: фактура № ${number}.`] : []),
      'Ако вече сте платили, не обръщайте внимание на това писмо. За въпроси отговорете на писмото — отговорът отива при издателя.',
    ],
    signature,
  );
  return {
    to: toEmail,
    subject: `Напомняне за плащане — фактура № ${number}`,
    ...body,
    ...(doc.organization.email ? { replyTo: doc.organization.email } : {}),
    attachments: [
      {
        filename: `${number}.pdf`,
        content: await documentPdf(doc),
        contentType: 'application/pdf',
      },
    ],
  };
}
