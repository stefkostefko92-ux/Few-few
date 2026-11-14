import type { PdfLanguage } from './pdf-labels.js';

/** Данните за PDF-а извън входа на документа (pdf.ts): номер, звено, подпис, пълномощно, печат, език. */
export interface PdfMeta {
  number: string;
  chainIndex: bigint | null;
  sha256: string | null;
  signature: string | undefined;
  /** Кантората и пълномощното, когато документът е издаден от името на фирмата. */
  issuedVia: { firm: string; mandateRef: string } | null;
  annulled?: string | null; // „АНУЛИРАН …“ горе на всяка страница (чл. 116 ЗДДС, pdf-stamp.ts)
  /** Български или двуезичен (pdf-labels.ts); липсва — български. */
  language?: PdfLanguage;
  /** Проформа (src/proforma/): заглавие „ПРОФОРМА ФАКТУРА“, без дата на данъчно събитие, с бележка, че не е данъчен документ. */
  proforma?: boolean;
}
