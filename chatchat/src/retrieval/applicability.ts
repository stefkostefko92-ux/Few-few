import {
  isApplicable,
  validityAt,
  type ProductVersion,
  type Validity,
} from '../domain/versions.js';
import type { EvidenceItem, RawEvidence } from './types.js';

/**
 * Приложимостта на един запис — ЕДНО правило за първоначалното търсене (retrieve) и за всичко,
 * което инструментите добавят по-късно (EvidencePack): съвместимост с HW/FW/табло (§8.2) и
 * валидност към момента на отговора (§7.2 effective_from/to). Изтекъл или още невалиден документ
 * е неприложим, колкото и да е PUBLISHED; документ за таблото на случая се отбелязва (подредба).
 */

export interface Applicability {
  applicable: boolean;
  validity: Validity;
  /** Приложим през правило за КОНКРЕТНОТО табло на случая (уникалната му схема). */
  boardSpecific: boolean;
}

export function applicabilityOf(
  raw: Pick<RawEvidence, 'rules' | 'effectiveFrom' | 'effectiveTo'>,
  version: ProductVersion,
  now: Date,
): Applicability {
  const validity = validityAt(raw, now);
  const matching = raw.rules.filter((rule) => isApplicable(rule, version));
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
