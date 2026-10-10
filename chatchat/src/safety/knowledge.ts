import type { DiagnosticAnswer } from '../domain/response.js';
import { wouldBeRelevant } from '../retrieval/levels.js';
import type { RetrievalResult } from '../retrieval/types.js';

/**
 * Жизненият цикъл на знанието в отговора (детерминистично, след модела и в отговора без модел):
 *  - случай без проверено табло, а по въпроса има схема САМО за конкретни табла → искаме сериен
 *    номер/QR (`ctx.serial`) и казваме защо (`kb.boardSerialRequired`);
 *  - документ, който би бил източник, но е извън срока на валидност (§7.2) → личи в отговора
 *    (`kb.sourceExpired:<КОД@РЕВ>` / `kb.sourceNotYetEffective:<КОД@РЕВ>`), не се цитира;
 *  - документ, който би бил източник, но важи само за опция на таблото, която случаят не знае
 *    (FR-01) → искане на опцията (`ctx.option:<ключ>`).
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
  // FR-01 + FR-07: документ по въпроса важи само за конфигурация с опция, която случаят не знае →
  // искаме опцията (`ctx.option:<ключ>`). Ключът е метаданни на документа (кратък, без текст).
  for (const i of retrieval.items) {
    if (i.validity || !i.missingOptions || !(wouldBeRelevant(i) || cited.has(i.ref))) continue;
    for (const key of i.missingOptions) {
      if (!OPTION_KEY.test(key)) continue;
      const code = `ctx.option:${key}`;
      if (!missing.includes(code)) missing.push(code);
    }
  }
  return { decisions, missing };
}

/** Ключ на опция, който може да стане код (буквите/цифрите на ключовете в регистъра). */
const OPTION_KEY = /^[\p{L}\p{N}_.-]{1,40}$/u;

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
