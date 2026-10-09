import type { DiagnosticContext } from '../domain/context.js';
import { canonicalIdentifier, normalizeQuery } from '../domain/normalize.js';
import type { EvidenceLevel } from '../domain/response.js';
import { isApplicable, type ProductVersion } from '../domain/versions.js';
import {
  isExactMatch,
  type EvidenceItem,
  type KnowledgeStore,
  type MatchKind,
  type RawEvidence,
  type RetrievalRequest,
  type RetrievalResult,
} from './types.js';

/**
 * Хибридното търсене (§8.1): нормализация → точно (кодове, клеми, модел) → пълнотекстово +
 * семантично (pgvector) → филтър по съвместимост → подреждане → доказателствен пакет E1…En.
 * Точните съвпадения имат привилегирован път (§8.2) и не се режат от лимита; пълнотекстовото и
 * семантичното се сливат с Reciprocal Rank Fusion (RRF), без да се смесват мащабите им.
 */

export const MAX_PACK = 12;
const DEFAULT_FULLTEXT_LIMIT = 8;
export const DEFAULT_SEMANTIC_LIMIT = 6;
/** Несъвместимото не изчезва (за да се види конфликтът), но пада под всяко съвместимо. */
export const NOT_APPLICABLE_FACTOR = 0.3;
/** Константата на RRF (Cormack, Clarke, Büttcher 2009): fused = Σ 1 / (k + ранг). */
export const RRF_K = 60;
/**
 * Под това косинусово сходство семантичният резултат е шум: най-близък съсед има винаги, а без
 * праг „нищо съвместимо“ (AC-04) никога не би настъпило. Прилага се и в SQL, и тук (защита в
 * дълбочина). Промяна → нов GATE_VERSION и прогон на оценъчния набор (evals/).
 */
export const SEMANTIC_MIN_SIMILARITY = 0.6;
/**
 * От това сходство нагоре семантичен източник ПОТВЪРЖДАВА лексикален за ниво „high“ (§8.3);
 * сам по себе си не стига (виж evidenceLevel).
 */
export const SEMANTIC_HIGH_SIMILARITY = 0.8;
/** Лексикалната релевантност, от която документ брои за „high“ (както преди семантичното). */
export const LEXICAL_SUPPORT_SCORE = 0.35;

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

/** Лексикалната релевантност: точно > пълнотекстово; само семантично съвпадение → 0. */
export function baseScore(matchedBy: MatchKind[], fulltextShare: number): number {
  if (matchedBy.includes('exact_code')) return 1;
  if (matchedBy.includes('exact_ref')) return 0.8;
  if (matchedBy.includes('fulltext')) return 0.7 * fulltextShare;
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

export async function retrieve(
  store: KnowledgeStore,
  req: RetrievalRequest,
): Promise<RetrievalResult> {
  const normalized = normalizeQuery(req.query);
  const ids = [...caseIdentifiers(req.context, req.query)];
  const model = req.context.productModel;

  const [errors, byRef, fulltext, semanticRaw] = await Promise.all([
    ids.length > 0 ? store.findErrors(req.scope, model, ids) : Promise.resolve([]),
    ids.length > 0 ? store.findChunksByIdentifiers(req.scope, model, ids) : Promise.resolve([]),
    normalized.text.length > 0
      ? store.searchChunks(req.scope, model, normalized.text, req.limit ?? DEFAULT_FULLTEXT_LIMIT)
      : Promise.resolve([]),
    normalized.text.length > 0 ? searchSemanticSafe(store, req, normalized.text) : [],
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
    const applicable = raw.rules.some((rule) => isApplicable(rule, version));
    const factor = applicable ? 1 : NOT_APPLICABLE_FACTOR;
    const share = maxFulltext > 0 ? raw.rawScore / maxFulltext : 0;
    const score = baseScore(raw.matchedBy, share) * factor;
    const fused = rrfScore(keyOf(raw), rankLists) * factor;
    return { raw, applicable, score, fused };
  });

  // Точните — първи, по лексикалната релевантност; останалите — по RRF (после по score).
  const exact = scored
    .filter((r) => r.raw.matchedBy.some(isExactMatch))
    .sort((a, b) => b.score - a.score);
  const rest = scored
    .filter((r) => !r.raw.matchedBy.some(isExactMatch))
    .sort((a, b) => b.fused - a.fused || b.score - a.score);
  const pack = [...exact, ...rest].slice(0, Math.max(MAX_PACK, exact.length));

  const items: EvidenceItem[] = pack.map(({ raw, applicable, score }, i) => {
    const { rawScore: _rawScore, rules: _rules, similarity, ...fields } = raw;
    const item: EvidenceItem = {
      ...fields,
      ref: `E${i + 1}`,
      applicable,
      score: Math.round(score * 1000) / 1000,
    };
    if (similarity !== undefined) item.similarity = Math.round(similarity * 1000) / 1000;
    return item;
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
 * Парче, което реално говори по въпроса: лексикално над прага за подкрепа или семантично ≥ 0.8.
 * Под прага е шум (обща дума като „piano“) — не подкрепя (`evidenceLevel`), значи и не опровергава.
 */
const isRelevant = (i: EvidenceItem): boolean =>
  i.score >= LEXICAL_SUPPORT_SCORE ||
  (i.matchedBy.includes('semantic') && (i.similarity ?? 0) >= SEMANTIC_HIGH_SIMILARITY);

/**
 * Противоречия (§8.2 „при конфликт — изрично“): един и същ код за грешка с различни описания,
 * или един и същ документ в две ревизии — и двата записа съвместими с таблото. Ревизиите са
 * конфликт само ако документът е източник за ТОЗИ въпрос: поне едно негово парче е релевантно
 * (`isRelevant`) или е цитирано от модела (`cited`). Иначе две ревизии на несвързан бюлетин,
 * хванати по обща дума, свалят точния код на случая до „conflict“ (реален случай от evals/).
 */
export function findConflicts(
  items: EvidenceItem[],
  cited: ReadonlySet<string> = new Set(),
): RetrievalResult['conflicts'] {
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
    if (revisions.size > 1 && list.some((i) => isRelevant(i) || cited.has(i.ref))) {
      conflicts.push({ description: `revision:${code}`, refs: list.map((i) => i.ref) });
    }
  }
  return conflicts;
}

/**
 * Праговете (§8.3), изчислени детерминистично от пакета — моделът не ги определя.
 *  strong   — точен код за грешка, съвместим с версията → водена диагностика (никога семантично)
 *  high     — поне два съвместими източника от различни документи → висока/средна увереност;
 *             поне един ЛЕКСИКАЛЕН (точен или пълнотекстов, score ≥ LEXICAL_SUPPORT_SCORE),
 *             вторият може да е семантичен със сходство ≥ SEMANTIC_HIGH_SIMILARITY.
 *             Само семантични източници → „weak“, колкото и да са.
 *  weak     — един съвместим източник → предпазлив отговор + искане на контекст
 *  conflict — противоречие между съвместими източници → без автоматична сигурност
 *  none     — нищо съвместимо → ескалация или искане на нови данни
 */
export function evidenceLevel(
  result: RetrievalResult,
  caseIds?: ReadonlySet<string>,
): EvidenceLevel {
  const applicable = result.items.filter((i) => i.applicable);
  if (applicable.length === 0) return 'none';
  if (result.conflicts.length > 0) return 'conflict';
  // „Точен код“ е кодът на СЛУЧАЯ — не всеки код, който моделът е потърсил с инструмент.
  const strong = applicable.some(
    (i) =>
      i.kind === 'error' &&
      i.matchedBy.includes('exact_code') &&
      i.errorCode !== null &&
      (caseIds === undefined || caseIds.has(canonicalIdentifier(i.errorCode))),
  );
  if (strong) return 'strong';
  const lexical = new Set(
    applicable.filter((i) => i.score >= LEXICAL_SUPPORT_SCORE).map((i) => i.documentId),
  );
  if (lexical.size === 0) return 'weak';
  const corroborating = new Set(lexical);
  for (const i of applicable) {
    if (i.matchedBy.includes('semantic') && (i.similarity ?? 0) >= SEMANTIC_HIGH_SIMILARITY) {
      corroborating.add(i.documentId);
    }
  }
  return corroborating.size >= 2 ? 'high' : 'weak';
}

const LEVEL_RANK: Readonly<Record<EvidenceLevel, number>> = {
  none: 0,
  weak: 1,
  conflict: 1,
  high: 2,
  strong: 3,
};

/**
 * Нивото след инструментите не може да е по-високо от началното (моделът сам си избира какво
 * да търси), освен „strong“ — то е възможно само с кода на случая. Конфликт и „none“ се пазят.
 */
export function cappedLevel(initial: EvidenceLevel, final: EvidenceLevel): EvidenceLevel {
  if (final === 'strong' || final === 'conflict') return final;
  return LEVEL_RANK[final] > LEVEL_RANK[initial] ? initial : final;
}
