import { z } from 'zod';
import { sanitizeFileName } from '../services/filetype.js';

/**
 * Манифестът на пакета (§4.1, по избор): различни метаданни за всеки файл, ключът е името му (същото
 * изчистване като при качването — sanitizeFileName). CSV (`,` или `;`, кавички по RFC 4180) с колона
 * `file` и плоски колони; правилото за приложимост е едно на ред (productModel, hwRevision,
 * fwMin/fwMax — празни → всички версии, deviceSerial). JSON: масив от обекти `{ file, …метаданни }`
 * (applicability — пълният масив). Проверката на стойностите е при добавяне на файла (ItemMetaSchema).
 */

export const MANIFEST_MAX_ROWS = 3000;

export type ManifestRow = Record<string, unknown>;

export interface ManifestIssue {
  row: number;
  reason: 'no_file' | 'duplicate_file' | 'not_object' | 'too_many_rows' | 'unreadable';
}

/** CSV → редове от низове (кавички, удвоени кавички, нови редове в кавички). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const APPLICABILITY_KEYS = new Set([
  'productModel',
  'hwRevision',
  'fwMin',
  'fwMax',
  'deviceSerial',
]);

/** Плосък CSV ред → обект на метаданните (с applicability от колоните за правилото). */
function csvRow(header: readonly string[], cells: readonly string[]): ManifestRow {
  const flat: Record<string, string> = {};
  header.forEach((h, i) => {
    const v = (cells[i] ?? '').trim();
    if (h && v !== '') flat[h] = v;
  });
  const out: ManifestRow = {};
  for (const [k, v] of Object.entries(flat)) {
    if (APPLICABILITY_KEYS.has(k)) continue;
    out[k] = k === 'safetyRelevant' ? /^(1|true|yes|si|sì|да|x)$/i.test(v) : v;
  }
  if (flat.productModel) {
    const fw = flat.fwMin || flat.fwMax;
    out.applicability = [
      {
        productModel: flat.productModel,
        ...(flat.hwRevision ? { hwRevision: flat.hwRevision } : {}),
        ...(flat.fwMin ? { fwMin: flat.fwMin } : {}),
        ...(flat.fwMax ? { fwMax: flat.fwMax } : {}),
        ...(fw ? {} : { allFirmware: true }),
        ...(flat.deviceSerial ? { deviceSerial: flat.deviceSerial } : {}),
      },
    ];
  }
  return out;
}

export const ManifestInput = z
  .object({ format: z.enum(['csv', 'json']), text: z.string().min(1).max(1_000_000) })
  .strict();

/** Манифестът по изчистено име на файл, или проблемите по ред (тогава пакетът не се създава). */
export function parseManifest(
  input: z.infer<typeof ManifestInput>,
): { ok: true; rows: Map<string, ManifestRow> } | { ok: false; issues: ManifestIssue[] } {
  let raw: unknown[];
  if (input.format === 'json') {
    try {
      const data: unknown = JSON.parse(input.text);
      raw = Array.isArray(data) ? data : [];
      if (!Array.isArray(data)) return { ok: false, issues: [{ row: 0, reason: 'unreadable' }] };
    } catch {
      return { ok: false, issues: [{ row: 0, reason: 'unreadable' }] };
    }
  } else {
    const [header, ...body] = parseCsv(input.text);
    const names = (header ?? []).map((h) => h.trim());
    raw = body.map((cells) => csvRow(names, cells));
  }
  if (raw.length > MANIFEST_MAX_ROWS) {
    return { ok: false, issues: [{ row: 0, reason: 'too_many_rows' }] };
  }
  // Map, не обект: име на файл „__proto__“ не стига до прототипа.
  const rows = new Map<string, ManifestRow>();
  const issues: ManifestIssue[] = [];
  raw.forEach((entry, i) => {
    const row = i + 1;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ row, reason: 'not_object' });
      return;
    }
    const { file, ...meta } = entry as Record<string, unknown>;
    if (typeof file !== 'string' || file.trim() === '') {
      issues.push({ row, reason: 'no_file' });
      return;
    }
    const key = sanitizeFileName(file);
    if (rows.has(key)) {
      issues.push({ row, reason: 'duplicate_file' });
      return;
    }
    rows.set(key, meta);
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, rows };
}
