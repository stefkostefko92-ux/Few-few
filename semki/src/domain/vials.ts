// Рафтовете на дашборда: за всеки вид рафт със стъкленици, по една на партида. Тук са само данните на
// сцената (нормирани, без пиксели): нивото на разтвора (трайността), праговете като деления по стъклото и
// семената в разтвора (броят, до 7). Браузърът ги рисува в 3D (client/shelves3d.ts).
import type { BatchLike } from './alerts.js';
import { seedColor, swatchKey } from './chart.js';
import { expiresAt, msLeft, percentAt } from './decay.js';
import { formatDuration, formatNumber, formatPercent } from './messages.js';

const MAX_SEEDS = 7;

// Семе в стъкленицата: височина в разтвора (0 — дъното, 1 — повърхността), ъгъл около оста,
// разстояние от оста (0 — центъра, 1 — до стъклото) и завъртане. Всичко в [0, 1] или в радиани.
export interface VialSeed {
  u: number;
  angle: number;
  radial: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface Vial {
  id: number;
  count: number;
  percentText: string;
  leftText: string;
  expiresText: string;
  // 0..1 — колко от стъкленицата е пълна (= трайността / 100).
  level: number;
  // Праговете в % като части от пълната стъкленица, от горния към долния.
  ticks: number[];
  seeds: VialSeed[];
  status: string | null;
  expired: boolean;
  title: string;
}

export interface Shelf {
  key: string;
  label: string;
  color: string;
  swatch: string;
  seeds: number;
  batches: number;
  expired: number;
  lowestText: string;
  soonestText: string;
  vials: Vial[];
}

export interface ShelvesInput {
  batches: readonly BatchLike[];
  types: ReadonlyArray<{ key: string; label: string }>;
  thresholds: readonly number[];
  now: Date;
  timezone: string;
}

// Данните, които браузърът рисува: по рафт — цветът на разтвора и стъклениците.
export interface SceneShelf {
  key: string;
  color: string;
  vials: Array<{
    id: number;
    level: number;
    expired: boolean;
    ticks: number[];
    seeds: VialSeed[];
  }>;
}

// Детерминистичен генератор (mulberry32): семената стоят на едно място при всяко опресняване.
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// Под стъкленицата е тясно: при дни минутите отпадат („3 д 19 ч“).
export function shortDuration(ms: number): string {
  const full = formatDuration(ms);
  const m = /^(\d+ д \d+ ч)/.exec(full);
  return m?.[1] ?? full;
}

function seedsFor(id: number, count: number): VialSeed[] {
  const rnd = random(id * 7919);
  const out: VialSeed[] = [];
  for (let i = 0; i < Math.min(count, MAX_SEEDS); i++) {
    out.push({
      u: round3(rnd()),
      angle: round3(rnd() * Math.PI * 2),
      radial: round3(Math.sqrt(rnd())), // равномерно по кръга, не струпани в центъра
      rx: round3(rnd() * Math.PI),
      ry: round3(rnd() * Math.PI),
      rz: round3(rnd() * Math.PI),
    });
  }
  return out;
}

export function buildShelves(input: ShelvesInput): { shelves: Shelf[]; empty: string[] } {
  const thresholds = [...new Set(input.thresholds)]
    .filter((t) => t > 0 && t < 100)
    .sort((a, b) => b - a);
  const ticks = thresholds.map((t) => t / 100);
  const dateTime = new Intl.DateTimeFormat('bg-BG', {
    timeZone: input.timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const shelves: Shelf[] = [];
  const empty: string[] = [];
  for (const type of input.types) {
    const ofType = input.batches
      .filter((b) => b.seedTypeKey === type.key)
      .sort((a, b) => expiresAt(a, a.rate).getTime() - expiresAt(b, b.rate).getTime());
    if (ofType.length === 0) {
      empty.push(type.label);
      continue;
    }
    const vials = ofType.map((b): Vial => {
      const p = percentAt(b, b.rate, input.now);
      const left = msLeft(b, b.rate, input.now);
      const expired = left <= 0;
      const crossed = thresholds.filter((t) => p <= t);
      const status =
        !expired && crossed.length > 0 ? `под ${formatNumber(Math.min(...crossed))}%` : null;
      const expiresText = dateTime.format(expiresAt(b, b.rate));
      return {
        id: b.id,
        count: b.count,
        percentText: formatPercent(p),
        leftText: expired ? 'изтекла' : shortDuration(left),
        expiresText,
        level: expired ? 0 : round3(Math.max(0, Math.min(100, p)) / 100),
        ticks,
        seeds: seedsFor(b.id, b.count),
        status,
        expired,
        title:
          `#${b.id} ${type.label} ×${b.count} · ${formatPercent(p)} · ` +
          (expired ? 'изтекла' : `остават ${formatDuration(left)} · изтича ${expiresText}`),
      };
    });
    const live = ofType.filter((b) => msLeft(b, b.rate, input.now) > 0);
    const lowest = live.length
      ? Math.min(...live.map((b) => percentAt(b, b.rate, input.now)))
      : null;
    const soonest = live.length ? Math.min(...live.map((b) => msLeft(b, b.rate, input.now))) : null;
    shelves.push({
      key: type.key,
      label: type.label,
      color: seedColor(type.key),
      swatch: swatchKey(type.key),
      seeds: live.reduce((s, b) => s + b.count, 0),
      batches: live.length,
      expired: ofType.length - live.length,
      lowestText: lowest === null ? '—' : formatPercent(lowest),
      soonestText: soonest === null ? '—' : formatDuration(soonest),
      vials,
    });
  }
  return { shelves, empty };
}

export function sceneOf(shelves: readonly Shelf[]): SceneShelf[] {
  return shelves.map((s) => ({
    key: s.key,
    color: s.color,
    vials: s.vials.map((v) => ({
      id: v.id,
      level: v.level,
      expired: v.expired,
      ticks: v.ticks,
      seeds: v.seeds,
    })),
  }));
}
