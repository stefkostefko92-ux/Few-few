import type { DiagnosticContext } from '../../domain/context.js';
import { redactPii } from '../../domain/pii.js';

/**
 * Анонимизираното резюме на решен случай (§11.3 „Caso risolto → non entra automaticamente nella
 * KB; richiede review“) като страници на ЧЕРНОВА документ тип SOLVED_CASE: контекст на таблото,
 * симптоми, изпълнени стъпки с резултатите, първопричина и решение. Без имена, без сериен номер
 * (идентифицира инсталацията), без бележките на техника (свободен текст за конкретния обект);
 * всичко минава през `redactPii`. Заглавията на разделите са на езика на документа.
 */

export type DocLanguage = 'it' | 'en';

const LABELS: Record<DocLanguage, Record<string, string>> = {
  it: {
    context: 'Contesto del quadro',
    symptoms: 'Sintomi e osservazioni',
    steps: 'Passi eseguiti e risultati',
    solution: 'Causa e soluzione',
    model: 'Modello',
    hw: 'Revisione HW',
    fw: 'Firmware',
    code: 'Codice errore',
    phase: 'Fase',
    options: 'Opzioni',
    expected: 'atteso',
    result: 'esito',
    rootCause: 'Causa',
    fix: 'Soluzione',
    none: 'non indicato',
    noSteps: 'Nessun passo registrato nel caso.',
    OK: 'OK',
    KO: 'KO',
    NOT_POSSIBLE: 'non eseguibile',
  },
  en: {
    context: 'Board context',
    symptoms: 'Symptoms and observations',
    steps: 'Steps performed and results',
    solution: 'Cause and solution',
    model: 'Model',
    hw: 'HW revision',
    fw: 'Firmware',
    code: 'Error code',
    phase: 'Phase',
    options: 'Options',
    expected: 'expected',
    result: 'result',
    rootCause: 'Cause',
    fix: 'Solution',
    none: 'not given',
    noSteps: 'No steps recorded in the case.',
    OK: 'OK',
    KO: 'KO',
    NOT_POSSIBLE: 'not possible',
  },
};

export interface ExecutedStepText {
  step: number;
  action: string | null;
  expected: string | null;
  result: 'OK' | 'KO' | 'NOT_POSSIBLE';
}

export interface SolvedCaseText {
  context: DiagnosticContext;
  steps: readonly ExecutedStepText[];
  rootCause: string | null;
  solution: string;
  language: DocLanguage;
}

/** Ред „ключ: стойност“ с маскиране (стойностите са от техника/модела). */
const line = (k: string, v: string): string => `${k}: ${redactPii(v)}`;

/** Страниците на черновата — по една на раздел (разделът влиза и в пълнотекстовия индекс). */
export function solvedCasePages(
  input: SolvedCaseText,
): Array<{ page: number; section: string; text: string }> {
  const l = LABELS[input.language];
  const c = input.context;
  const opts = Object.entries(c.options)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const contextText = [
    line(l.model ?? '', c.productModel),
    line(l.hw ?? '', c.hardwareRevision ?? l.none ?? ''),
    line(l.fw ?? '', c.firmware ?? l.none ?? ''),
    line(l.code ?? '', c.errorCode ?? l.none ?? ''),
    line(l.phase ?? '', c.phase),
    ...(opts ? [line(l.options ?? '', opts)] : []),
  ].join('\n');
  const symptoms = [...c.symptoms, ...c.observations].map((s) => `- ${redactPii(s)}`);
  const steps = input.steps.length
    ? input.steps.map((s) => {
        const action = redactPii(s.action ?? `#${s.step}`);
        const expected = s.expected ? ` (${l.expected}: ${redactPii(s.expected)})` : '';
        return `${s.step}. ${action}${expected} — ${l.result}: ${l[s.result] ?? s.result}`;
      })
    : [l.noSteps ?? ''];
  const solution = [
    ...(input.rootCause ? [line(l.rootCause ?? '', input.rootCause)] : []),
    line(l.fix ?? '', input.solution),
  ].join('\n\n');
  return [
    { page: 1, section: l.context ?? '', text: contextText },
    { page: 2, section: l.symptoms ?? '', text: symptoms.join('\n') || (l.none ?? '') },
    { page: 3, section: l.steps ?? '', text: steps.join('\n\n') },
    { page: 4, section: l.solution ?? '', text: solution },
  ];
}
