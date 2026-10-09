import type { Citation, DiagnosticAnswer, ModelDiagnosis } from '../domain/response.js';
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

/**
 * Цитатите на модела: само от пакета, само съвместими, откъсът — дословен. Връща проверените
 * откъси по референция и изпуснатите с причина (код за UI).
 */
export function verifyCitations(
  used: ModelDiagnosis['evidenceUsed'],
  byRef: ReadonlyMap<string, EvidenceItem>,
): {
  verifiedQuotes: Map<string, string>;
  dropped: DiagnosticAnswer['gate']['droppedCitations'];
} {
  const verifiedQuotes = new Map<string, string>();
  const dropped: DiagnosticAnswer['gate']['droppedCitations'] = [];
  for (const u of used) {
    const item = byRef.get(u.ref);
    if (!item) dropped.push({ ref: u.ref, reason: 'gate.citation.notInPack' });
    else if (!item.applicable) dropped.push({ ref: u.ref, reason: 'gate.citation.notApplicable' });
    else if (!quoteIsVerbatim(u.quote, item.text)) {
      dropped.push({ ref: u.ref, reason: 'gate.citation.quoteNotFound' });
    } else if (!verifiedQuotes.has(u.ref)) verifiedQuotes.set(u.ref, u.quote.trim());
  }
  return { verifiedQuotes, dropped };
}
