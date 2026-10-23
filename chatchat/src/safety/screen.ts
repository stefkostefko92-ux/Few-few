import type { ActionClass } from '../domain/response.js';
import type { EvidenceItem } from '../retrieval/types.js';
import { classifyActionText, detectBypassIntent, foldText } from './lexicon.js';

/**
 * Изходът на модела е НЕДОВЕРЕН (червен екип, OWASP LLM01/LLM05): всеки текст, който стига до
 * техника — не само стъпките — минава през речника, и одобрението на стъпка по безопасност
 * изисква източникът да документира ИМЕННО нея, не просто да е „safety документ“.
 */

/** Код вместо текст, който Gate не пуска (UI го превежда). */
export const WITHHELD = 'gate.textWithheld';

/** Типове документи, които могат да носят одобрена процедура по безопасност. */
const SAFETY_PROCEDURE_TYPES = new Set(['PROCEDURE', 'MANUAL']);

const STOP = new Set([
  'della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'sulla', 'sulle', 'alla', 'alle', 'come',
  'quando', 'prima', 'dopo', 'verso', 'tutti', 'tutte', 'deve', 'devono', 'essere', 'stato',
  'that', 'with', 'from', 'this', 'then', 'into', 'when', 'must', 'should', 'have', 'their',
  'който', 'която', 'които', 'това', 'след', 'преди', 'трябва', 'между', 'върху',
]); // prettier-ignore

/** Значимите думи на текст: сгънати, ≥4 знака, без служебни; плюс идентификатори като X3, K1. */
function significantTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of foldText(text).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length === 0) continue;
    const identifier = /^\p{L}{1,3}\d{1,4}$/u.test(raw);
    if (identifier || (raw.length >= 4 && !STOP.has(raw))) tokens.add(raw);
  }
  return tokens;
}

/**
 * Документира ли източникът стъпката: поне половината от значимите ѝ думи (и поне две) са в
 * текста на източника. Груба, но детерминистична връзка стъпка ↔ източник.
 */
export function sourceDocumentsStep(stepText: string, sourceText: string): boolean {
  const step = significantTokens(stepText);
  if (step.size === 0) return false;
  const source = significantTokens(sourceText);
  let hits = 0;
  for (const t of step) if (source.has(t)) hits += 1;
  return hits >= Math.min(2, step.size) && hits / step.size >= 0.5;
}

/**
 * Одобрена процедура за ТАЗИ стъпка по безопасност: съвместим, публикуван, маркиран
 * safety-relevant източник, който документира стъпката. За код за грешка — проверка от базата
 * с клас SAFETY_RELEVANT, съвпадаща със стъпката.
 */
export function approvesSafetyStep(item: EvidenceItem, stepText: string): boolean {
  if (!item.applicable || !item.safetyRelevant) return false;
  if (item.kind === 'error') {
    return item.checks.some(
      (c) =>
        c.kind === 'CHECK' &&
        c.actionClass === 'SAFETY_RELEVANT' &&
        sourceDocumentsStep(stepText, c.text),
    );
  }
  return SAFETY_PROCEDURE_TYPES.has(item.documentType) && sourceDocumentsStep(stepText, item.text);
}

export interface TextVerdict {
  bypass: boolean;
  actionClass: ActionClass;
}

export function screenText(text: string): TextVerdict {
  return {
    bypass: detectBypassIntent(text).bypass,
    actionClass: classifyActionText(text).actionClass,
  };
}

/** Опасен свободен текст: мост/байпас или пряка команда към хардуера. */
export function isDangerousText(text: string): boolean {
  const verdict = screenText(text);
  return verdict.bypass || verdict.actionClass === 'DIRECT_COMMAND';
}
