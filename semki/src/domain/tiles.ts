// Плочките на дашборда: за всеки вид група, по една плочка на партида с купчинка семена в 3D (до 5),
// здравето ѝ по трайността и какво ѝ остава. Тук са данните (нормирани, без пиксели); браузърът рисува
// семената (client/seeds3d.ts). Плюс: кога е следващият праг от правилата за известия.
import { crossingTime, ruleApplies, type BatchLike, type RuleLike } from './alerts.js';
import { seedColor, swatchKey } from './chart.js';
import { expiresAt, msLeft, percentAt } from './decay.js';
import { healthOf, type Health } from './health.js';
import { formatDuration, formatNumber, formatPercent, formatThreshold } from './messages.js';

const MAX_SHOWN = 5;

// Семе в купчинката: място на масата в дължини на семе (x надясно, z към зрителя), завъртане около
// вертикалата (yaw) и лек наклон. Първото е най-отпред — то е „лицето“ на партидата.
export interface SeedLayout {
  x: number;
  z: number;
  yaw: number;
  tilt: number;
}

export interface Tile {
  id: number;
  count: number;
  percent: number;
  percentText: string;
  percentWhole: string;
  leftText: string;
  expiresText: string;
  health: Health;
  // „под 20%“ — най-ниският минат праг от включените правила в %, иначе null.
  status: string | null;
  expired: boolean;
  title: string;
  layout: SeedLayout[];
}

export interface TileGroup {
  key: string;
  label: string;
  color: string;
  swatch: string;
  seeds: number;
  batches: number;
  expired: number;
  lowestText: string;
  soonestText: string;
  tiles: Tile[];
}

export interface TilesInput {
  batches: readonly BatchLike[];
  types: ReadonlyArray<{ key: string; label: string }>;
  thresholds: readonly number[];
  now: Date;
  timezone: string;
}

// Това, което браузърът рисува: id → степен на разваляне и купчинката.
export interface SceneTile {
  id: number;
  type: string;
  decay: number;
  dead: boolean;
  layout: SeedLayout[];
}

// Детерминистичен генератор (mulberry32): купчинката е една и съща при всяко опресняване.
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

// Местата в купчинката: първото отпред в средата, останалите — разпилени зад него. Разстоянията са
// по-големи от едно семе, затова не се застъпват.
const SLOTS: ReadonlyArray<[number, number]> = [
  [0, 0.15],
  [-1.15, -0.55],
  [1.15, -0.5],
  [-0.4, -1.35],
  [0.75, -1.45],
];

export function pileLayout(id: number, count: number): SeedLayout[] {
  const rnd = random(id * 7919 + 17);
  const n = Math.max(1, Math.min(MAX_SHOWN, count));
  return SLOTS.slice(0, n).map(([x, z], i) => ({
    x: round3(x + (rnd() - 0.5) * 0.25),
    z: round3(z + (rnd() - 0.5) * 0.2),
    // лицевото семе е почти напряко на зрителя, другите — накъдето паднат
    yaw: round3(i === 0 ? -0.35 + rnd() * 0.5 : rnd() * Math.PI * 2),
    tilt: round3((rnd() - 0.5) * 0.3),
  }));
}

// Под стъкленицата/плочката е тясно: при дни минутите отпадат („3 д 19 ч“).
export function shortDuration(ms: number): string {
  const full = formatDuration(ms);
  const m = /^(\d+ д \d+ ч)/.exec(full);
  return m?.[1] ?? full;
}

export function buildGroups(input: TilesInput): { groups: TileGroup[]; empty: string[] } {
  const thresholds = [...new Set(input.thresholds)].filter((t) => t > 0 && t < 100);
  const dateTime = new Intl.DateTimeFormat('bg-BG', {
    timeZone: input.timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const groups: TileGroup[] = [];
  const empty: string[] = [];
  for (const type of input.types) {
    const ofType = input.batches
      .filter((b) => b.seedTypeKey === type.key)
      .sort((a, b) => expiresAt(a, a.rate).getTime() - expiresAt(b, b.rate).getTime());
    if (ofType.length === 0) {
      empty.push(type.label);
      continue;
    }
    const tiles = ofType.map((b): Tile => {
      const p = percentAt(b, b.rate, input.now);
      const left = msLeft(b, b.rate, input.now);
      const expired = left <= 0;
      const crossed = thresholds.filter((t) => p <= t);
      const expiresText = dateTime.format(expiresAt(b, b.rate));
      return {
        id: b.id,
        count: b.count,
        percent: p,
        percentText: formatPercent(p),
        percentWhole: formatNumber(Math.floor(p)),
        leftText: expired ? 'изтекла' : shortDuration(left),
        expiresText,
        health: healthOf(p, expired),
        status:
          !expired && crossed.length > 0 ? `под ${formatNumber(Math.min(...crossed))}%` : null,
        expired,
        title:
          `#${b.id} ${type.label} ×${b.count} · ${formatPercent(p)} · ` +
          (expired ? 'изтекла' : `остават ${formatDuration(left)} · изтича ${expiresText}`),
        layout: pileLayout(b.id, b.count),
      };
    });
    const live = ofType.filter((b) => msLeft(b, b.rate, input.now) > 0);
    const lowest = live.length
      ? Math.min(...live.map((b) => percentAt(b, b.rate, input.now)))
      : null;
    const soonest = live.length ? Math.min(...live.map((b) => msLeft(b, b.rate, input.now))) : null;
    groups.push({
      key: type.key,
      label: type.label,
      color: seedColor(type.key),
      swatch: swatchKey(type.key),
      seeds: live.reduce((s, b) => s + b.count, 0),
      batches: live.length,
      expired: ofType.length - live.length,
      lowestText: lowest === null ? '—' : formatPercent(lowest),
      soonestText: soonest === null ? '—' : formatDuration(soonest),
      tiles,
    });
  }
  return { groups, empty };
}

export function sceneOf(groups: readonly TileGroup[]): SceneTile[] {
  return groups.flatMap((g) =>
    g.tiles.map((t) => ({
      id: t.id,
      type: g.key,
      decay: t.health.decay,
      dead: t.health.stage === 'dead',
      layout: t.layout,
    })),
  );
}

export interface NextCrossing {
  at: Date;
  batchId: number;
  seedTypeKey: string;
  thresholdText: string;
}

// Най-близкият бъдещ праг от включените правила за живите партиди — „следващият таг“ без часовия
// прозорец и без повторенията. Минатите прагове вече са пингнати или отбелязани тихо.
export function nextCrossing(
  batches: readonly BatchLike[],
  rules: readonly RuleLike[],
  now: Date,
): NextCrossing | null {
  let best: NextCrossing | null = null;
  for (const b of batches) {
    if (msLeft(b, b.rate, now) <= 0) continue;
    for (const r of rules) {
      if (!ruleApplies(r, b)) continue;
      const at = crossingTime(r, b);
      if (at.getTime() <= now.getTime()) continue;
      if (!best || at.getTime() < best.at.getTime()) {
        best = {
          at,
          batchId: b.id,
          seedTypeKey: b.seedTypeKey,
          thresholdText: formatThreshold(r.kind, r.threshold),
        };
      }
    }
  }
  return best;
}
