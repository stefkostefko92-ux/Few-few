// Данните, които сървърът вгражда в страницата (<script type="application/json">). Проверяват се по
// форма, преди да се ползват: счупен или непознат JSON значи „без рисунка“, не грешка в конзолата.

export interface SeedData {
  u: number;
  angle: number;
  radial: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface VialData {
  id: number;
  level: number;
  expired: boolean;
  ticks: number[];
  seeds: SeedData[];
}

export interface ShelfData {
  key: string;
  color: string;
  vials: VialData[];
}

export interface ChartSeriesData {
  id: number;
  label: string;
  color: string;
  count: number;
  p0: number;
  slope: number;
  exp: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  endsInside: boolean;
}

export interface ChartData {
  start: number;
  end: number;
  width: number;
  height: number;
  timezone: string;
  plot: { x: number; y: number; w: number; h: number };
  thresholds: Array<{ y: number; label: string }>;
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; label: string }>;
  series: ChartSeriesData[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isColor = (v: unknown): v is string => isStr(v) && /^#[0-9a-f]{6}$/i.test(v);

function hasNums(o: Obj, keys: readonly string[]): boolean {
  return keys.every((k) => isNum(o[k]));
}

function isSeed(v: unknown): v is SeedData {
  return isObj(v) && hasNums(v, ['u', 'angle', 'radial', 'rx', 'ry', 'rz']);
}

function isVial(v: unknown): v is VialData {
  return (
    isObj(v) &&
    hasNums(v, ['id', 'level']) &&
    isBool(v.expired) &&
    Array.isArray(v.ticks) &&
    v.ticks.every(isNum) &&
    Array.isArray(v.seeds) &&
    v.seeds.every(isSeed)
  );
}

function isShelf(v: unknown): v is ShelfData {
  return (
    isObj(v) && isStr(v.key) && isColor(v.color) && Array.isArray(v.vials) && v.vials.every(isVial)
  );
}

const isMark =
  (axis: 'x' | 'y') =>
  (v: unknown): boolean =>
    isObj(v) && isNum(v[axis]) && isStr(v.label);

function isSeries(v: unknown): v is ChartSeriesData {
  return (
    isObj(v) &&
    hasNums(v, ['id', 'count', 'p0', 'slope', 'exp', 'x0', 'y0', 'x1', 'y1']) &&
    isStr(v.label) &&
    isColor(v.color) &&
    isBool(v.endsInside)
  );
}

function isChart(v: unknown): v is ChartData {
  return (
    isObj(v) &&
    hasNums(v, ['start', 'end', 'width', 'height']) &&
    isStr(v.timezone) &&
    isObj(v.plot) &&
    hasNums(v.plot, ['x', 'y', 'w', 'h']) &&
    Array.isArray(v.thresholds) &&
    v.thresholds.every(isMark('y')) &&
    Array.isArray(v.xTicks) &&
    v.xTicks.every(isMark('x')) &&
    Array.isArray(v.yTicks) &&
    v.yTicks.every(isMark('y')) &&
    Array.isArray(v.series) &&
    v.series.every(isSeries)
  );
}

function readJson(id: string): unknown {
  const el = document.getElementById(id);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as unknown;
  } catch {
    return null;
  }
}

export function readShelves(id: string): ShelfData[] | null {
  const raw = readJson(id);
  return Array.isArray(raw) && raw.every(isShelf) ? raw : null;
}

export function readChart(id: string): ChartData | null {
  const raw = readJson(id);
  return isChart(raw) ? raw : null;
}
