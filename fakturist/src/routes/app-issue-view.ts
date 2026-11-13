import type { Request, Response } from 'express';
import { prisma } from '../db.js';
import type { AnnulError } from '../documents/annul.js';
import { ANNUL_REASONS } from '../documents/annul.js';
import { COMMON_UNITS, PAYMENT_MEANS, VAT_CATEGORIES } from '../einvoice/codes.js';
import { catalogForForm } from '../catalog/document-prefill.js';
import { accessPoint, peppolAllowed } from '../peppol/settings.js';
import { newSubmissionToken, submissionToken } from '../documents/submission.js';
import { sofiaToday } from '../time.js';

/** Формата за документ (views/app/document-new.ejs) — изгледът и съобщенията на маршрутите в app-issue.ts. */
export type Issue = { rule: string; path: string; message: { bg: string; en: string } };

export const PROFORMA_MESSAGES: Record<'notOpen' | 'type' | 'buyer', { bg: string; en: string }> = {
  buyer: {
    bg: 'Фактурата от проформа е за същия получател — за друг издайте нова фактура, не от проформата.',
    en: 'An invoice from a pro forma is for the same buyer — for another buyer issue a new invoice, not from the pro forma.',
  },
  notOpen: {
    bg: 'Проформата вече е фактурирана или отказана.',
    en: 'The pro forma invoice has already been invoiced or cancelled.',
  },
  type: {
    bg: 'От проформа се издава фактура или авансова фактура.',
    en: 'A pro forma invoice becomes an invoice or a prepayment invoice.',
  },
};

export const ID = /^[a-z0-9]{20,40}$/;

export const ANNUL_MESSAGES: Record<AnnulError['code'], { bg: string; en: string }> = {
  notFound: {
    bg: 'Документът за анулиране не е намерен.',
    en: 'The document to annul was not found.',
  },
  notIssued: {
    bg: 'Документът вече е анулиран или не е издаден.',
    en: 'The document is already annulled or not issued.',
  },
  hasFollowers: {
    bg: 'Към документа има издадени известия — поправката е чрез известие, не чрез анулиране.',
    en: 'Notes have been issued for this document — correct it with a note, not by annulment.',
  },
  typeMismatch: {
    bg: 'Новият документ трябва да е от същия вид като анулирания.',
    en: 'The new document must be of the same type as the annulled one.',
  },
  invalidReason: {
    bg: 'Изберете основанието за анулиране.',
    en: 'Choose the reason for the annulment.',
  },
  overpaid: {
    bg: 'Платеното по анулирания документ надхвърля сумата на новия — първо уредете разликата (известие или връщане).',
    en: 'The amount paid on the annulled document exceeds the new one — settle the difference first (note or refund).',
  },
};

export function bodyString(req: Request, name: string): string | undefined {
  const value = (req.body as Record<string, unknown>)[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export async function renderNewDocument(
  req: Request,
  res: Response,
  organizationId: string,
  issues: Issue[] | null,
  values: unknown,
  status = 200,
): Promise<void> {
  const form =
    typeof values === 'object' && values !== null ? (values as Record<string, unknown>) : {};
  const replacesId = typeof form['replaces'] === 'string' ? form['replaces'] : null;
  const proformaId =
    typeof form['fromProforma'] === 'string' && ID.test(form['fromProforma'])
      ? form['fromProforma']
      : null;
  const [org, series, catalog, replacing, proforma, participant, ap, peppolOk] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.documentSeries.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    catalogForForm(organizationId),
    replacesId
      ? prisma.document.findFirst({
          where: { id: replacesId, organizationId },
          select: { id: true, number: true, issueDate: true, typeCode: true },
        })
      : Promise.resolve(null),
    proformaId
      ? prisma.proforma.findFirst({
          where: { id: proformaId, organizationId },
          select: { id: true, number: true },
        })
      : Promise.resolve(null),
    prisma.peppolParticipant.findUnique({
      where: { organizationId },
      select: { status: true },
    }),
    accessPoint(),
    peppolAllowed(organizationId),
  ]);
  // qs дава масив до 20 реда, а над това — обект с ключове „0“, „1“… (src/documents/form.ts, list()).
  const rawLines = form['lines'];
  const lines = Array.isArray(rawLines)
    ? rawLines.length
    : typeof rawLines === 'object' && rawLines !== null
      ? Object.keys(rawLines).length
      : 0;
  const today = sofiaToday();
  // Ключът се пази при повторно показване след грешка (нищо не е издадено) — иначе нов.
  const issueToken =
    submissionToken((form as Record<string, unknown>)['issueToken']) ?? newSubmissionToken();
  res.status(status).render('app/document-new', {
    issueToken,
    org,
    series,
    parties: catalog.parties,
    items: catalog.items,
    scripts: ['document-form'],
    issues,
    values: form,
    replacing,
    proforma,
    peppolReady: ap !== null && peppolOk && participant?.status === 'ACTIVE',
    annulReasons: ANNUL_REASONS,
    today,
    units: COMMON_UNITS,
    categories: VAT_CATEGORIES,
    paymentMeans: PAYMENT_MEANS,
    lineCount: Math.max(6, lines + 1),
    canIssue: true,
    reqPath: req.path,
  });
}
