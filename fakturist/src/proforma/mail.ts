import { z } from 'zod';
import { prisma } from '../db.js';
import { BRAND } from '../brand.js';
import { setting } from '../admin/settings.js';
import { bgAmount } from '../documents/pdf.js';
import { fromCents } from '../einvoice/decimal.js';
import { wrap } from '../mail/document-mail.js';
import type { MailMessage } from '../mail/mailer.js';
import { proformaDocumentPdf } from './render.js';

/**
 * Писмото с проформата до получателя (извън Фактурист): PDF, без XML — проформата не е е-фактура.
 * Отказана или вече фактурирана проформа не тръгва, дори писмото да е в опашката.
 */
const Payload = z.object({ proformaId: z.string().min(1) });

const bgDate = (date: Date) => date.toISOString().slice(0, 10).split('-').reverse().join('.');

export async function composeProformaSentMail(
  toEmail: string,
  payload: unknown,
): Promise<MailMessage> {
  const { proformaId } = Payload.parse(payload);
  const proforma = await prisma.proforma.findUniqueOrThrow({
    where: { id: proformaId },
    include: { organization: { select: { legalName: true, email: true } } },
  });
  if (proforma.status !== 'OPEN') throw new Error('Проформата не е отворена');
  const signature = (await setting('documents.signature')) || BRAND.signature;
  const amount = `${bgAmount(fromCents(proforma.payableCents))} ${proforma.currency}`;
  const body = wrap(
    [
      `${proforma.organization.legalName} ви изпраща проформа фактура № ${proforma.number} от ${bgDate(
        proforma.issueDate,
      )} за ${amount}${proforma.validUntil ? `, със срок за плащане ${bgDate(proforma.validUntil)}` : ''}.`,
      'Проформата не е данъчен документ — фактурата се издава при плащането или доставката. Прикачено е PDF копие.',
    ],
    signature,
  );
  return {
    to: toEmail,
    subject: `Проформа фактура № ${proforma.number} от ${proforma.organization.legalName}`,
    ...body,
    ...(proforma.organization.email ? { replyTo: proforma.organization.email } : {}),
    attachments: [
      {
        filename: `proforma-${proforma.number.replace(/\D/g, '')}.pdf`,
        content: await proformaDocumentPdf(proforma),
        contentType: 'application/pdf',
      },
    ],
  };
}
