import type { DiagnosticContext } from '../domain/context.js';
import { canonicalIdentifier } from '../domain/normalize.js';
import {
  lowerConfidence,
  type Confidence,
  type EvidenceLevel,
  type Outcome,
} from '../domain/response.js';

/** Таванът на увереността и на изхода по нивото на доказателствата (§8.3). */
export function capsFor(level: EvidenceLevel): { confidence: Confidence; outcome: Outcome } {
  switch (level) {
    case 'strong':
    case 'high':
      return { confidence: 'high', outcome: 'identified' };
    case 'weak':
      return { confidence: 'low', outcome: 'probable' };
    case 'conflict':
      return { confidence: 'low', outcome: 'probable' };
    case 'none':
      return { confidence: 'low', outcome: 'undetermined' };
  }
}

const OUTCOME_ORDER: readonly Outcome[] = ['undetermined', 'probable', 'identified'];
export function lowerOutcome(a: Outcome, b: Outcome): Outcome {
  return OUTCOME_ORDER.indexOf(a) <= OUTCOME_ORDER.indexOf(b) ? a : b;
}

export interface ThresholdInput {
  level: EvidenceLevel;
  status: Outcome;
  confidence: Confidence;
  /** Колко стъпки и причини са оцелели след Gate. */
  keptSteps: number;
  keptCauses: number;
  context: DiagnosticContext;
  unknownIdentifiers: readonly string[];
}

export interface ThresholdResult {
  status: Outcome;
  confidence: Confidence;
  decisions: string[];
  missing: string[];
  escalate: boolean;
}

/** Увереност и изход по прага (§8.3) — моделът не може да ги вдигне. */
export function applyThresholds(input: ThresholdInput): ThresholdResult {
  const { level, context } = input;
  const decisions: string[] = [];
  const missing: string[] = [];
  let escalate = false;
  const caps = capsFor(level);
  let confidence = lowerConfidence(input.confidence, caps.confidence);
  let status = lowerOutcome(input.status, caps.outcome);
  if (level === 'high' && status === 'identified' && confidence === 'high') {
    // Две съгласни фрази без точен код — „висока/средно-висока“, не сигурност.
    confidence = 'medium';
  }
  if (input.keptSteps === 0 && input.keptCauses === 0) {
    status = 'undetermined';
    confidence = 'low';
    decisions.push('gate.noSupportedContent');
  }
  if (input.keptCauses > 1 && status === 'identified') {
    // Няколко подкрепени причини — не представяме една като сигурна (§10.3).
    status = 'probable';
    decisions.push('gate.multipleCauses');
  }
  if (level === 'weak') {
    decisions.push('gate.weakEvidence');
    for (const field of ['hardwareRevision', 'firmware'] as const) {
      if (context[field] === null) missing.push(`ctx.${field}`);
    }
  }
  if (level === 'conflict') decisions.push('gate.conflict');
  for (const id of input.unknownIdentifiers) {
    decisions.push('gate.unknownIdentifier');
    missing.push(`ctx.unknownIdentifier:${id}`);
  }
  // Кодът на случая го няма за този модел/версия (§16.3 „код, който не съществува“): никаква
  // сигурност, дори ако пакетът има текст за подобен код.
  const caseCode = context.errorCode ? canonicalIdentifier(context.errorCode) : null;
  if (caseCode !== null && input.unknownIdentifiers.includes(caseCode)) {
    status = lowerOutcome(status, 'probable');
    confidence = 'low';
    escalate = true;
    decisions.push('gate.unknownErrorCode');
  }
  return { status, confidence, decisions, missing, escalate };
}
