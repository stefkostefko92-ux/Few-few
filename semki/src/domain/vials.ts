// Рафтовете на дашборда: за всеки вид рафт със стъкленици, по една на партида. Нивото на разтвора е
// трайността, деленията по стъклото — праговете, семената в разтвора — броят (до 7). Чиста геометрия;
// сървърът я рисува като SVG (views/dashboard.ejs).
import type { BatchLike } from './alerts.js';
import { seedColor } from './chart.js';
import { expiresAt, msLeft, percentAt } from './decay.js';
import { formatDuration, formatNumber, formatPercent } from './messages.js';

// Стъкленицата във viewBox 0 0 64 210: тапа отгоре, гърло, тяло с кръгло дъно.
export const VIAL = {
  width: 64,
  height: 210,
  innerLeft: 14,
  innerRight: 50,
  innerTop: 34,
  innerBottom: 200,
  get innerHeight(): number {
    return this.innerBottom - this.innerTop;
  },
} as const;

const MAX_SEEDS = 7;

export interface VialSeed {
  cx: number;
  cy: number;
  angle: number;
}

export interface Vial {
  id: number;
  count: number;
  percentText: string;
  leftText: string;
  expiresText: string;
  levelY: number;
  ticks: Array<{ y: number; label: string }>;
  seeds: VialSeed[];
  status: string | null;
  expired: boolean;
  title: string;
}

export interface Shelf {
  key: string;
  label: string;
  color: string;
  dark: string;
  light: string;
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

// Смесване към черно (amount < 0) или бяло (amount > 0); 0 — същият цвят.
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(amount));
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (target - c) * k)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
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

// Под стъкленицата е тясно: при дни минутите отпадат („3 д 19 ч“).
export function shortDuration(ms: number): string {
  const full = formatDuration(ms);
  const m = /^(\d+ д \d+ ч)/.exec(full);
  return m?.[1] ?? full;
}

function levelOf(percent: number): number {
  return VIAL.innerBottom - (Math.max(0, Math.min(100, percent)) / 100) * VIAL.innerHeight;
}

function seedsFor(id: number, count: number, levelY: number, expired: boolean): VialSeed[] {
  const rnd = random(id * 7919);
  const n = Math.min(count, MAX_SEEDS);
  const out: VialSeed[] = [];
  const mid = (VIAL.innerLeft + VIAL.innerRight) / 2;
  for (let i = 0; i < n; i++) {
    if (expired) {
      // Изсъхнали на дъното, около средата — дъното е заоблено.
      out.push({
        cx: mid - 8 + rnd() * 16,
        cy: VIAL.innerBottom - 9 + rnd() * 5,
        angle: Math.round(-60 + rnd() * 120),
      });
      continue;
    }
    const top = Math.min(levelY + 7, VIAL.innerBottom - 10);
    const bottom = VIAL.innerBottom - 10;
    const cy = top >= bottom ? (levelY + VIAL.innerBottom) / 2 : top + rnd() * (bottom - top);
    // В долната заоблена част стъклото се стеснява — семето се държи по-близо до средата.
    const narrow = cy > VIAL.innerBottom - 18 ? 6 : 13;
    out.push({
      cx: mid - narrow + rnd() * narrow * 2,
      cy,
      angle: Math.round(-60 + rnd() * 120),
    });
  }
  return out;
}

export function buildShelves(input: ShelvesInput): { shelves: Shelf[]; empty: string[] } {
  const thresholds = [...new Set(input.thresholds)]
    .filter((t) => t > 0 && t < 100)
    .sort((a, b) => b - a);
  const ticks = thresholds.map((t) => ({ y: levelOf(t), label: `${formatNumber(t)}%` }));
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
      const levelY = expired ? VIAL.innerBottom : levelOf(p);
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
        levelY,
        ticks,
        seeds: seedsFor(b.id, b.count, levelY, expired),
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
    const color = seedColor(type.key);
    shelves.push({
      key: type.key,
      label: type.label,
      color,
      dark: shade(color, -0.55),
      light: shade(color, 0.45),
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
