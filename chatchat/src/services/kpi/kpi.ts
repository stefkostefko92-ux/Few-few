import type { PrismaClient } from '@prisma/client';
import { cell, K_MIN, partition, rate, type Cell, type Rate } from './anon.js';
import { latestEvalReport, type EvalSummary } from './evals.js';
import {
  answerAggregates,
  caseAggregates,
  caseSeries,
  feedbackCounts,
  removalReasons,
  type Scope,
} from './queries.js';

/**
 * KPI по §16.1 — детерминистично от базата, само агрегати, k-анонимни (`anon.ts`). Какво НЕ
 * мерим тук и защо: Answer accuracy, Citation precision, Version accuracy, Escalation precision и
 * Retrieval hit rate искат експертна истина → само от отчета на оценъчния набор (`evals.ts`).
 * Safety violation rate в продукция не се вижда (Gate маха опасното, преди да стигне до техника) —
 * мерим намесите на Gate + оценките „Errore tecnico“; истинските нарушения — от оценъчния набор.
 */

/** Таван на периода — година + ден (високосна). */
export const MAX_PERIOD_DAYS = 366;
/** До толкова дни — дневни кофи; над — седмични. */
const DAILY_UP_TO_DAYS = 62;

export const REMOVAL_REASONS = [
  'gate.removed.directCommand',
  'gate.removed.safetyUnapproved',
  'gate.removed.bypassRequest',
  'gate.removed.unsupported',
  'gate.removed.configNeedsContext',
] as const;

export interface KpiReport {
  period: { from: string; to: string; model: string | null; bucket: 'day' | 'week' };
  kAnonymity: number;
  cases: { total: Cell; resolved: Cell; withOutcome: Cell };
  timeToResolution: { n: Cell; medianSeconds: number | null; p90Seconds: number | null };
  firstContactResolution: Rate;
  escalation: {
    rate: Rate;
    byAiRecommendation: Cell;
    byTechnicianDecision: Cell;
    takeover: Rate;
  };
  answers: {
    total: Cell;
    evidence: Record<'strong' | 'high' | 'weak' | 'conflict' | 'none', Cell>;
    noEvidence: Rate;
    stepsRemoved: Rate;
    blocked: Rate;
    removalReasons: Record<(typeof REMOVAL_REASONS)[number], Cell>;
    recommendedEscalation: Rate;
  };
  feedback: {
    total: Cell;
    ratings: Record<'USEFUL' | 'NOT_USEFUL' | 'TECHNICAL_ERROR', Cell>;
    useful: Rate;
    technicalError: Rate;
    coverage: Rate;
  };
  series: Array<{ bucket: string; created: Cell; resolved: Cell; escalated: Cell }>;
  /** null → „изисква оценка“ (няма отчет на оценъчния набор). */
  evaluation: EvalSummary | null;
}

/** Серия: всяка колона е разбивка на общото за периода (вторично скриване по кофите). */
function seriesCells(
  rows: Array<{ bucket: Date; created: number; resolved: number; escalated: number }>,
): KpiReport['series'] {
  const col = (pick: (r: (typeof rows)[number]) => number) =>
    partition(Object.fromEntries(rows.map((r, i) => [String(i), pick(r)])));
  const created = col((r) => r.created);
  const resolved = col((r) => r.resolved);
  const escalated = col((r) => r.escalated);
  return rows.map((r, i) => ({
    bucket: r.bucket.toISOString(),
    created: created[String(i)] ?? 0,
    resolved: resolved[String(i)] ?? 0,
    escalated: escalated[String(i)] ?? 0,
  }));
}

export function bucketFor(from: Date, to: Date): 'day' | 'week' {
  return to.getTime() - from.getTime() <= DAILY_UP_TO_DAYS * 86_400_000 ? 'day' : 'week';
}

export async function computeKpi(
  db: PrismaClient,
  scope: Scope,
  evalReportsDir: string,
): Promise<KpiReport> {
  const bucket = bucketFor(scope.from, scope.to);
  const [c, a, reasons, fb, series, evaluation] = await Promise.all([
    caseAggregates(db, scope),
    answerAggregates(db, scope),
    removalReasons(db, scope),
    feedbackCounts(db, scope),
    caseSeries(db, scope, bucket),
    latestEvalReport(evalReportsDir),
  ]);

  // Ескалацията по източник е разбивка на ескалираните — скрива се заедно.
  const esc = partition({ ai: c.escalatedAi, tech: c.escalated - c.escalatedAi });
  const evidence = partition({
    strong: a.strong,
    high: a.high,
    weak: a.weak,
    conflict: a.conflict,
    none: a.none,
  });
  const reasonCount = new Map(reasons.map((r) => [r.reason, r.answers]));
  const removal = Object.fromEntries(
    REMOVAL_REASONS.map((r) => [r, cell(reasonCount.get(r) ?? 0)]),
  ) as KpiReport['answers']['removalReasons'];
  const fbCount = new Map(fb.map((r) => [r.rating, r.n]));
  const fbTotal = fb.reduce((sum, r) => sum + r.n, 0);
  const ratings = partition({
    USEFUL: fbCount.get('USEFUL') ?? 0,
    NOT_USEFUL: fbCount.get('NOT_USEFUL') ?? 0,
    TECHNICAL_ERROR: fbCount.get('TECHNICAL_ERROR') ?? 0,
  });
  const ttrShown = c.ttrN >= K_MIN;
  const round = (x: number | null) => (x === null ? null : Math.round(x));

  return {
    period: {
      from: scope.from.toISOString(),
      to: scope.to.toISOString(),
      model: scope.model,
      bucket,
    },
    kAnonymity: K_MIN,
    cases: { total: cell(c.total), resolved: cell(c.resolved), withOutcome: cell(c.withOutcome) },
    timeToResolution: {
      n: cell(c.ttrN),
      medianSeconds: ttrShown ? round(c.ttrP50) : null,
      p90Seconds: ttrShown ? round(c.ttrP90) : null,
    },
    firstContactResolution: rate(c.fcr, c.withOutcome),
    escalation: {
      rate: rate(c.escalated, c.total),
      byAiRecommendation: esc.ai,
      byTechnicianDecision: esc.tech,
      takeover: rate(c.taken, c.total),
    },
    answers: {
      total: cell(a.total),
      evidence,
      noEvidence: rate(evidence.none, a.total),
      stepsRemoved: rate(a.stepsRemoved, a.total),
      blocked: rate(a.blocked, a.total),
      removalReasons: removal,
      recommendedEscalation: rate(a.recommendedEscalation, a.total),
    },
    feedback: {
      total: cell(fbTotal),
      ratings,
      useful: rate(ratings.USEFUL, fbTotal),
      technicalError: rate(ratings.TECHNICAL_ERROR, fbTotal),
      coverage: rate(a.withFeedback, a.total),
    },
    series: seriesCells(series),
    evaluation,
  };
}
