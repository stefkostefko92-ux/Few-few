import type { DiagnosticAnswer } from '../domain/response.js';
import { wouldBeRelevant } from '../retrieval/levels.js';
import type { RetrievalResult } from '../retrieval/types.js';

/**
 * Жизненият цикъл на знанието в отговора (детерминистично, след модела и в отговора без модел):
 *  - случай без проверено табло, а по въпроса има схема САМО за конкретни табла → искаме сериен
 *    номер/QR (`ctx.serial`) и казваме защо (`kb.boardSerialRequired`);
 *  - документ, който би бил източник, но е извън срока на валидност (§7.2) → личи в отговора
 *    (`kb.sourceExpired:<КОД@РЕВ>` / `kb.sourceNotYetEffective:<КОД@РЕВ>`), не се цитира.
 * Кодовете се превеждат в public/i18n (`code.kb.*`).
 */

export const BOARD_SERIAL_REQUIRED = 'kb.boardSerialRequired';

export function knowledgeNotices(
  retrieval: RetrievalResult,
  cited: ReadonlySet<string> = new Set(),
): { decisions: string[]; missing: string[] } {
  const decisions: string[] = [];
  const missing: string[] = [];
  if (retrieval.needsBoard) {
    decisions.push(BOARD_SERIAL_REQUIRED);
    missing.push('ctx.serial');
  }
  for (const i of retrieval.items) {
    if (!i.validity || !(wouldBeRelevant(i) || cited.has(i.ref))) continue;
    const kind = i.validity === 'expired' ? 'kb.sourceExpired' : 'kb.sourceNotYetEffective';
    const code = `${kind}:${i.documentCode}@${i.revision}`;
    if (!decisions.includes(code)) decisions.push(code);
  }
  return { decisions, missing };
}

/** Добавя бележките към готов отговор (без повторения); нищо друго не пипа. */
export function withKnowledgeNotices(
  answer: DiagnosticAnswer,
  retrieval: RetrievalResult,
  cited: ReadonlySet<string> = new Set(),
): DiagnosticAnswer {
  const notes = knowledgeNotices(retrieval, cited);
  const decisions = [...answer.gate.decisions];
  for (const d of notes.decisions) if (!decisions.includes(d)) decisions.push(d);
  const missingData = [...answer.missingData];
  for (const m of notes.missing) if (!missingData.includes(m)) missingData.push(m);
  return { ...answer, missingData, gate: { ...answer.gate, decisions } };
}
