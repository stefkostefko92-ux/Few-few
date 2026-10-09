import { foldText } from './lexicon.js';

/**
 * Prompt injection в ДАННИ, които моделът е преписал (текст от снимка, от лог): „игнорирай
 * инструкциите“, „ти вече си…“, „системен промпт“, „извикай инструмента“, маркерите на данните.
 * Детерминистично и грубо — съвпадение не блокира отговора, само скрива текста и ескалира.
 * Езици: IT/EN/BG. Сгъване: NFKC, без невидими знаци, без ударения (`foldText`).
 */

const PATTERNS: readonly RegExp[] = [
  // EN
  /\b(?:ignore|disregard|forget|override)\b.{0,40}\b(?:instructions?|rules?|prompt|previous|above|system)\b/,
  /\byou are now\b|\bact as\b|\bnew instructions?\b|\bsystem prompt\b|\bdeveloper mode\b/,
  /\b(?:call|invoke|use)\b.{0,20}\b(?:tool|function|submit_diagnosis|lookup_error|search_documents)\b/,
  // IT
  /\b(?:ignora|ignorate|dimentica|trascura)\b.{0,40}\b(?:istruzion\w*|regol\w*|prompt|preceden\w*|sistema)\b/,
  /\b(?:ora sei|adesso sei|nuove istruzioni|prompt di sistema)\b/,
  // BG (след сгъването „й“ → „и“)
  /(?:игнорира|забрави|пренебрегни)\S*.{0,40}(?:инструкци|правила|промпт|предишн|систем)/,
  /(?:вече си|нови инструкции|системни(?:ят|я)? промпт)/,
  // Маркерите на данните (ролите „system:“ не — дисплей може да пише „SYSTEM: OK“).
  /<<<|>>>/,
];

export function looksLikeInjection(text: string): boolean {
  const prepared = foldText(text.normalize('NFKC').replace(/\p{Cf}/gu, ''))
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return PATTERNS.some((p) => p.test(prepared));
}
