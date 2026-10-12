/**
 * Общото за разбора на файловете (§4.1, §7.3 т. 2–5): форматите, извлечените „страници“,
 * предупрежденията и затвореното множество от кодове за провал. Кодовете са ключове в
 * `public/i18n/*.json` (`ingest.err.*`, `ingest.warn.*`) — никога суровият текст на изключение.
 */

export const INGEST_FORMATS = ['pdf', 'docx', 'xlsx', 'image', 'log'] as const;
export type IngestFormat = (typeof INGEST_FORMATS)[number];

/** Страница на документа (§7.3 „chunking per sezione, tabella e pagina“) — цитатът сочи нея. */
export interface ExtractedPage {
  page: number;
  section?: string;
  text: string;
}

export const WARNING_CODES = [
  'ingest.warn.pageWithoutText',
  'ingest.warn.ocrPageLimit',
  'ingest.warn.ocrPageFailed',
  'ingest.warn.hiddenSheetSkipped',
  'ingest.warn.columnsTruncated',
  'ingest.warn.linesTruncated',
  'ingest.warn.errorRowInvalid',
  'ingest.warn.errorRowsTruncated',
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

/** Предупреждение към качилия — страница/ред/брой, никога съдържание. */
export interface IngestWarning {
  code: WarningCode;
  page?: number;
  /** Ред в листа (импорт на кодове) или брой (страници над тавана). */
  row?: number;
  count?: number;
}

export const FAILURE_CODES = [
  'ingest.err.unsupportedFormat',
  'ingest.err.macroEnabled',
  'ingest.err.archiveInvalid',
  'ingest.err.archiveBomb',
  'ingest.err.encrypted',
  'ingest.err.pdfInvalid',
  'ingest.err.tooManyPages',
  'ingest.err.timeout',
  'ingest.err.ocrUnavailable',
  'ingest.err.ocrFailed',
  'ingest.err.imageTooLarge',
  'ingest.err.imageInvalid',
  'ingest.err.textInvalid',
  'ingest.err.tooManyCells',
  'ingest.err.resourceLimit',
  'ingest.err.emptyDocument',
  'ingest.err.sourceMissing',
  'ingest.err.sourceChanged',
  'ingest.err.duplicateRevision',
  'ingest.err.unknownProduct',
  'ingest.err.deviceNotFound',
  'ingest.err.supersededNotFound',
  'ingest.err.invalidMeta',
  'ingest.err.queueUnavailable',
  'ingest.err.internal',
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/**
 * Провал на разбора. `retryable: false` (по подразбиране) — същият файл ще пропадне пак (враждебен,
 * повреден, неподдържан): задачата не се повтаря, файлът е FAILED веднага. Временните грешки
 * (база, хранилище, таймаут на OCR) са retryable — опашката опитва пак, после dead-letter.
 */
export class IngestFailure extends Error {
  constructor(
    readonly code: FailureCode,
    readonly retryable = false,
  ) {
    super(code);
    this.name = 'IngestFailure';
  }
}

/** Резултатът от разбора на един файл. */
export interface Extraction {
  format: IngestFormat;
  pages: ExtractedPage[];
  warnings: IngestWarning[];
  /** Колко страници са минали през OCR. */
  ocrPages: number;
}

/** Таваните на разбора (враждебни файлове) — едно място, тестовете ги намаляват. */
export const INGEST_LIMITS = {
  /** PagesSchema (services/document-meta.ts): до 3000 страници по 40 000 знака. */
  maxPages: 3000,
  maxPageChars: 40_000,
  /** XLSX: листове, клетки общо, колони на ред, редове на „страница“. */
  maxSheets: 100,
  maxCells: 500_000,
  maxColumns: 200,
  rowsPerPage: 100,
  /** Сурова XML част (след разархивиране) — XLSX лист / DOCX document.xml. */
  maxXmlBytes: 64 * 1024 * 1024,
  /** Логове: редове общо и на „страница“ (ред ≤ MAX_LOG_LINE — заради redactPii). */
  maxLogLines: 200_000,
  logLinesPerPage: 200,
  /** Изображение: пиксели и страна (декомпресионна бомба при OCR). */
  maxImagePixels: 40_000_000,
  maxImageSide: 20_000,
  /** Импорт на кодове за грешка от един XLSX шаблон. */
  maxErrorRows: 2000,
};

/** Режe дълъг текст на парчета ≤ max знака, по възможност на граница на ред. */
export function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest.trim() !== '') parts.push(rest);
  return parts;
}

/** Последователна номерация на страниците + таванът на броя им. */
export function numberPages(pages: ReadonlyArray<Omit<ExtractedPage, 'page'>>): ExtractedPage[] {
  if (pages.length > INGEST_LIMITS.maxPages) throw new IngestFailure('ingest.err.tooManyPages');
  return pages.map((p, i) => ({ ...p, page: i + 1 }));
}
