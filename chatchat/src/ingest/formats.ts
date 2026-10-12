import { zipNames } from './zip.js';
import type { IngestFormat } from './types.js';

/**
 * Форматите за базата знания (§4.1 „importazione batch di PDF, DOCX, XLSX, immagini e file di
 * log“) — по МАГИЧЕСКИТЕ БАЙТОВЕ и съдържанието на пакета, никога по името. DOCX/XLSX се различават
 * по задължителната си част (`word/document.xml` / `xl/workbook.xml`); пакет с макроси
 * (`vbaProject.bin` — .docm/.xlsm) се отказва: изпълним код в базата знания няма място.
 */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type OoxmlKind = 'docx' | 'xlsx' | 'macro';

/** DOCX/XLSX по имената в централната директория (без разархивиране); null → друг ZIP/не ZIP. */
export function detectOoxml(bytes: Uint8Array): OoxmlKind | null {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  const names = zipNames(bytes);
  if (!names || !names.includes('[Content_Types].xml')) return null;
  if (names.some((n) => /(^|\/)vbaProject\.bin$/i.test(n))) return 'macro';
  if (names.includes('word/document.xml')) return 'docx';
  if (names.includes('xl/workbook.xml')) return 'xlsx';
  return null;
}

/** Форматът за разбора според MIME-а, разпознат при качването (filetype.ts). */
export function formatOfMime(mime: string): IngestFormat | null {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case DOCX_MIME:
      return 'docx';
    case XLSX_MIME:
      return 'xlsx';
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
      return 'image';
    case 'text/plain':
    case 'text/csv':
    case 'application/json':
      return 'log';
    default:
      return null;
  }
}
