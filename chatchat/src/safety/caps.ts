import type { Confidence, EvidenceLevel, Outcome } from '../domain/response.js';

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
