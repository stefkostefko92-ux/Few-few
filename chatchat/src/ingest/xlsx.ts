import { walkXml, XmlError } from './xml.js';
import { entryMap, readZip, ZipError, type ZipEntry } from './zip.js';
import {
  INGEST_LIMITS,
  IngestFailure,
  numberPages,
  splitText,
  type Extraction,
  type ExtractedPage,
  type IngestWarning,
} from './types.js';
import {
  clean,
  dateStyles,
  readSheet,
  sharedStrings,
  type SheetContext,
  type SheetTable,
} from './xlsx-sheet.js';

/**
 * XLSX → таблици като текст (§4.1, §7.1 „DB strutturato“): всеки видим лист е раздел, редовете —
 * „колона | колона“, на „страници“ по 100 реда (заглавният ред се повтаря на всяка). Собствен
 * четец само за четене върху проверения ZIP (zip.ts) и XML без DTD (xml.ts): старият пакет `xlsx`
 * от npm не се ползва (неподдържан, известни уязвимости), а `exceljs` 4.4.0 носи остарели
 * зависимости за запис (archiver, unzipper, tmp, uuid < 11), които четенето не иска. Кешираните
 * стойности на формулите се четат, формулите НЕ се изпълняват; датите — по формата на клетката.
 */

// Листът (клетки, низове, дати) — в `xlsx-sheet.ts`; тук остават книгата и страниците.
export { excelDate, isDateFormat, type SheetTable } from './xlsx-sheet.js';

const text = (e: ZipEntry | undefined): string | null => {
  if (!e) return null;
  if (e.data.length > INGEST_LIMITS.maxXmlBytes) throw new IngestFailure('ingest.err.tooManyCells');
  return e.data.toString('utf8');
};

/** Целевият път на връзка (относителен към xl/ или абсолютен в пакета). */
function resolveTarget(target: string): string {
  const parts = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/** Всички листове на книгата (видими и скрити) — за текста и за шаблона на кодовете. */
export function readWorkbook(bytes: Uint8Array): SheetTable[] {
  let entries: Map<string, ZipEntry>;
  try {
    entries = entryMap(readZip(bytes));
  } catch (err) {
    if (err instanceof ZipError) {
      throw new IngestFailure(
        ['bomb', 'too_large', 'too_many_entries', 'overlap'].includes(err.reason)
          ? 'ingest.err.archiveBomb'
          : err.reason === 'encrypted'
            ? 'ingest.err.encrypted'
            : 'ingest.err.archiveInvalid',
      );
    }
    throw err;
  }
  try {
    const workbook = text(entries.get('xl/workbook.xml'));
    if (!workbook) throw new IngestFailure('ingest.err.archiveInvalid');
    const rels = new Map<string, string>();
    walkXml(text(entries.get('xl/_rels/workbook.xml.rels')) ?? '', {
      open(name, a) {
        if (name === 'Relationship' && a.Id && a.Target && /\/worksheet$/.test(a.Type ?? '')) {
          rels.set(a.Id, resolveTarget(a.Target));
        }
      },
    });
    const sheets: Array<{ name: string; target: string; hidden: boolean }> = [];
    let date1904 = false;
    walkXml(workbook, {
      open(name, a) {
        if (name === 'workbookPr') date1904 = a.date1904 === '1' || a.date1904 === 'true';
        if (name !== 'sheet') return;
        const target = rels.get(a['r:id'] ?? a.id ?? '');
        if (!target) return;
        sheets.push({
          name: clean(a.name ?? ''),
          target,
          hidden: (a.state ?? 'visible') !== 'visible',
        });
      },
    });
    if (sheets.length > INGEST_LIMITS.maxSheets) throw new IngestFailure('ingest.err.tooManyCells');
    const ctx: SheetContext = {
      strings: sharedStrings(text(entries.get('xl/sharedStrings.xml'))),
      dates: dateStyles(text(entries.get('xl/styles.xml'))),
      date1904,
      budget: { cells: 0 },
    };
    return sheets.flatMap((s) => {
      const xml = text(entries.get(s.target));
      return xml === null ? [] : [readSheet(xml, s.name, s.hidden, ctx)];
    });
  } catch (err) {
    if (err instanceof XmlError) throw new IngestFailure('ingest.err.archiveInvalid');
    throw err;
  }
}

const line = (cells: readonly string[]) =>
  cells.map((c) => c.replace(/\s*\n\s*/g, ' / ')).join(' | ');

/** Видимите листове → страници: раздел = името на листа, заглавният ред — на всяка страница. */
export function sheetPages(sheets: readonly SheetTable[]): {
  pages: Array<Omit<ExtractedPage, 'page'>>;
  warnings: IngestWarning[];
} {
  const pages: Array<Omit<ExtractedPage, 'page'>> = [];
  const warnings: IngestWarning[] = [];
  for (const sheet of sheets) {
    if (sheet.hidden) {
      warnings.push({ code: 'ingest.warn.hiddenSheetSkipped' });
      continue;
    }
    if (sheet.rows.length === 0) continue;
    if (sheet.columnsTruncated) {
      warnings.push({ code: 'ingest.warn.columnsTruncated', page: pages.length + 1 });
    }
    const [header, ...body] = sheet.rows;
    const headerLine = header ? line(header.cells) : '';
    const section = sheet.name.slice(0, 200) || undefined;
    const per = INGEST_LIMITS.rowsPerPage;
    const groups: Array<typeof body> = body.length === 0 ? [[]] : [];
    for (let i = 0; i < body.length; i += per) groups.push(body.slice(i, i + per));
    for (const group of groups) {
      const content = [headerLine, ...group.map((r) => line(r.cells))].join('\n');
      for (const part of splitText(content, INGEST_LIMITS.maxPageChars)) {
        pages.push({ ...(section ? { section } : {}), text: part });
      }
    }
  }
  return { pages, warnings };
}

/** XLSX → извличане (страници + предупреждения) и листовете (за импорта на кодове). */
export function extractXlsx(bytes: Uint8Array): { extraction: Extraction; sheets: SheetTable[] } {
  const sheets = readWorkbook(bytes);
  const { pages, warnings } = sheetPages(sheets);
  if (pages.length === 0) throw new IngestFailure('ingest.err.emptyDocument');
  return {
    extraction: { format: 'xlsx', pages: numberPages(pages), warnings, ocrPages: 0 },
    sheets,
  };
}
