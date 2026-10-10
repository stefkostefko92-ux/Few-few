import type { DiagnosticAnswer, ModelDiagnosis } from '../domain/response.js';
import type { EvidenceItem } from '../retrieval/types.js';
import { approvesSafetyStep, screenText } from './screen.js';

/**
 * Свободният текст на модела извън стъпките — причините и решенията „ако X → A“ (§11.2).
 * Част от Safety Gate: извиква се САМО от `applyGate` (`gate.ts`), в неговия ред на проверките;
 * решенията (`gate.*`) и блокът отиват в състоянието на Gate през `decisions`/`blockForText`.
 */
export interface FreeTextScreen {
  byRef: ReadonlyMap<string, EvidenceItem>;
  /** Само референциите от пакета, които са съвместими. */
  supporting: (refs: string[]) => string[];
  decisions: Set<string>;
  /** Моделът е предложил мост/пряка команда в свободен текст — блок и ескалация. */
  blockForText: (decision: string) => void;
}

/** 4. Причините — само подкрепените и безопасните; несъвместимото не е основен източник. */
export function screenCauses(
  draftCauses: ModelDiagnosis['causes'],
  { byRef, supporting, decisions, blockForText }: FreeTextScreen,
): DiagnosticAnswer['causes'] {
  const causes: DiagnosticAnswer['causes'] = [];
  for (const cause of draftCauses) {
    const refs = supporting(cause.evidenceRefs);
    const verdict = screenText(cause.text);
    if (verdict.bypass || verdict.actionClass === 'DIRECT_COMMAND') {
      blockForText('gate.causes.withheld');
      continue;
    }
    const safetyOk =
      verdict.actionClass !== 'SAFETY_RELEVANT' ||
      refs.some((r) => {
        const item = byRef.get(r);
        return item !== undefined && approvesSafetyStep(item, cause.text);
      });
    if (refs.length === 0 || !safetyOk) {
      decisions.add('gate.causes.unsupportedDropped');
      continue;
    }
    causes.push({ text: cause.text, evidenceRefs: refs });
  }
  return causes;
}

/**
 * 5. Решенията „ако X → A“: само ако има запазена стъпка (решава извикващият), и без нищо, което
 * Gate би махнал като стъпка (нямат референции, затова и действие по безопасност не минава).
 */
export function screenDecisionPoints(
  points: ModelDiagnosis['decisionPoints'],
  { decisions, blockForText }: Pick<FreeTextScreen, 'decisions' | 'blockForText'>,
): ModelDiagnosis['decisionPoints'] {
  return points.filter((dp) => {
    const verdict = screenText(`${dp.condition} ${dp.then}`);
    if (verdict.bypass || verdict.actionClass === 'DIRECT_COMMAND') {
      blockForText('gate.decisionPoint.withheld');
      return false;
    }
    if (verdict.actionClass === 'SAFETY_RELEVANT' || verdict.actionClass === 'CONFIGURATIVE') {
      decisions.add('gate.decisionPoint.withheld');
      return false;
    }
    return true;
  });
}
