import { sha256Hex } from '../crypto.js';
import { engine, type DrawingMeta, type EngineModel, type EngineSheet } from './engine.js';

/**
 * Истинските изходи на двигателя за витрината. Всичко идва от един проект — кухня от четири модула:
 * първият лист от разкроя с пътя на фрезата, откъс от списъка с детайлите, началото на G-кода и чертежът
 * на една врата с картата за пробиване. Нищо не е рисувано на ръка: ако двигателят се промени, се
 * променя и витрината. Смята се веднъж, при първа нужда.
 */
interface Move {
  type: string;
  tool?: string;
  at?: [number, number];
  from?: { X: number; Y: number; Z: number };
  to?: { X: number; Y: number; Z: number };
  center?: [number, number];
}

interface Tool {
  id: string;
  kind: string;
  d: number;
}

interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  partId: string;
}

interface SheetLike extends EngineSheet {
  w: number;
  h: number;
  placements: Placement[];
}

interface BomRow {
  id: string;
  key: string;
  module: string;
  L: number;
  W: number;
  T: number;
  cutL: number;
  cutW: number;
  edgesL: number[];
  edgesW: number[];
  holes: number;
}

export interface CutRow {
  id: string;
  /** Ключът на детайла без модула (`sideL`, `c1door1`…) — по него се превежда името. */
  slot: string;
  L: number;
  W: number;
  T: number;
  cutL: number;
  cutW: number;
  edgesL: number[];
  edgesW: number[];
  holes: number;
}

/** Изрязан изглед от чертежа: същият SVG с друг viewBox. Размерите са за width/height на <img>. */
export interface DrawingView {
  svg: string;
  width: number;
  height: number;
}

export interface LandingAssets {
  example: { modules: number; moduleWidth: number; parts: number };
  sheet: {
    svg: string;
    no: number;
    count: number;
    parts: number;
    holes: number;
    widthMm: number;
    heightMm: number;
  };
  tools: { contour: number | null; groove: number | null; drills: number[] };
  cutRows: CutRow[];
  door: {
    svg: string;
    elevation: DrawingView;
    cup: DrawingView;
    c: number;
    overlay: number;
    plate: number;
    height: number;
    width: number;
  } | null;
  gcode: string[];
  dxfLayers: string[];
}

const EXAMPLE = { type: 'kitchen', modules: 4, moduleWidth: 600 };
const EXAMPLE_DATE = '2026-10-02';
/** Пътят на фрезата се изрисува на вълни в реда на рязане (класовете w1…w6 в site.css). */
const WAVES = 6;

let cached: LandingAssets | null = null;

/** Инструментът по вид — същото правило като в редактора: T4 е фрезата за каналите. */
function toolClass(tool: Tool | undefined): 'tdrill' | 'tgroove' | 'tcontour' {
  if (!tool || tool.kind === 'drill') return 'tdrill';
  return tool.id === 'T4' ? 'tgroove' : 'tcontour';
}

function sheetArt(model: EngineModel, sheet: SheetLike, meta: DrawingMeta) {
  const g = engine().toGcode(model, sheet, meta) as unknown as {
    text: string;
    moves: Move[];
    tools: Tool[];
  };
  const tools = new Map(g.tools.map((t) => [t.id, t]));
  const fy = (y: number) => sheet.h - y;
  const cuts: string[] = [];
  let drills = '';
  let holes = 0;
  for (const m of g.moves) {
    const tool = m.tool ? tools.get(m.tool) : undefined;
    if (m.type === 'drill' && m.at) {
      holes += 1;
      drills += `<circle cx="${m.at[0]}" cy="${fy(m.at[1])}" r="${Math.max((tool?.d ?? 5) / 2, 5)}" class="hole ${toolClass(tool)}"/>`;
      continue;
    }
    if (m.type === 'rapid' || !m.from || !m.to || !tool) continue;
    if (m.from.X === m.to.X && m.from.Y === m.to.Y) continue;
    const r = m.center ? Math.hypot(m.from.X - m.center[0], m.from.Y - m.center[1]) : 0;
    const d =
      m.type === 'arc' && m.center
        ? `M${m.from.X} ${fy(m.from.Y)}A${r} ${r} 0 0 1 ${m.to.X} ${fy(m.to.Y)}`
        : `M${m.from.X} ${fy(m.from.Y)}L${m.to.X} ${fy(m.to.Y)}`;
    cuts.push(`<path d="${d}" pathLength="1" class="cut ${toolClass(tool)} w{wave}"/>`);
  }
  const paths = cuts
    .map((path, i) => path.replace('{wave}', String(Math.floor((i * WAVES) / cuts.length) + 1)))
    .join('');
  let parts = '';
  for (const p of sheet.placements) {
    const y = fy(p.y + p.h);
    const size = Math.min(110, Math.max(44, Math.min(p.w, p.h) * 0.36));
    parts += `<rect x="${p.x}" y="${y}" width="${p.w}" height="${p.h}" class="part"/><text x="${p.x + 24}" y="${y + size + 12}" font-size="${size}" class="pid">${p.partId}</text>`;
  }
  const svg = `<svg viewBox="-30 -30 ${sheet.w + 60} ${sheet.h + 60}" class="sheet-art" aria-hidden="true" focusable="false"><rect x="10" y="22" width="${sheet.w}" height="${sheet.h}" class="board-shadow"/><rect x="0" y="0" width="${sheet.w}" height="${sheet.h}" class="board"/>${parts}<g class="paths">${paths}</g><g>${drills}</g></svg>`;
  const used = new Set(
    g.moves.map((m) => m.tool).filter((id): id is string => typeof id === 'string'),
  );
  const usedTools = g.tools.filter((t) => used.has(t.id));
  return {
    svg,
    holes,
    gcode: g.text.split('\n').slice(0, 16),
    tools: {
      contour: usedTools.find((t) => toolClass(t) === 'tcontour')?.d ?? null,
      groove: usedTools.find((t) => toolClass(t) === 'tgroove')?.d ?? null,
      drills: usedTools.filter((t) => t.kind === 'drill').map((t) => t.d),
    },
  };
}

/**
 * Изрязва изглед от чертежа по първия правоъгълник с даден клас (`d-out` — контурът на вратата, `d-box` —
 * рамката на детайла на пантата). Ако подредбата на чертежа се смени, изгледът следва контура.
 */
function cropView(
  svg: string,
  rectClass: string,
  pad: { x: number; top: number; bottom: number },
  scale: number,
): DrawingView {
  const rect = new RegExp(
    `<rect class="${rectClass}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`,
  ).exec(svg);
  if (!rect) return { svg, width: 1260, height: 891 };
  const [x, y, w, h] = rect.slice(1, 5).map(Number) as [number, number, number, number];
  const box = [x - pad.x, y - pad.top, w + 2 * pad.x, h + pad.top + pad.bottom].map(
    (v) => Math.round(v * 10) / 10,
  ) as [number, number, number, number];
  return {
    svg: svg.replace(/viewBox="[^"]*"/, `viewBox="${box.join(' ')}"`),
    width: Math.round(box[2] * scale),
    height: Math.round(box[3] * scale),
  };
}

function cutRows(model: EngineModel): CutRow[] {
  const rows = (engine().buildBom(model) as { rows: BomRow[] }).rows;
  const first = rows[0]?.module ?? '';
  return rows
    .filter((r) => r.module === first)
    .map((r) => ({
      id: r.id,
      slot: r.key.slice(first.length),
      L: r.L,
      W: r.W,
      T: r.T,
      cutL: r.cutL,
      cutW: r.cutW,
      edgesL: r.edgesL,
      edgesW: r.edgesW,
      holes: r.holes,
    }));
}

export function landingAssets(): LandingAssets {
  if (cached) return cached;
  const api = engine();
  const model = api.buildModel(EXAMPLE);
  const meta: DrawingMeta = {
    product: 'Rendetto',
    hash: sha256Hex(api.canonicalJson(model.spec)),
    owner: 'Примерен проект',
    date: EXAMPLE_DATE,
  };
  const nesting = api.nest(model);
  const sheet = nesting.sheets[0] as SheetLike;
  const sheetMeta = { ...meta, sheetCount: nesting.sheets.length };
  const art = sheetArt(model, sheet, sheetMeta);
  const dxf = api.toDxf(model, sheet, sheetMeta) as unknown as { layers: string[] };
  const index = model.parts.findIndex((p) => p.role === 'door');
  const door = model.parts[index] as
    | (EngineModel['parts'][number] & {
        L: number;
        W: number;
        hinge?: { c: number; overlay: number; plate: number };
      })
    | undefined;
  const doorSvg = door
    ? api.drawingPart(model, meta, door.id, index + 2, model.parts.length + 1)
    : '';
  cached = {
    example: {
      modules: EXAMPLE.modules,
      moduleWidth: EXAMPLE.moduleWidth,
      parts: model.parts.length,
    },
    sheet: {
      svg: art.svg,
      no: sheet.index,
      count: nesting.sheets.length,
      parts: sheet.placements.length,
      holes: art.holes,
      widthMm: sheet.w,
      heightMm: sheet.h,
    },
    tools: art.tools,
    cutRows: cutRows(model),
    door:
      door && door.hinge
        ? {
            svg: doorSvg,
            elevation: cropView(doorSvg, 'd-out', { x: 30, top: 22, bottom: 30 }, 4),
            cup: cropView(doorSvg, 'd-box', { x: 1.5, top: 1.5, bottom: 1.5 }, 4),
            c: door.hinge.c,
            overlay: door.hinge.overlay,
            plate: door.hinge.plate,
            height: door.L,
            width: door.W,
          }
        : null,
    gcode: art.gcode,
    dxfLayers: dxf.layers.filter((layer) => layer !== 'SHEET' && layer !== 'LABELS'),
  };
  return cached;
}
