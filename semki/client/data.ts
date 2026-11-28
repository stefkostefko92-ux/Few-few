// Данните, които сървърът вгражда в страницата (<script type="application/json">). Проверяват се по
// форма, преди да се ползват: счупен или непознат JSON значи „без рисунка“, не грешка в конзолата.

// Сцената на дашборда (src/domain/tiles.ts → sceneOf, плюс легендата по здраве).
export interface SeedLayoutData {
  x: number;
  z: number;
  yaw: number;
  tilt: number;
}

export interface SceneTileData {
  id: number;
  type: string;
  decay: number;
  dead: boolean;
  layout: SeedLayoutData[];
}

export interface LegendData {
  stage: string;
  decay: number;
  dead: boolean;
}

export interface SceneData {
  tiles: SceneTileData[];
  legend: LegendData[];
  legendType: string;
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

function isLayout(v: unknown): v is SeedLayoutData {
  return isObj(v) && hasNums(v, ['x', 'z', 'yaw', 'tilt']);
}

function isTile(v: unknown): v is SceneTileData {
  return (
    isObj(v) &&
    hasNums(v, ['id', 'decay']) &&
    isStr(v.type) &&
    isBool(v.dead) &&
    Array.isArray(v.layout) &&
    v.layout.length > 0 &&
    v.layout.length <= 5 &&
    v.layout.every(isLayout)
  );
}

function isLegend(v: unknown): v is LegendData {
  return isObj(v) && isStr(v.stage) && isNum(v.decay) && isBool(v.dead);
}

function isScene(v: unknown): v is SceneData {
  return (
    isObj(v) &&
    Array.isArray(v.tiles) &&
    v.tiles.every(isTile) &&
    Array.isArray(v.legend) &&
    v.legend.every(isLegend) &&
    isStr(v.legendType)
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

export function readScene(id: string): SceneData | null {
  const raw = readJson(id);
  return isScene(raw) ? raw : null;
}

export function readChart(id: string): ChartData | null {
  const raw = readJson(id);
  return isChart(raw) ? raw : null;
}
