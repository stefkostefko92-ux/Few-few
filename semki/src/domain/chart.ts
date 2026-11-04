// Графиката на дашборда: всяка партида е отсечка от текущия % сега до 0% при изтичане (или до ръба на
// хоризонта). Чиста геометрия — сървърът я рисува като SVG, браузърът само добавя посочване.
import { minutesOfDay, type BatchLike } from './alerts.js';
import { expiresAt, HOUR_MS, msLeft, percentAt, percentPerMs } from './decay.js';
import {
  formatDuration,
  formatNumber,
  formatPercent,
  seedLabel,
  type SeedLabels,
} from './messages.js';

// Категориални цветове по вид (тъмната палитра, проверена с validate_palette.js спрямо #171d19:
// CVD ΔE ≥ 9,4 между съседи, контраст ≥ 3:1). Purple е виолетово, за да не спори с името си.
export const SEED_COLORS: Readonly<Record<string, string>> = {
  amnesia: '#3987e5',
  ak: '#d95926',
  ogkush: '#199e70',
  purple: '#9085e9',
  skunk: '#c98500',
};
const OTHER_COLOR = '#898781';

const WIDTH = 960;
const HEIGHT = 360;
const PLOT = { x: 48, y: 16, w: WIDTH - 48 - 76, h: HEIGHT - 16 - 40 };
const MIN_HOURS = 24;
const MAX_HOURS = 14 * 24;
const QUARTER = 15 * 60_000;

export interface ChartInput {
  batches: readonly BatchLike[];
  labels: SeedLabels;
  thresholds: readonly number[];
  now: Date;
  timezone: string;
}

export interface ChartSeries {
  id: number;
  key: string;
  color: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // Партидата изтича в хоризонта (краят е точка на 0%), иначе линията излиза от ръба.
  endsInside: boolean;
  title: string;
}

export interface ChartModel {
  width: number;
  height: number;
  plot: typeof PLOT;
  hours: number;
  series: ChartSeries[];
  thresholds: Array<{ y: number; label: string }>;
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; label: string }>;
  legend: Array<{ key: string; label: string; color: string; count: number; batches: number }>;
  expired: number;
  // Данните за посочването (dashboard.js), вече безопасни за <script type="application/json">.
  hoverJson: string;
}

export function seedColor(key: string): string {
  return SEED_COLORS[key] ?? OTHER_COLOR;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function buildChart(input: ChartInput): ChartModel {
  const start = input.now.getTime();
  const live = input.batches.filter((b) => msLeft(b, b.rate, input.now) > 0);
  const longest = Math.max(0, ...live.map((b) => msLeft(b, b.rate, input.now))) / HOUR_MS;
  const hours = Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.ceil(longest / 24) * 24));
  const end = start + hours * HOUR_MS;

  const xOf = (t: number) => PLOT.x + ((t - start) / (end - start)) * PLOT.w;
  const yOf = (p: number) => PLOT.y + (1 - p / 100) * PLOT.h;

  const dateTime = new Intl.DateTimeFormat('bg-BG', {
    timeZone: input.timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const dayLabel = new Intl.DateTimeFormat('bg-BG', {
    timeZone: input.timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });

  const series: ChartSeries[] = live.map((b) => {
    const p0 = percentAt(b, b.rate, input.now);
    const exp = expiresAt(b, b.rate).getTime();
    const tEnd = Math.min(exp, end);
    const label = seedLabel(input.labels, b.seedTypeKey);
    return {
      id: b.id,
      key: b.seedTypeKey,
      color: seedColor(b.seedTypeKey),
      x0: xOf(start),
      y0: yOf(p0),
      x1: xOf(tEnd),
      y1: yOf(percentAt(b, b.rate, new Date(tEnd))),
      endsInside: exp <= end,
      title:
        `#${b.id} ${label} ×${b.count} · ${formatPercent(p0)} · ` +
        `остават ${formatDuration(msLeft(b, b.rate, input.now))} · изтича ${dateTime.format(new Date(exp))}`,
    };
  });

  const thresholds = [...new Set(input.thresholds)]
    .filter((t) => t >= 0 && t <= 100)
    .sort((a, b) => b - a)
    .map((t) => ({ y: yOf(t), label: `≤ ${formatNumber(t)}%` }));

  // Деления по времето: всяка местна полунощ; при кратък хоризонт — и обед. Деление на по-малко от
  // NOW_GAP от левия край е без надпис — там стои „сега“.
  const NOW_GAP = 48;
  const xTicks: ChartModel['xTicks'] = [];
  for (let t = Math.ceil(start / QUARTER) * QUARTER; t <= end; t += QUARTER) {
    const m = minutesOfDay(new Date(t), input.timezone);
    const x = xOf(t);
    const room = x - PLOT.x >= NOW_GAP;
    if (m === 0) xTicks.push({ x, label: room ? dayLabel.format(new Date(t)) : '' });
    else if (m === 720 && hours <= 72) xTicks.push({ x, label: room ? '12:00' : '' });
  }
  const yTicks = [0, 25, 50, 75, 100].map((p) => ({ y: yOf(p), label: `${p}%` }));

  const order = Object.keys(input.labels);
  const keys = [...new Set(live.map((b) => b.seedTypeKey))].sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
  );
  const legend = keys.map((key) => {
    const ofType = live.filter((b) => b.seedTypeKey === key);
    return {
      key,
      label: seedLabel(input.labels, key),
      color: seedColor(key),
      count: ofType.reduce((s, b) => s + b.count, 0),
      batches: ofType.length,
    };
  });

  const hoverJson = safeJson({
    start,
    end,
    plot: PLOT,
    width: WIDTH,
    timezone: input.timezone,
    series: live.map((b) => ({
      id: b.id,
      label: seedLabel(input.labels, b.seedTypeKey),
      color: seedColor(b.seedTypeKey),
      count: b.count,
      p0: percentAt(b, b.rate, input.now),
      slope: percentPerMs(b.rate),
      exp: expiresAt(b, b.rate).getTime(),
    })),
  });

  return {
    width: WIDTH,
    height: HEIGHT,
    plot: PLOT,
    hours,
    series,
    thresholds,
    xTicks,
    yTicks,
    legend,
    expired: input.batches.length - live.length,
    hoverJson,
  };
}
