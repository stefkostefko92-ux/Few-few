import type { DiagnosticContext } from '../domain/context.js';
import { canonicalIdentifier, normalizeQuery } from '../domain/normalize.js';
import { applicabilityFields, applicabilityOf } from './applicability.js';
import { applyBoardOverride, findConflicts } from './levels.js';
import {
  DEFAULT_FULLTEXT_LIMIT,
  DEFAULT_SEMANTIC_LIMIT,
  FULLTEXT_WEIGHT,
  LEXICAL_SUPPORT_SCORE,
  MAX_PACK,
  NOT_APPLICABLE_FACTOR,
  RRF_K,
  SEMANTIC_MIN_SIMILARITY,
} from './thresholds.js';
import {
  isExactMatch,
  type CaseVersion,
  type EvidenceItem,
  type KnowledgeStore,
  type MatchKind,
  type RawEvidence,
  type RetrievalRequest,
  type RetrievalResult,
} from './types.js';

/**
 * Хибридното търсене (§8.1): нормализация → точно (кодове, клеми, модел) → пълнотекстово +
 * семантично (pgvector) → филтър по съвместимост и валидност → подреждане → пакет E1…En.
 * Точните съвпадения имат привилегирован път (§8.2) и не се режат от лимита; пълнотекстовото и
 * семантичното се сливат с Reciprocal Rank Fusion (RRF), без да се смесват мащабите им. В двете
 * групи документът за ТАБЛОТО на случая е пред общите за модела (уникалните схеми).
 */

export * from './thresholds.js';
export { cappedLevel, evidenceLevel, findConflicts, wouldBeRelevant } from './levels.js';

/**
 * Версията на случая за приложимостта: HW/FW от контекста (или от въпроса), провереното табло от
 * сървъра и опциите на конфигурацията от контекста (FR-01 — попълнени от регистъра при случай от
 * табло/QR, редактируеми като HW/FW по FR-02).
 */
export function versionOf(req: Pick<RetrievalRequest, 'context' | 'query' | 'scope'>): CaseVersion {
  const fromQuery = normalizeQuery(req.query);
  return {
    hwRevision: req.context.hardwareRevision ?? fromQuery.hardwareRevision,
    firmware: req.context.firmware ?? fromQuery.firmware,
    deviceId: req.scope.deviceId ?? null,
    options: req.context.options,
  };
}

export function keyOf(item: Pick<RawEvidence, 'chunkId' | 'errorId'>): string {
  return item.chunkId ?? `error:${item.errorId ?? ''}`;
}

/** Лексикалната релевантност: точно > пълнотекстово; само семантично съвпадение → 0. */
export function baseScore(matchedBy: MatchKind[], fulltextShare: number): number {
  if (matchedBy.includes('exact_code')) return 1;
  if (matchedBy.includes('exact_ref')) return 0.8;
  if (matchedBy.includes('fulltext')) return FULLTEXT_WEIGHT * fulltextShare;
  return 0;
}

/** Ранговете (1…n) по ключ в един списък, подреден по `by` низходящо. */
function ranks(list: RawEvidence[], by: (r: RawEvidence) => number): Map<string, number> {
  const out = new Map<string, number>();
  [...list]
    .sort((a, b) => by(b) - by(a))
    .forEach((r, i) => {
      const key = keyOf(r);
      if (!out.has(key)) out.set(key, i + 1);
    });
  return out;
}

/** RRF върху няколко рангови списъка: записът, намерен и по двата пътя, се изкачва. */
export function rrfScore(key: string, lists: ReadonlyArray<ReadonlyMap<string, number>>): number {
  let score = 0;
  for (const list of lists) {
    const rank = list.get(key);
    if (rank !== undefined) score += 1 / (RRF_K + rank);
  }
  return score;
}

/** Идентификаторите на СЛУЧАЯ: от въпроса и кода в контекста (без самия модел). */
export function caseIdentifiers(context: DiagnosticContext, query: string): Set<string> {
  const identifiers = new Set(normalizeQuery(query).identifiers);
  if (context.errorCode) identifiers.add(canonicalIdentifier(context.errorCode));
  // „LTX-500“ във въпроса е самият модел, не код или клема.
  identifiers.delete(canonicalIdentifier(context.productModel));
  return identifiers;
}

/**
 * Семантичното търсене е подкрепа, не условие: грешка на доставчика на embeddings или на базата
 * (напр. няма pgvector) не събаря точното и пълнотекстовото търсене. Fail-open е САМО тук —
 * генерирането на отговор остава fail-closed.
 */
async function searchSemanticSafe(
  store: KnowledgeStore,
  req: RetrievalRequest,
  text: string,
): Promise<RawEvidence[]> {
  try {
    return await store.searchSemantic(
      req.scope,
      req.context.productModel,
      text,
      DEFAULT_SEMANTIC_LIMIT,
    );
  } catch {
    return [];
  }
}

/**
 * Случай без проверено табло: има ли по въпроса документи САМО за конкретни табла, които биха
 * били източник (точно съвпадение или пълнотекстово над прага за подкрепа спрямо общите)? Тогава
 * отговорът иска сериен номер/QR. Съдържанието им не влиза в пакета.
 */
async function needsBoard(
  store: KnowledgeStore,
  req: RetrievalRequest,
  ids: string[],
  text: string,
): Promise<{ identifiers: string[]; rank: number } | null> {
  if (req.scope.deviceId || !store.boardSpecificMatches) return null;
  try {
    return await store.boardSpecificMatches(req.scope, req.context.productModel, ids, text);
  } catch {
    return null;
  }
}

export async function retrieve(
  store: KnowledgeStore,
  req: RetrievalRequest,
): Promise<RetrievalResult> {
  const normalized = normalizeQuery(req.query);
  const ids = [...caseIdentifiers(req.context, req.query)];
  const model = req.context.productModel;
  const now = req.now ?? new Date();

  const [errors, byRef, fulltext, semanticRaw, board] = await Promise.all([
    ids.length > 0 ? store.findErrors(req.scope, model, ids) : Promise.resolve([]),
    ids.length > 0 ? store.findChunksByIdentifiers(req.scope, model, ids) : Promise.resolve([]),
    normalized.text.length > 0
      ? store.searchChunks(req.scope, model, normalized.text, req.limit ?? DEFAULT_FULLTEXT_LIMIT)
      : Promise.resolve([]),
    normalized.text.length > 0 ? searchSemanticSafe(store, req, normalized.text) : [],
    needsBoard(store, req, ids, normalized.text),
  ]);
  // Само документни парчета над прага; rawScore не носи сходството (различен мащаб от ts_rank).
  const semantic: RawEvidence[] = semanticRaw
    .filter((r) => r.kind === 'document' && (r.similarity ?? 0) >= SEMANTIC_MIN_SIMILARITY)
    .map((r) => ({ ...r, matchedBy: ['semantic'], rawScore: 0 }));

  const merged = new Map<string, RawEvidence>();
  for (const item of [...errors, ...byRef, ...fulltext, ...semantic]) {
    const key = keyOf(item);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...item, matchedBy: [...item.matchedBy] });
      continue;
    }
    prev.matchedBy = [...new Set([...prev.matchedBy, ...item.matchedBy])];
    prev.rawScore = Math.max(prev.rawScore, item.rawScore);
    if (item.similarity !== undefined) {
      prev.similarity = Math.max(prev.similarity ?? 0, item.similarity);
    }
  }

  const version = versionOf(req);
  const maxFulltext = Math.max(
    0,
    ...fulltext.map((f) => f.rawScore).filter((s) => Number.isFinite(s)),
  );
  const rankLists = [ranks(fulltext, (r) => r.rawScore), ranks(semantic, (r) => r.similarity ?? 0)];
  const scored = [...merged.values()].map((raw) => {
    const a = applicabilityOf(raw, version, now);
    const factor = a.applicable ? 1 : NOT_APPLICABLE_FACTOR;
    const share = maxFulltext > 0 ? raw.rawScore / maxFulltext : 0;
    const score = baseScore(raw.matchedBy, share) * factor;
    const fused = rrfScore(keyOf(raw), rankLists) * factor;
    return { raw, a, own: a.applicable && a.boardSpecific ? 1 : 0, score, fused };
  });

  // Точните — първи, по лексикалната релевантност; останалите — по RRF (после по score). В
  // двете групи схемата на таблото на случая е пред общите за модела.
  const exact = scored
    .filter((r) => r.raw.matchedBy.some(isExactMatch))
    .sort((a, b) => b.own - a.own || b.score - a.score);
  const rest = scored
    .filter((r) => !r.raw.matchedBy.some(isExactMatch))
    .sort((a, b) => b.own - a.own || b.fused - a.fused || b.score - a.score);
  const pack = [...exact, ...rest].slice(0, Math.max(MAX_PACK, exact.length));

  const items: EvidenceItem[] = applyBoardOverride(
    pack.map(({ raw, a, score }, i) => {
      const {
        rawScore: _rawScore,
        rules: _rules,
        effectiveFrom: _from,
        effectiveTo: _to,
        similarity,
        ...fields
      } = raw;
      const item: EvidenceItem = {
        ...fields,
        ref: `E${i + 1}`,
        ...applicabilityFields(a),
        score: Math.round(score * 1000) / 1000,
      };
      if (similarity !== undefined) item.similarity = Math.round(similarity * 1000) / 1000;
      return item;
    }),
  );

  const found = new Set<string>();
  for (const item of items) {
    if (item.errorCode) found.add(canonicalIdentifier(item.errorCode));
  }
  for (const item of byRef) {
    for (const id of ids) if (item.text.toUpperCase().includes(id)) found.add(id);
  }

  const onBoard = new Set(board?.identifiers ?? []);
  const boardRelevant =
    board !== null &&
    (onBoard.size > 0 ||
      (board.rank > 0 &&
        (FULLTEXT_WEIGHT * board.rank) / Math.max(board.rank, maxFulltext) >=
          LEXICAL_SUPPORT_SCORE));
  return {
    items,
    // Идентификатор, който е САМО в схема на конкретно табло, не е „непознат“ — липсва таблото.
    unknownIdentifiers: ids.filter((id) => !found.has(id) && !onBoard.has(id)),
    conflicts: findConflicts(items),
    ...(boardRelevant ? { needsBoard: true } : {}),
  };
}
