import type { Citation } from '../domain/response.js';
import type { EvidenceItem } from '../retrieval/types.js';
import { foldText } from './lexicon.js';

/**
 * Цитатите (NFR-10 „без фантомни цитати“): дословният откъс трябва да съществува в текста на
 * източника; иначе цитатът се изпуска. Сравнението прощава само интервали, главни и ударения.
 */

function normalizeForQuote(value: string): string {
  return foldText(value).replace(/\s+/g, ' ').trim();
}

/** Дословният откъс съществува ли в текста на източника (без значение интервали/главни/ударения). */
export function quoteIsVerbatim(quote: string, source: string): boolean {
  const q = normalizeForQuote(quote).replace(/^[.…\s]+|[.…\s]+$/g, '');
  return q.length >= 8 && normalizeForQuote(source).includes(q);
}

export function excerpt(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function citationOf(item: EvidenceItem, quote: string | null): Citation {
  return {
    ref: item.ref,
    kind: item.kind,
    documentId: item.documentId,
    documentCode: item.documentCode,
    documentTitle: item.documentTitle,
    revision: item.revision,
    page: item.page,
    section: item.section,
    quote: quote ?? excerpt(item.text),
    chunkId: item.chunkId,
    errorId: item.errorId,
  };
}
