import type { Prisma } from '@prisma/client';
import { calculate } from '../einvoice/calculate.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { setting } from '../admin/settings.js';
import { renderPdf } from './pdf.js';
import { loadPdfStyle } from './pdf-style.js';
import { isPdfLanguage } from './pdf-labels.js';

/** Записът на документа, който трябва за PDF-а. */
export interface PdfSource {
  /** Фирмата, чийто изглед на PDF се ползва (лого, шрифт, шаблон). */
  organizationId: string;
  number: string | null;
  input: Prisma.JsonValue;
  chainIndex: bigint | null;
  sha256: string | null;
  firm: { legalName: string } | null;
  mandate: { documentRef: string } | null;
  /** Анулиран документ (SPEC 47) — PDF-ът носи печат с датата и новия номер. */
  status?: string;
  cancelledAt?: Date | null;
  replacedBy?: { number: string | null } | null;
  /** Езикът на PDF-а (pdf-labels.ts); липсва — български. */
  pdfLanguage?: string;
}

function annulledText(document: PdfSource): string | null {
  if (document.status !== 'CANCELLED') return null;
  const date = document.cancelledAt
    ? document.cancelledAt.toISOString().slice(0, 10).split('-').reverse().join('.')
    : '';
  const replaced = document.replacedBy?.number
    ? ` — заменен с № ${document.replacedBy.number}`
    : '';
  return `АНУЛИРАН ${date}${replaced} (чл. 116 ЗДДС)`;
}

/**
 * PDF от записания вход: същият вход и същото изчисление като XML-а (не се чете обратно от XML-а).
 * Входът е минал схемата при издаването; повторната проверка пази от повреден ред в базата. Изгледът е
 * на фирмата-доставчик (`organizationId`).
 */
export async function documentPdf(document: PdfSource): Promise<Buffer> {
  const input = InvoiceInputSchema.parse(document.input);
  const [signature, style] = await Promise.all([
    setting('documents.signature'),
    loadPdfStyle(document.organizationId),
  ]);
  return renderPdf(
    input,
    calculate(input),
    {
      number: document.number ?? input.number,
      chainIndex: document.chainIndex,
      sha256: document.sha256,
      signature: signature || undefined,
      issuedVia:
        document.firm && document.mandate
          ? { firm: document.firm.legalName, mandateRef: document.mandate.documentRef }
          : null,
      annulled: annulledText(document),
      language: isPdfLanguage(document.pdfLanguage) ? document.pdfLanguage : 'bg',
    },
    style,
  );
}
