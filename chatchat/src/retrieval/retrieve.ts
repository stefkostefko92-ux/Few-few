import { canonicalIdentifier, normalizeQuery } from '../domain/normalize.js';
import type { EvidenceLevel } from '../domain/response.js';
import { isApplicable, type ProductVersion } from '../domain/versions.js';
import type {
  EvidenceItem,
  KnowledgeStore,
  MatchKind,
  RawEvidence,
  RetrievalRequest,
  RetrievalResult,
} from './types.js';

/**
 * Хибридното търсене (§8.1): нормализация → точно (кодове, клеми, модел) → пълнотекстово →
 * филтър по съвместимост → подреждане → доказателствен пакет E1…En.
 * Точните съвпадения имат привилегирован път (§8.2) и не се режат от лимита.
 */

export const MAX_PACK = 12;
const DEFAULT_FULLTEXT_LIMIT = 8;
/** Несъвместимото не изчезва (за да се види конфликтът), но пада под всяко съвместимо. */
export const NOT_APPLICABLE_FACTOR = 0.3;

export function versionOf(req: RetrievalRequest): ProductVersion {
  const fromQuery = normalizeQuery(req.query);
  return {
    hwRevision: req.context.hardwareRevision ?? fromQuery.hardwareRevision,
    firmware: req.context.firmware ?? fromQuery.firmware,
  };
}

export function keyOf(item: Pick<RawEvidence, 'chunkId' | 'errorId'>): string {
  return item.chunkId ?? `error:${item.errorId ?? ''}`;
}

export function baseScore(matchedBy: MatchKind[], fulltextShare: number): number {
  if (matchedBy.includes('exact_code')) return 1;
  if (matchedBy.includes('exact_ref')) return 0.8;
  return 0.7 * fulltextShare;
}

export async function retrieve(
  store: KnowledgeStore,
  req: RetrievalRequest,
): Promise<RetrievalResult> {
  const normalized = normalizeQuery(req.query);
  const identifiers = new Set(normalized.identifiers);
  if (req.context.errorCode) identifiers.add(canonicalIdentifier(req.context.errorCode));
  // „LTX-500“ във въпроса е самият модел, не код или клема.
  identifiers.delete(canonicalIdentifier(req.context.productModel));
  const ids = [...identifiers];
  const model = req.context.productModel;

  const [errors, byRef, fulltext] = await Promise.all([
    ids.length > 0 ? store.findErrors(req.scope, model, ids) : Promise.resolve([]),
    ids.length > 0 ? store.findChunksByIdentifiers(req.scope, model, ids) : Promise.resolve([]),
    normalized.text.length > 0
      ? store.searchChunks(req.scope, model, normalized.text, req.limit ?? DEFAULT_FULLTEXT_LIMIT)
      : Promise.resolve([]),
  ]);

  const merged = new Map<string, RawEvidence>();
  for (const item of [...errors, ...byRef, ...fulltext]) {
    const key = keyOf(item);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...item, matchedBy: [...item.matchedBy] });
      continue;
    }
    prev.matchedBy = [...new Set([...prev.matchedBy, ...item.matchedBy])];
    prev.rawScore = Math.max(prev.rawScore, item.rawScore);
  }

  const version = versionOf(req);
  const maxFulltext = Math.max(
    0,
    ...fulltext.map((f) => f.rawScore).filter((s) => Number.isFinite(s)),
  );
  const ranked = [...merged.values()]
    .map((raw) => {
      const applicable = raw.rules.some((rule) => isApplicable(rule, version));
      const share = maxFulltext > 0 ? raw.rawScore / maxFulltext : 0;
      const score = baseScore(raw.matchedBy, share) * (applicable ? 1 : NOT_APPLICABLE_FACTOR);
      return { raw, applicable, score };
    })
    .sort((a, b) => b.score - a.score);

  const exact = ranked.filter((r) => r.raw.matchedBy.some((m) => m !== 'fulltext'));
  const rest = ranked.filter((r) => r.raw.matchedBy.every((m) => m === 'fulltext'));
  const pack = [...exact, ...rest].slice(0, Math.max(MAX_PACK, exact.length));

  const items: EvidenceItem[] = pack.map(({ raw, applicable, score }, i) => {
    const { rawScore: _rawScore, rules: _rules, ...rest } = raw;
    return { ...rest, ref: `E${i + 1}`, applicable, score: Math.round(score * 1000) / 1000 };
  });

  const found = new Set<string>();
  for (const item of items) {
    if (item.errorCode) found.add(canonicalIdentifier(item.errorCode));
  }
  for (const item of byRef) {
    for (const id of ids) if (item.text.toUpperCase().includes(id)) found.add(id);
  }

  return {
    items,
    unknownIdentifiers: ids.filter((id) => !found.has(id)),
    conflicts: findConflicts(items),
  };
}

/**
 * Противоречия (§8.2 „при конфликт — изрично“): един и същ код за грешка с различни описания,
 * или един и същ документ в две ревизии — и двата записа съвместими с таблото.
 */
export function findConflicts(items: EvidenceItem[]): RetrievalResult['conflicts'] {
  const conflicts: RetrievalResult['conflicts'] = [];
  const applicable = items.filter((i) => i.applicable);

  const byCode = new Map<string, EvidenceItem[]>();
  for (const item of applicable) {
    if (item.kind !== 'error' || !item.errorCode) continue;
    const list = byCode.get(item.errorCode) ?? [];
    list.push(item);
    byCode.set(item.errorCode, list);
  }
  for (const [code, list] of byCode) {
    const meanings = new Set(list.map((i) => i.text.trim().toLowerCase()));
    if (list.length > 1 && meanings.size > 1) {
      conflicts.push({ description: `error:${code}`, refs: list.map((i) => i.ref) });
    }
  }

  const byDoc = new Map<string, EvidenceItem[]>();
  for (const item of applicable) {
    if (item.kind !== 'document') continue;
    const list = byDoc.get(item.documentCode) ?? [];
    list.push(item);
    byDoc.set(item.documentCode, list);
  }
  for (const [code, list] of byDoc) {
    const revisions = new Set(list.map((i) => i.revision));
    if (revisions.size > 1) {
      conflicts.push({ description: `revision:${code}`, refs: list.map((i) => i.ref) });
    }
  }
  return conflicts;
}

/**
 * Праговете (§8.3), изчислени детерминистично от пакета — моделът не ги определя.
 *  strong   — точен код за грешка, съвместим с версията → водена диагностика
 *  high     — поне два съвместими източника от различни документи → висока/средна увереност
 *  weak     — един съвместим източник → предпазлив отговор + искане на контекст
 *  conflict — противоречие между съвместими източници → без автоматична сигурност
 *  none     — нищо съвместимо → ескалация или искане на нови данни
 */
export function evidenceLevel(result: RetrievalResult): EvidenceLevel {
  const applicable = result.items.filter((i) => i.applicable);
  if (applicable.length === 0) return 'none';
  if (result.conflicts.length > 0) return 'conflict';
  if (applicable.some((i) => i.kind === 'error' && i.matchedBy.includes('exact_code'))) {
    return 'strong';
  }
  const docs = new Set(applicable.filter((i) => i.score >= 0.35).map((i) => i.documentId));
  return docs.size >= 2 ? 'high' : 'weak';
}
