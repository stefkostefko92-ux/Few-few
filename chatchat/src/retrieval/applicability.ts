import { isApplicable, validityAt, type Validity } from '../domain/versions.js';
import type {
  BoardOptions,
  CaseVersion,
  EvidenceItem,
  EvidenceRule,
  RawEvidence,
} from './types.js';

/**
 * Приложимостта на един запис — ЕДНО правило за първоначалното търсене (retrieve) и за всичко,
 * което инструментите добавят по-късно (EvidencePack): съвместимост с HW/FW/табло (§8.2),
 * опциите на конфигурацията (FR-01) и валидност към момента на отговора (§7.2
 * effective_from/to). Изтекъл или още невалиден документ е неприложим, колкото и да е PUBLISHED;
 * документ за таблото на случая се отбелязва (подредба).
 */

export interface Applicability {
  applicable: boolean;
  validity: Validity;
  /** Приложим през правило за КОНКРЕТНОТО табло на случая (уникалната му схема). */
  boardSpecific: boolean;
}

/** Ключ/стойност се сравняват без значение на главни/малки букви и крайни интервали. */
const normKey = (k: string): string => k.trim().toLowerCase();
const normValue = (v: string): string => v.trim().toUpperCase();

/**
 * Ограничението по опции на правило (FR-01): всяка двойка на правилото трябва да е РАВНА на
 * опцията на случая; празно → всички конфигурации. Непозната опция на случая (ключът липсва)
 * значи „не е доказано приложим“ → false (fail-closed, както непознат HW/FW в `isApplicable`):
 * по-добре да поискаме данните, отколкото да цитираме документ за друг инвертор като основен.
 * `null` е неразчетено ограничение (повреден ред) — никога не съвпада.
 */
export function optionsMatch(
  required: BoardOptions | null | undefined,
  actual: BoardOptions | undefined,
): boolean {
  if (required === null) return false;
  const entries = Object.entries(required ?? {});
  if (entries.length === 0) return true;
  const have = new Map(Object.entries(actual ?? {}).map(([k, v]) => [normKey(k), normValue(v)]));
  return entries.every(([k, v]) => have.get(normKey(k)) === normValue(v));
}

/** Правилото важи за версията на случая: HW/FW/табло (`domain/versions.ts`) И опциите. */
export function ruleApplies(rule: EvidenceRule, version: CaseVersion): boolean {
  return isApplicable(rule, version) && optionsMatch(rule.options, version.options);
}

export function applicabilityOf(
  raw: Pick<RawEvidence, 'rules' | 'effectiveFrom' | 'effectiveTo'>,
  version: CaseVersion,
  now: Date,
): Applicability {
  const validity = validityAt(raw, now);
  const matching = raw.rules.filter((rule) => ruleApplies(rule, version));
  return {
    applicable: validity === 'effective' && matching.length > 0,
    validity,
    boardSpecific: matching.some((rule) => Boolean(rule.deviceId)),
  };
}

/** Полетата на EvidenceItem от приложимостта (незадължителните — само когато важат). */
export function applicabilityFields(
  a: Applicability,
): Pick<EvidenceItem, 'applicable' | 'boardSpecific' | 'validity'> {
  return {
    applicable: a.applicable,
    ...(a.boardSpecific ? { boardSpecific: true } : {}),
    ...(a.validity !== 'effective' ? { validity: a.validity } : {}),
  };
}
