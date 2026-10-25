import type { MatchBaseline, MatchReport } from '../data/repo.js';

/**
 * Сравнението в личния отчет (CONTRACT §13): този мач срещу средното на играча за мач през 7-те дни
 * преди него. Чисто — числата идват готови, тук само се смятат разликите и посоката им.
 */
export const COMPARE_METRICS = ['kills', 'deaths', 'kd', 'hs', 'xp'] as const;
export type CompareMetric = (typeof COMPARE_METRICS)[number];

/** Знаците след запетаята при показ — и прагът, под който разликата е „равно“. */
export const COMPARE_DIGITS: Record<CompareMetric, number> = {
  kills: 1,
  deaths: 1,
  kd: 2,
  hs: 1,
  xp: 0,
};

export type CompareTone = 'better' | 'worse' | 'even';

export interface Comparison {
  id: CompareMetric;
  /** HS — в проценти (0–100), разликата му е в процентни пунктове; null = няма убийства. */
  value: number | null;
  average: number | null;
  delta: number | null;
  tone: CompareTone | null;
}

type Totals = Pick<MatchBaseline, 'kills' | 'deaths' | 'headshots' | 'xp'>;

function metric(id: CompareMetric, line: Totals): number | null {
  switch (id) {
    case 'kills':
      return line.kills;
    case 'deaths':
      return line.deaths;
    case 'kd':
      // Като класацията: при 0 смърти делим на 1.
      return line.kills / Math.max(line.deaths, 1);
    case 'hs':
      return line.kills > 0 ? (line.headshots / line.kills) * 100 : null;
    case 'xp':
      return line.xp;
  }
}

function toneOf(id: CompareMetric, delta: number): CompareTone {
  const scale = 10 ** COMPARE_DIGITS[id];
  if (Math.round(delta * scale) === 0) return 'even';
  const up = delta > 0;
  // Повече смърти е по-лошо; всичко останало — повече е по-добре.
  return id === 'deaths' ? (up ? 'worse' : 'better') : up ? 'better' : 'worse';
}

export function compareWithBaseline(
  row: Pick<MatchReport['row'], 'kills' | 'deaths' | 'headshots' | 'xp'>,
  baseline: MatchBaseline,
): Comparison[] {
  return COMPARE_METRICS.map((id) => {
    const value = metric(id, row);
    const average = metric(id, baseline);
    const delta = value !== null && average !== null ? value - average : null;
    return { id, value, average, delta, tone: delta === null ? null : toneOf(id, delta) };
  });
}
