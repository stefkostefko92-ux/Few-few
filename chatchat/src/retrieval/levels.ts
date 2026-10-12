import { canonicalIdentifier } from '../domain/normalize.js';
import type { EvidenceLevel } from '../domain/response.js';
import {
  LEXICAL_SUPPORT_SCORE,
  NOT_APPLICABLE_FACTOR,
  SEMANTIC_HIGH_SIMILARITY,
} from './thresholds.js';
import type { EvidenceItem, RetrievalResult } from './types.js';

/**
 * Детерминистичните изводи от пакета (§8.2–8.3): противоречия, ниво на доказателствата, таван на
 * нивото след инструментите и предимството на уникалната схема на таблото. Моделът не ги определя.
 */

/**
 * Парче, което реално говори по въпроса: лексикално над прага за подкрепа или семантично ≥ 0.8.
 * Под прага е шум (обща дума като „piano“) — не подкрепя (`evidenceLevel`), значи и не опровергава.
 */
export const isRelevant = (i: EvidenceItem): boolean =>
  i.score >= LEXICAL_SUPPORT_SCORE ||
  (i.matchedBy.includes('semantic') && (i.similarity ?? 0) >= SEMANTIC_HIGH_SIMILARITY);

/**
 * Би бил източник, ако беше приложим: релевантността преди наказанието за несъвместимост. За да
 * личи в отговора защо документът не е използван (изтекъл/още невалиден), без шума.
 */
export function wouldBeRelevant(i: EvidenceItem): boolean {
  const base = i.applicable ? i.score : i.score / NOT_APPLICABLE_FACTOR;
  return (
    base >= LEXICAL_SUPPORT_SCORE - 1e-6 ||
    (i.matchedBy.includes('semantic') && (i.similarity ?? 0) >= SEMANTIC_HIGH_SIMILARITY)
  );
}

/**
 * Уникалните схеми на таблото (решение на собственика): когато за таблото на случая има
 * приложима СОБСТВЕНА ревизия на документ с даден код, общите ревизии на същия код не важат за
 * това табло — стават неприложими (`replacedByBoard`), вместо да ѝ „противоречат“.
 */
export function applyBoardOverride(items: EvidenceItem[]): EvidenceItem[] {
  const own = new Set(
    items
      .filter((i) => i.kind === 'document' && i.applicable && i.boardSpecific)
      .map((i) => i.documentCode),
  );
  if (own.size === 0) return items;
  return items.map((i) =>
    i.kind === 'document' && i.applicable && !i.boardSpecific && own.has(i.documentCode)
      ? { ...i, applicable: false, replacedByBoard: true }
      : i,
  );
}

/**
 * Противоречия (§8.2 „при конфликт — изрично“): един и същ код за грешка с различни описания,
 * или един и същ документ в две ревизии — и двата записа съвместими с таблото. Ревизиите са
 * конфликт само ако документът е източник за ТОЗИ въпрос: поне едно негово парче е релевантно
 * (`isRelevant`) или е цитирано от модела (`cited`). Иначе две ревизии на несвързан бюлетин,
 * хванати по обща дума, свалят точния код на случая до „conflict“ (реален случай от evals/).
 * Схемите на РАЗЛИЧНИ табла никога не се сравняват: до пакета стигат само тези на таблото на
 * случая, а собствената ревизия на таблото замества общата (`applyBoardOverride`).
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
    const own = list.filter((i) => i.boardSpecific);
    const group = own.length > 0 ? own : list;
    const revisions = new Set(group.map((i) => i.revision));
    if (revisions.size > 1 && group.some((i) => isRelevant(i) || cited.has(i.ref))) {
      conflicts.push({ description: `revision:${code}`, refs: group.map((i) => i.ref) });
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
