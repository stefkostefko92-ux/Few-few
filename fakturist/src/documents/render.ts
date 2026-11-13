import type { Prisma } from '@prisma/client';
import { calculate } from '../einvoice/calculate.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { setting } from '../admin/settings.js';
import { renderPdf } from './pdf.js';
import { loadPdfStyle } from './pdf-style.js';

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
    },
    style,
  );
}
