import { MAX_LOG_LINE } from '../ai/attachments.js';
import { redactPii } from '../domain/pii.js';
import {
  INGEST_LIMITS,
  IngestFailure,
  numberPages,
  splitText,
  type Extraction,
  type ExtractedPage,
  type IngestWarning,
} from './types.js';

/**
 * Лог (§7.1 „Log CSV/TXT/JSON → parsing“) → текст на „страници“ по 200 реда, разделът е обхватът
 * на редовете. Всеки ред минава през `redactPii` (имейл, телефон, IBAN, CF…) и е с таван
 * MAX_LOG_LINE знака — шаблонът за телефон е свръхлинеен върху дълъг ред. JSON масив → един
 * елемент на ред; JSON обект → форматиран; JSON Lines/CSV/текст — ред по ред.
 */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    throw new IngestFailure('ingest.err.textInvalid');
  }
}

/** Редовете на файла според вида му (JSON — по елемент; иначе — както са). */
function rawLines(text: string, mime: string): string[] {
  if (mime === 'application/json') {
    try {
      const data: unknown = JSON.parse(text);
      if (Array.isArray(data)) return data.map((el) => JSON.stringify(el));
      if (data !== null && typeof data === 'object')
        return JSON.stringify(data, null, 2).split('\n');
    } catch {
      // JSON Lines или повреден JSON — ред по ред като текст.
    }
  }
  return text.split(/\r?\n/);
}

export function extractLog(bytes: Uint8Array, mime: string): Extraction {
  const all = rawLines(decode(bytes), mime);
  const warnings: IngestWarning[] = [];
  const lines: Array<{ n: number; text: string }> = [];
  for (const [i, raw] of all.entries()) {
    const flat = raw.replace(CONTROL, '').trimEnd();
    if (flat.trim() === '') continue;
    if (lines.length >= INGEST_LIMITS.maxLogLines) {
      warnings.push({ code: 'ingest.warn.linesTruncated', count: all.length - i });
      break;
    }
    const capped = flat.length > MAX_LOG_LINE ? `${flat.slice(0, MAX_LOG_LINE)}…` : flat;
    lines.push({ n: i + 1, text: redactPii(capped) });
  }
  if (lines.length === 0) throw new IngestFailure('ingest.err.emptyDocument');
  const pages: Array<Omit<ExtractedPage, 'page'>> = [];
  for (let i = 0; i < lines.length; i += INGEST_LIMITS.logLinesPerPage) {
    const group = lines.slice(i, i + INGEST_LIMITS.logLinesPerPage);
    const first = group[0]?.n ?? 0;
    const last = group[group.length - 1]?.n ?? first;
    // Редовете са разделени с празен ред: парчетата (chunkPages) режат по абзаци.
    const body = group.map((l) => l.text).join('\n\n');
    for (const part of splitText(body, INGEST_LIMITS.maxPageChars)) {
      pages.push({ section: `${first}–${last}`, text: part });
    }
  }
  return { format: 'log', pages: numberPages(pages), warnings, ocrPages: 0 };
}
