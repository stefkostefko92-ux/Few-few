import { walkXml } from './xml.js';
import { INGEST_LIMITS, IngestFailure } from './types.js';

/**
 * XLSX лист → таблица (част от собствения четец в `xlsx.ts`): споделените низове, стиловете с
 * дати, клетките по позиция. Кешираните стойности на формулите се четат, формулите НЕ се
 * изпълняват; датите — по формата на клетката. Таванът на клетките е общ за цялата книга.
 */

export interface SheetTable {
  name: string;
  hidden: boolean;
  /** Редовете с клетките по позиция (празните между тях — ''); празните редове са пропуснати. */
  rows: Array<{ index: number; cells: string[] }>;
  columnsTruncated: boolean;
}

export function sharedStrings(xml: string | null): string[] {
  const out: string[] = [];
  if (!xml) return out;
  let current: string[] | null = null;
  let inT = false;
  let phonetic = 0;
  walkXml(xml, {
    open(name) {
      if (name === 'si') current = [];
      else if (name === 'rPh') phonetic += 1;
      else if (name === 't' && phonetic === 0) inT = true;
    },
    close(name) {
      if (name === 'si' && current) {
        out.push(current.join(''));
        current = null;
        if (out.length > INGEST_LIMITS.maxCells) throw new IngestFailure('ingest.err.tooManyCells');
      } else if (name === 'rPh') phonetic -= 1;
      else if (name === 't') inT = false;
    },
    text(t) {
      if (inT && current) current.push(t);
    },
  });
  return out;
}

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);

/** Формат на дата/час: d/m/y/h/s извън кавички, екранирани знаци и [цвят/условие]. */
export function isDateFormat(code: string): boolean {
  if (/\[(h|hh|m|mm|s|ss)\]/i.test(code)) return true;
  const bare = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '');
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim());
}

/** За всеки стил (индекс в cellXfs) — дали числото в клетката е дата. */
export function dateStyles(xml: string | null): boolean[] {
  if (!xml) return [];
  const custom = new Map<number, string>();
  const styles: boolean[] = [];
  let inCellXfs = false;
  walkXml(xml, {
    open(name, a) {
      if (name === 'numFmt' && a.numFmtId && a.formatCode !== undefined) {
        custom.set(Number(a.numFmtId), a.formatCode);
      } else if (name === 'cellXfs') inCellXfs = true;
      else if (name === 'xf' && inCellXfs) {
        const id = Number(a.numFmtId ?? 0);
        const code = custom.get(id);
        styles.push(code !== undefined ? isDateFormat(code) : BUILTIN_DATE_FORMATS.has(id));
      }
    },
    close(name) {
      if (name === 'cellXfs') inCellXfs = false;
    },
  });
  return styles;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Сериен номер на Excel → ISO дата (и час, ако има дробна част). */
export function excelDate(serial: number, date1904: boolean): string {
  const days = date1904 ? serial + 1462 : serial;
  // 1900: Excel брои несъществуващия 29.02.1900 — след него основата е 30.12.1899.
  const base = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const ms = Math.round(base + days * 86_400_000);
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (Number.isInteger(serial)) return date;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return serial < 1 ? time : `${date} ${time}`;
}

/** „AB12“ → индекс на колоната (0 за A); null без валидна буквена част. */
function columnOf(ref: string | undefined): number | null {
  const m = /^([A-Z]{1,3})\d*$/.exec(ref ?? '');
  if (!m?.[1]) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const clean = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

export interface SheetContext {
  strings: string[];
  dates: boolean[];
  date1904: boolean;
  budget: { cells: number };
}

export function readSheet(
  xml: string,
  name: string,
  hidden: boolean,
  ctx: SheetContext,
): SheetTable {
  const table: SheetTable = { name, hidden, rows: [], columnsTruncated: false };
  let row: { index: number; cells: string[] } | null = null;
  let cell: { col: number; t: string; s: number; value: string[] } | null = null;
  let collect: 'v' | 't' | null = null;
  let inInline = 0;
  let phonetic = 0;
  let nextRow = 0;
  let nextCol = 0;
  const value = (c: NonNullable<typeof cell>): string => {
    const raw = c.value.join('');
    if (c.t === 's') return ctx.strings[Number(raw)] ?? '';
    if (c.t === 'b') return raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
    if (c.t === 'inlineStr' || c.t === 'str' || c.t === 'e' || c.t === 'd') return raw;
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return raw;
    if (ctx.dates[c.s] === true && n >= 0 && n < 2_958_466) return excelDate(n, ctx.date1904);
    return String(n);
  };
  walkXml(xml, {
    open(tag, a) {
      if (tag === 'row') {
        const r = Number(a.r);
        row = { index: Number.isInteger(r) && r > 0 ? r : nextRow + 1, cells: [] };
        nextRow = row.index;
        nextCol = 0;
      } else if (tag === 'c' && row) {
        const col = columnOf(a.r) ?? nextCol;
        nextCol = col + 1;
        cell = { col, t: a.t ?? 'n', s: Number(a.s ?? 0), value: [] };
        if (++ctx.budget.cells > INGEST_LIMITS.maxCells) {
          throw new IngestFailure('ingest.err.tooManyCells');
        }
      } else if (tag === 'v' && cell) collect = 'v';
      else if (tag === 'is' && cell) inInline += 1;
      else if (tag === 'rPh') phonetic += 1;
      else if (tag === 't' && cell && inInline > 0 && phonetic === 0) collect = 't';
    },
    close(tag) {
      if (tag === 'v' || tag === 't') collect = null;
      else if (tag === 'is') inInline -= 1;
      else if (tag === 'rPh') phonetic -= 1;
      else if (tag === 'c' && cell && row) {
        const v = clean(value(cell));
        if (v !== '') {
          if (cell.col >= INGEST_LIMITS.maxColumns) table.columnsTruncated = true;
          else {
            while (row.cells.length < cell.col) row.cells.push('');
            row.cells[cell.col] = v;
          }
        }
        cell = null;
      } else if (tag === 'row' && row) {
        if (row.cells.some((c) => c !== '')) table.rows.push(row);
        row = null;
      }
    },
    text(t) {
      if (cell && collect) cell.value.push(t);
    },
  });
  return table;
}
