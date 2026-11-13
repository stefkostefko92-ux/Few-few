import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { calculate } from '../einvoice/calculate.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { setting } from '../admin/settings.js';
import { renderPdf } from './pdf.js';

/** Записът на документа, който трябва за PDF-а. */
export interface PdfSource {
  number: string | null;
  input: Prisma.JsonValue;
  chainIndex: bigint | null;
  sha256: string | null;
  firm: { legalName: string } | null;
  mandate: { documentRef: string } | null;
}

/**
 * PDF от записания вход: същият вход и същото изчисление като XML-а (не се чете обратно от XML-а).
 * Входът е минал схемата при издаването; повторната проверка пази от повреден ред в базата.
 */
export async function documentPdf(document: PdfSource): Promise<Buffer> {
  const input = InvoiceInputSchema.parse(document.input);
  const signature = await setting('documents.signature');
  return renderPdf(input, calculate(input), {
    number: document.number ?? input.number,
    chainIndex: document.chainIndex,
    sha256: document.sha256,
    signature: signature || undefined,
    issuedVia:
      document.firm && document.mandate
        ? { firm: document.firm.legalName, mandateRef: document.mandate.documentRef }
        : null,
    fontDir: config().PDF_FONT_DIR,
  });
}
