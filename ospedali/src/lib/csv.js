// Малък CSV парсер за официалните италиански open data файлове:
// разделител „;“ или „,“, кавички по RFC 4180, италиански числа („7.035“, „1.234,56“).

/** Парсва CSV текст до масив от обекти по заглавния ред. */
export function parseCsv(text, { separator = ';' } = {}) {
  const rows = parseRows(text, separator);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      if (header[i] === '') continue; // висящ разделител в края на заглавието
      obj[header[i]] = (r[i] ?? '').trim();
    }
    return obj;
  });
}

/** Ниско ниво: парсва редове и клетки, зачитайки кавички и нови редове в тях. */
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
 * Парсва число от италиански формат.
 * „7.035“ → 7035 (точка = разделител на хиляди), „1.234,56“ → 1234.56,
 * „7858272000.00“ → 7858272000 (машинен формат с десетична точка).
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
