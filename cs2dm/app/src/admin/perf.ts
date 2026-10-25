import type { Redis } from 'ioredis';
import { z } from 'zod';
import { logger } from '../logger.js';

/**
 * „Здраве на тика“ (CONTRACT §5): плъгинът пише по минута в `cs2dm:perf` (LPUSH, таван 1440 = 24 ч) —
 * колко тика, колко закъснели (над 1,5 × интервала), най-дългият и средният интервал, хората, режимът.
 * Панелът само чете; невалиден ред се пропуска. Графиката е сървърен SVG без inline стил (CSP).
 */
export const PERF_KEY = 'cs2dm:perf';
export const PERF_KEEP = 1440;
const MAX_ROW_BYTES = 1024;

const perfSchema = z.object({
  ts: z.number().int().positive(),
  ticks: z.number().int().min(0).max(1_000_000),
  late: z.number().int().min(0).max(1_000_000),
  maxMs: z.number().min(0).max(1_000_000),
  avgMs: z.number().min(0).max(1_000_000),
  players: z.number().int().min(0).max(128),
  mode: z.string().max(64),
  budgetMs: z.number().positive().max(1000),
});

export type PerfMinute = z.infer<typeof perfSchema>;

/** Суровите редове (най-новият първи) → валидните, подредени по време, без повторения. */
export function parsePerf(rows: ReadonlyArray<string>): PerfMinute[] {
  const seen = new Set<number>();
  const out: PerfMinute[] = [];
  for (const row of rows.slice(0, PERF_KEEP)) {
    if (row.length > MAX_ROW_BYTES) continue;
    let json: unknown;
    try {
      json = JSON.parse(row) as unknown;
    } catch {
      continue;
    }
    const parsed = perfSchema.safeParse(json);
    if (!parsed.success || parsed.data.late > parsed.data.ticks || seen.has(parsed.data.ts))
      continue;
    seen.add(parsed.data.ts);
    out.push(parsed.data);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export interface PerfSource {
  /** null = Redis не отговори; [] = няма данни (празен сървър спи или плъгинът е стар). */
  read(): Promise<PerfMinute[] | null>;
}

export const NO_PERF: PerfSource = { read: async () => null };

export class RedisPerfSource implements PerfSource {
  constructor(
    private readonly redis: Pick<Redis, 'lrange'>,
    private readonly timeoutMs = 800,
  ) {}

  async read(): Promise<PerfMinute[] | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const rows = await Promise.race([
        this.redis.lrange(PERF_KEY, 0, PERF_KEEP - 1),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs);
        }),
      ]);
      return parsePerf(rows);
    } catch (error) {
      logger.debug(
        { err: error instanceof Error ? error.message : String(error) },
        'здравето на тика не се прочете от Redis',
      );
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export interface PerfSummary {
  last: PerfMinute;
  /** Процент закъснели тикове в последната минута (0–100, една десетица). */
  lateShare: number;
  /** За прозореца на графиката: най-дългият интервал и общо закъснелите. */
  worstMs: number;
  lateTotal: number;
}

export function summarize(rows: ReadonlyArray<PerfMinute>): PerfSummary | null {
  const last = rows.at(-1);
  if (!last) return null;
  return {
    last,
    lateShare: last.ticks > 0 ? Math.round((last.late / last.ticks) * 1000) / 10 : 0,
    worstMs: Math.max(...rows.map((row) => row.maxMs)),
    lateTotal: rows.reduce((sum, row) => sum + row.late, 0),
  };
}

export const CHART = { width: 720, height: 180, hours: 24 } as const;

export interface PerfChart {
  viewBox: string;
  /** Пътищата (`d`): най-дългият интервал, закъснелите тикове, хората. Празна минута прекъсва линията. */
  gap: string;
  late: string;
  players: string;
  /** Линията на 1,5 × интервала в мащаба на `gap` (y). */
  lateLineY: number;
  scale: { gapMs: number; late: number; players: number };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Чиста функция: минутите → координатите за SVG-то (x — последните 24 ч до `now`). */
export function perfChart(rows: ReadonlyArray<PerfMinute>, now: number): PerfChart {
  const { width, height, hours } = CHART;
  const from = now - hours * 3_600_000;
  const inWindow = rows.filter((row) => row.ts > from && row.ts <= now);
  const budget = inWindow.at(-1)?.budgetMs ?? 15.625;
  const gapScale = Math.max(budget * 3, ...inWindow.map((row) => row.maxMs));
  const lateScale = Math.max(10, ...inWindow.map((row) => row.late));
  const playersScale = Math.max(10, ...inWindow.map((row) => row.players));
  const x = (ts: number) => round(((ts - from) / (now - from)) * width);
  const y = (value: number, max: number) => round(height - (Math.min(value, max) / max) * height);
  const path = (pick: (row: PerfMinute) => number, max: number) => {
    let d = '';
    let prev: number | null = null;
    for (const row of inWindow) {
      // Повече от 2 минути без ред = сървърът е спал → линията се прекъсва.
      const jump = prev === null || row.ts - prev > 120_000;
      d += `${jump ? 'M' : 'L'}${x(row.ts)} ${y(pick(row), max)}`;
      prev = row.ts;
    }
    return d;
  };
  return {
    viewBox: `0 0 ${width} ${height}`,
    gap: path((row) => row.maxMs, gapScale),
    late: path((row) => row.late, lateScale),
    players: path((row) => row.players, playersScale),
    lateLineY: y(budget * 1.5, gapScale),
    scale: { gapMs: Math.round(gapScale), late: lateScale, players: playersScale },
  };
}
