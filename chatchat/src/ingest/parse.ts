import { extractPdfText } from '../services/pdf.js';
import { extractDocx } from './docx.js';
import { findErrorTemplate, type TemplateResult } from './error-template.js';
import { extractLog } from './log.js';
import { IngestFailure, type Extraction, type FailureCode } from './types.js';
import { extractXlsx } from './xlsx.js';

/**
 * Разборът на един файл без OCR и без база (§7.3 т. 2): PDF (текстовият слой по страници), DOCX,
 * XLSX (+ шаблонът за кодове), лог. Чиста функция върху байтовете — тече в отделна нишка
 * (isolate.ts), така враждебен файл не държи event loop-а на worker-а и не изяжда паметта му.
 */

export type ParseFormat = 'pdf' | 'docx' | 'xlsx' | 'log';

export interface ParseRequest {
  format: ParseFormat;
  mime: string;
  bytes: Uint8Array;
  /** XLSX: търси лист-шаблон за кодове за грешка. */
  template: boolean;
  /** Вътрешният срок на pdf.js (общият срок пази нишката). */
  pdfTimeoutMs: number;
}

export type ParseOutcome =
  | { ok: true; extraction: Extraction; template: TemplateResult | null }
  | { ok: false; code: FailureCode; retryable: boolean };

const PDF_FAILURE: Record<string, FailureCode> = {
  encrypted: 'ingest.err.encrypted',
  invalid: 'ingest.err.pdfInvalid',
  too_many_pages: 'ingest.err.tooManyPages',
  timeout: 'ingest.err.timeout',
};

async function parse(req: ParseRequest): Promise<{
  extraction: Extraction;
  template: TemplateResult | null;
}> {
  switch (req.format) {
    case 'pdf': {
      const r = await extractPdfText(req.bytes, req.pdfTimeoutMs);
      if (!r.ok) throw new IngestFailure(PDF_FAILURE[r.reason] ?? 'ingest.err.pdfInvalid');
      return {
        extraction: { format: 'pdf', pages: r.pages, warnings: [], ocrPages: 0 },
        template: null,
      };
    }
    case 'docx':
      return { extraction: await extractDocx(req.bytes), template: null };
    case 'xlsx': {
      const { extraction, sheets } = extractXlsx(req.bytes);
      const template = req.template ? findErrorTemplate(sheets, extraction.pages) : null;
      return { extraction, template };
    }
    case 'log':
      return { extraction: extractLog(req.bytes, req.mime), template: null };
  }
}

/** Никога не хвърля: провалът е код (`ingest.err.*`), неочакваното — `internal`. */
export async function parseDocument(req: ParseRequest): Promise<ParseOutcome> {
  try {
    return { ok: true, ...(await parse(req)) };
  } catch (err) {
    if (err instanceof IngestFailure)
      return { ok: false, code: err.code, retryable: err.retryable };
    return { ok: false, code: 'ingest.err.internal', retryable: false };
  }
}
