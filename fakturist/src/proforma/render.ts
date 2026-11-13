import type { Prisma } from '@prisma/client';
import { calculate } from '../einvoice/calculate.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { setting } from '../admin/settings.js';
import { renderPdf } from '../documents/pdf.js';
import { loadPdfStyle } from '../documents/pdf-style.js';
import { isPdfLanguage } from '../documents/pdf-labels.js';

/** PDF на проформата: същото тяло като фактурата, без звено от веригата, с бележката „не е данъчен документ“. */
export async function proformaDocumentPdf(proforma: {
  organizationId: string;
  number: string;
  input: Prisma.JsonValue;
  pdfLanguage: string;
}): Promise<Buffer> {
  const input = InvoiceInputSchema.parse(proforma.input);
  const [signature, style] = await Promise.all([
    setting('documents.signature'),
    loadPdfStyle(proforma.organizationId),
  ]);
  return renderPdf(
    input,
    calculate(input),
    {
      number: proforma.number,
      chainIndex: null,
      sha256: null,
      signature: signature || undefined,
      issuedVia: null,
      language: isPdfLanguage(proforma.pdfLanguage) ? proforma.pdfLanguage : 'bg',
      proforma: true,
    },
    style,
  );
}
