/**
 * „Подозрителни играчи“ (`/admin/flags`) — чистото оценяване, САМО за човешки преглед. Флагът не е присъда:
 * нищо не се наказва и не се решава автоматично (чл. 22 GDPR); всяко действие минава през обичайния ред в
 * панела. Числата идват от `kills` (последните 7 дни срещу дни 8–28) и минутите от `sessions`.
 * Тестовите стойности са в `tests/admin-flags.test.ts`.
 */

/** Прозорецът, който се оценява. */
export const FLAG_WINDOW_DAYS = 7;
/** Собствената база на играча: от края на прозореца назад до толкова дни (т.е. дни 8–28). */
export const FLAG_BASELINE_DAYS = 28;
/** Под толкова убийства в прозореца (или в базата) делът е шум — не се оценява. */
export const FLAG_MIN_KILLS = 50;
/** Убийства в минута — само при поне толкова изиграни минути. */
export const FLAG_MIN_MINUTES = 30;
/** Перцентил се смята само при поне толкова играчи с данни — иначе „най-добрият от трима“ е флаг. */
export const FLAG_MIN_POPULATION = 10;
/** Над този перцентил (и над прага по-долу) стойността е извън обичайното за сървъра. */
export const FLAG_PERCENTILE = 0.95;
/** Скок спрямо собствената база: поне толкова пъти над нея (и над прага). */
export const FLAG_SPIKE_RATIO = 1.5;
/** „Далечен noscope“: от толкова метра нагоре (1 единица = 0,0254 m). */
export const LONG_NOSCOPE_METERS = 20;
/** Колко флагнати показваме (най-силните първи). */
export const FLAG_LIST_MAX = 50;

export const FLAG_METRICS = ['hs', 'wallbang', 'smoke', 'blind', 'longNoscope', 'kpm'] as const;
export type FlagMetric = (typeof FLAG_METRICS)[number];

/**
 * Абсолютният праг на всеки показател — под него не флагваме дори първия на сървъра (при ниски стойности
 * за всички „първият“ е нормален). Делове от убийствата; `kpm` — убийства в минута.
 */
export const FLAG_FLOORS: Record<FlagMetric, number> = {
  hs: 0.6,
  wallbang: 0.1,
  smoke: 0.08,
  blind: 0.05,
  longNoscope: 0.03,
  kpm: 3,
};

export interface FlagCounts {
  kills: number;
  headshots: number;
  wallbangs: number;
  smokes: number;
  blinds: number;
  longNoscopes: number;
  minutes: number;
}

export interface FlagInput extends FlagCounts {
  steamId: string;
  name: string;
  hidden: boolean;
  base: FlagCounts;
}

export interface MetricScore {
  id: FlagMetric;
  value: number | null;
  /** Делът на играчите с данни, които са на или под тази стойност (0–1); null = малко играчи. */
  percentile: number | null;
  baseline: number | null;
  /** Извън обичайното за сървъра (перцентил + праг). */
  outlier: boolean;
  /** Скок спрямо собствената база (× FLAG_SPIKE_RATIO + праг). */
  spike: boolean;
}

export interface FlaggedPlayer {
  steamId: string;
  name: string;
  hidden: boolean;
  kills: number;
  minutes: number;
  metrics: MetricScore[];
  /** Колко показателя са флагнати (outlier или spike). */
  reasons: number;
}

export interface FlagReport {
  /** Играчите с поне FLAG_MIN_KILLS убийства в прозореца. */
  population: number;
  flagged: FlaggedPlayer[];
}

/** Стойността на показателя; null — недостатъчно данни за него. */
export function metricValue(id: FlagMetric, counts: FlagCounts): number | null {
  if (id === 'kpm')
    return counts.minutes >= FLAG_MIN_MINUTES ? counts.kills / counts.minutes : null;
  if (counts.kills < FLAG_MIN_KILLS) return null;
  const part = {
    hs: counts.headshots,
    wallbang: counts.wallbangs,
    smoke: counts.smokes,
    blind: counts.blinds,
    longNoscope: counts.longNoscopes,
  }[id];
  return part / counts.kills;
}

/** Делът на стойностите ≤ value (самият играч се брои) — най-високият е 1. */
export function percentileRank(values: ReadonlyArray<number>, value: number): number {
  if (values.length === 0) return 0;
  return values.filter((other) => other <= value).length / values.length;
}

export function scoreFlags(rows: ReadonlyArray<FlagInput>): FlagReport {
  const eligible = rows.filter((row) => row.kills >= FLAG_MIN_KILLS);
  const populations = new Map<FlagMetric, number[]>();
  for (const id of FLAG_METRICS) {
    populations.set(
      id,
      eligible.map((row) => metricValue(id, row)).filter((v): v is number => v !== null),
    );
  }
  const flagged: FlaggedPlayer[] = [];
  for (const row of eligible) {
    const metrics = FLAG_METRICS.map((id): MetricScore => {
      const value = metricValue(id, row);
      const baseline = metricValue(id, row.base);
      const population = populations.get(id) ?? [];
      const percentile =
        value !== null && population.length >= FLAG_MIN_POPULATION
          ? percentileRank(population, value)
          : null;
      const aboveFloor = value !== null && value >= FLAG_FLOORS[id];
      return {
        id,
        value,
        percentile,
        baseline,
        outlier: aboveFloor && percentile !== null && percentile >= FLAG_PERCENTILE,
        spike: aboveFloor && baseline !== null && value >= baseline * FLAG_SPIKE_RATIO,
      };
    });
    const reasons = metrics.filter((m) => m.outlier || m.spike).length;
    if (reasons > 0) {
      flagged.push({
        steamId: row.steamId,
        name: row.name,
        hidden: row.hidden,
        kills: row.kills,
        minutes: row.minutes,
        metrics,
        reasons,
      });
    }
  }
  const top = (player: FlaggedPlayer) =>
    Math.max(0, ...player.metrics.map((m) => (m.outlier || m.spike ? (m.percentile ?? 0) : 0)));
  flagged.sort(
    (a, b) =>
      b.reasons - a.reasons ||
      top(b) - top(a) ||
      b.kills - a.kills ||
      a.steamId.localeCompare(b.steamId),
  );
  return { population: eligible.length, flagged: flagged.slice(0, FLAG_LIST_MAX) };
}
