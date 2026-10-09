import type { DiagnosticContext } from '../domain/context.js';
import { canonicalIdentifier } from '../domain/normalize.js';
import { redactPii } from '../domain/pii.js';
import type {
  Confidence,
  ModelInputs,
  Outcome,
  PhotoFinding,
  PhotoObservation,
} from '../domain/response.js';
import { looksLikeInjection } from './injection.js';
import { isDangerousText, WITHHELD } from './screen.js';

/**
 * Детерминистичните правила за снимките след модела (§9.2 „Visione computerizzata“, AC-06).
 * Наблюдението по снимка е ДОПЪЛВАЩО: никога цитат (не влиза в `evidence`), не вдига нивото на
 * доказателствата (то се смята само от пакета), не документира стъпка по безопасност (одобрение
 * дава само EvidenceItem — `approvesSafetyStep`). Текстът от снимката е недоверени данни:
 * маскира се (`redactPii`), пресява се за injection и минава през речника (`screen.ts`).
 *
 *  нечетлива снимка (или без наблюдение)  → полетата се изчистват, `collect.betterPhoto`, ≤ probable
 *  частично четлива / ниска увереност      → `collect.betterPhoto`
 *  код на дисплея ≠ кода на случая         → `ctx.photoCodeMismatch:<код>`, ≤ probable/medium —
 *                                            контекстът НЕ се сменя автоматично, техникът потвърждава
 *  injection в преписания текст            → текстът се заменя с код, ескалация, увереност low
 */

export const PHOTO_INJECTION = 'gate.photo.injection';
export const PHOTO_ONLY_BASIS = 'gate.photo.onlyBasis';
const CODE = /^[A-Z0-9]{1,20}$/;

export interface PhotoRulesInput {
  observations: readonly PhotoObservation[];
  inputs: ModelInputs;
  context: DiagnosticContext;
}

export interface PhotoRulesResult {
  photos: PhotoFinding[];
  missing: string[];
  decisions: string[];
  maxOutcome: Outcome | null;
  maxConfidence: Confidence | null;
  escalate: boolean;
  /** Бележката НА МОДЕЛА предлага мост/пряка команда — блок като при summary. */
  block: boolean;
}

export function applyPhotoRules(input: PhotoRulesInput): PhotoRulesResult {
  const missing = new Set<string>();
  const decisions = new Set<string>();
  const photos: PhotoFinding[] = [];
  let maxOutcome: Outcome | null = null;
  let maxConfidence: Confidence | null = null;
  let escalate = false;
  let block = false;
  const capOutcome = (o: Outcome) => {
    if (maxOutcome === null || o === 'undetermined') maxOutcome = o;
  };
  const capConfidence = (c: Confidence) => {
    if (maxConfidence === null || c === 'low') maxConfidence = c;
  };

  // Неизпратените: `collect.*` е искане към техника, останалото — решение на Gate.
  for (const n of input.inputs.notSent) {
    if (n.reason.startsWith('collect.')) missing.add(n.reason);
    else decisions.add(n.reason);
  }

  /** Преписан от снимката текст: маска → injection → речник (скрива, не блокира). */
  const visible = (text: string): string => {
    const masked = redactPii(text);
    if (looksLikeInjection(masked)) {
      decisions.add(PHOTO_INJECTION);
      escalate = true;
      capConfidence('low');
      return PHOTO_INJECTION;
    }
    if (isDangerousText(masked)) {
      decisions.add(WITHHELD);
      return WITHHELD;
    }
    return masked;
  };
  /** Собственият текст на модела: опасен → блок (като summary). */
  const note = (text: string): string => {
    if (text === '') return '';
    const screened = visible(text);
    if (screened === WITHHELD) block = true;
    return screened;
  };

  const sent = new Map(
    input.inputs.attachments.filter((a) => a.kind === 'PHOTO').map((a) => [a.ref, a.id]),
  );
  const caseCode = input.context.errorCode ? canonicalIdentifier(input.context.errorCode) : null;
  const seen = new Set<string>();
  for (const o of input.observations) {
    const attachmentId = sent.get(o.ref);
    if (attachmentId === undefined || seen.has(o.ref)) {
      decisions.add('gate.photo.unknownRef');
      continue;
    }
    seen.add(o.ref);
    const illegible = o.readability === 'illegible';
    const codes = illegible
      ? []
      : [...new Set(o.errorCodes.map(canonicalIdentifier).filter((c) => CODE.test(c)))];
    const plate = o.nameplate;
    photos.push({
      ref: o.ref,
      attachmentId,
      readability: o.readability,
      subject: o.subject,
      visibleText: illegible ? [] : o.visibleText.map(visible),
      errorCodes: codes,
      nameplate:
        illegible || plate === null
          ? null
          : {
              model: plate.model === null ? null : visible(plate.model),
              serial: plate.serial === null ? null : visible(plate.serial),
              hardwareRevision:
                plate.hardwareRevision === null ? null : visible(plate.hardwareRevision),
              firmware: plate.firmware === null ? null : visible(plate.firmware),
            },
      terminalLabels: illegible ? [] : o.terminalLabels.map(visible),
      note: note(o.note),
      confidence: illegible ? 'low' : o.confidence,
    });

    if (illegible) {
      // AC-06: нечетлива снимка → искане за нова, не диагноза от нея.
      missing.add('collect.betterPhoto');
      decisions.add('gate.photo.illegible');
      capOutcome('probable');
      continue;
    }
    if (o.readability === 'partial' || o.confidence === 'low') missing.add('collect.betterPhoto');
    if (o.confidence === 'low') continue; // несигурен прочит не задейства решения за кода
    for (const code of codes) {
      if (caseCode === null) missing.add(`ctx.photoCode:${code}`);
      else if (code !== caseCode) {
        missing.add(`ctx.photoCodeMismatch:${code}`);
        decisions.add('gate.photo.codeMismatch');
        capOutcome('probable');
        capConfidence('medium');
      }
    }
  }
  // Изпратена снимка без наблюдение — не знаем какво е видял моделът: като нечетлива.
  for (const ref of sent.keys()) {
    if (seen.has(ref)) continue;
    missing.add('collect.betterPhoto');
    decisions.add('gate.photo.unreported');
    capOutcome('probable');
  }

  return {
    photos,
    missing: [...missing],
    decisions: [...decisions],
    maxOutcome,
    maxConfidence,
    escalate,
    block,
  };
}
