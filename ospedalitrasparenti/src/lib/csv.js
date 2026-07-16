// @ts-check
// Малък CSV парсер за официалните италиански open data файлове:
// разделител „;“ или „,“, кавички по RFC 4180, италиански числа („7.035“, „1.234,56“).

/**
 * Парсва CSV текст до масив от обекти по заглавния ред.
 * @param {string} text
 * @param {{ separator?: string }} [opts]
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text, { separator = ';' } = {}) {
  const rows = parseRows(text, separator);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
    /** @type {Record<string, string>} */
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      if (header[i] === '') continue; // висящ разделител в края на заглавието
      obj[header[i]] = (r[i] ?? '').trim();
    }
    return obj;
  });
}

/**
 * Ниско ниво: парсва редове и клетки, зачитайки кавички и нови редове в тях.
 * @param {string} text
 * @param {string} [separator]
 * @returns {string[][]}
 */
export function parseRows(text, separator = ';') {
  // премахваме BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

/**
 * Поправя двойно кодиран UTF-8 (mojibake), какъвто има в ЧАСТ от записите на
 * ANAC (напр. „UNITÃ “ вместо „UNITÀ“). Прилага се само при разпознат шаблон,
 * за да не се чупят коректните низове. До 2 прохода за двойно-двойно кодиране.
 * @param {string} s
 * @returns {string}
 */
export function fixMojibake(s) {
  if (!s) return s;
  let out = s;
  for (let i = 0; i < 2; i++) {
    if (!/[\u00c2\u00c3][\u0080-\u00bf\u00a0]/.test(out)) break;
    const r = Buffer.from(out, 'latin1').toString('utf8');
    if (r.includes('\ufffd')) break; // не се получи валиден UTF-8 -> спираме
    out = r;
  }
  return out;
}

/**
 * Парсва число от италиански формат.
 * „7.035“ → 7035 (точка = разделител на хиляди), „1.234,56“ → 1234.56,
 * „7858272000.00“ → 7858272000 (машинен формат с десетична точка).
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function parseItalianNumber(value) {
  if (value == null) return null;
  const s = String(value).trim().replace(/\s/g, '');
  if (s === '' || s === '-') return null;
  let normalized;
  if (s.includes(',')) {
    // италиански: точки за хиляди, запетая за десетични
    normalized = s.replaceAll('.', '').replace(',', '.');
  } else if (/^\-?\d+\.\d{1,2}$/.test(s)) {
    // машинен формат: една точка с 1–2 десетични цифри
    normalized = s;
  } else {
    // само точки → разделители на хиляди („7.035“), освен ако е цяло число
    normalized = s.replaceAll('.', '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
