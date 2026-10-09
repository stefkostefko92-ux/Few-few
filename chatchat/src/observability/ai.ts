import type { Diagnoser } from '../app.js';
import { CircuitOpenError } from '../ai/breaker.js';
import type { Scanner, ScanVerdict } from '../storage/antivirus.js';
import { gateReason, type AiOutcome, type Metrics } from './catalog.js';

/**
 * Инструментиране на AI пътя и антивируса като декоратори — рутерите и оркестраторът не знаят
 * за метриките. Етикетите са само кодове: изход, вид на входа, причина на Safety Gate, присъда.
 */

/** Изходът на неуспешно питане. Отказът на викащия (затворен браузър) не е грешка на системата. */
export function failureOutcome(err: unknown, signal: AbortSignal): AiOutcome {
  if (err instanceof CircuitOpenError) return 'ai_unavailable';
  if (signal.aborted) return 'cancelled';
  const name = err instanceof Error ? err.name : '';
  // Крайният срок на оркестратора (AbortSignal.timeout) стига до SDK-то като прекъсната заявка.
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    name === 'APIUserAbortError' ||
    name === 'APIConnectionTimeoutError'
  ) {
    return 'timeout';
  }
  return 'error';
}

export function instrumentDiagnoser(diagnoser: Diagnoser, metrics: Metrics): Diagnoser {
  return async (input, signal) => {
    const started = performance.now();
    const files = (input.attachments?.photos.length ?? 0) + (input.attachments?.logs.length ?? 0);
    const kind = files > 0 ? 'files' : 'text';
    const record = (outcome: AiOutcome) => {
      metrics.aiAnswers.inc({ outcome, input: kind });
      metrics.aiDuration.observe({ outcome, input: kind }, (performance.now() - started) / 1000);
    };
    let out;
    try {
      out = await diagnoser(input, signal);
    } catch (err) {
      record(failureOutcome(err, signal));
      throw err;
    }
    record(out.modelCalled ? 'answered' : 'no_evidence');
    for (const code of new Set(out.answer.gate.decisions)) {
      metrics.gateInterventions.inc({ reason: gateReason(code) });
    }
    metrics.gateLevels.inc({ level: out.answer.safety.level });
    return out;
  };
}

/** Антивирусът: присъда + причина за FAILED + продължителност. Нищо от файла. */
export function meteredScanner(inner: Scanner, metrics: Metrics): Scanner {
  return {
    async scan(bytes) {
      const started = performance.now();
      let verdict: ScanVerdict;
      try {
        verdict = await inner.scan(bytes);
      } catch (err) {
        metrics.avScans.inc({ verdict: 'FAILED', reason: 'exception' });
        throw err;
      } finally {
        metrics.avDuration.observe(undefined, (performance.now() - started) / 1000);
      }
      metrics.avScans.inc({
        verdict: verdict.status,
        reason: verdict.status === 'FAILED' ? verdict.reason : '',
      });
      return verdict;
    },
  };
}
