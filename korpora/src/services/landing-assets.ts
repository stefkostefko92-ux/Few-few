import { sha256Hex } from '../crypto.js';
import { engine, type DrawingMeta, type EngineModel } from './engine.js';
import { sheetArt, type SheetLike } from './landing-sheet.js';

/**
 * Истинските изходи на двигателя за витрината. Всичко идва от един проект — кухня от четири модула:
 * първият лист от разкроя с пътя на фрезата, откъс от списъка с детайлите, началото на G-кода и чертежът
 * на една врата с картата за пробиване. Нищо не е рисувано на ръка: ако двигателят се промени, се
 * променя и витрината. Смята се веднъж, при първа нужда.
 */
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

/**
 * Числата на примера в отчета до сцената — смятат се тук, за да ги вижда всеки: и без JavaScript, и със
 * снимките (намалено движение, бавно устройство). Живата сцена сменя само реда с G-кода.
 */
export interface StoryNumbers {
  /** Габаритът, както го чете човек — като в заглавната лента на редактора и рамката на чертежа. */
  size: { W: number; H: number; D: number };
  parts: number;
  /** Различните материали на детайлите: плоча с декор. */
  materials: number;
  sheets: number;
  sheetW: number;
  sheetH: number;
  /** Средното използване на листовете, в цели проценти. */
  yieldPct: number;
  sheet1Parts: number;
  sheet1Holes: number;
  /** Първото движение от програмата на лист 1. */
  firstMove: string;
}

export interface LandingAssets {
  example: { modules: number; moduleWidth: number; parts: number };
  story: StoryNumbers;
  sheet: {
    svg: string;
    no: number;
    count: number;
    parts: number;
    holes: number;
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

/** Примерният проект на витрината — и за живата 3D сцена (landing/story.js го строи в браузъра). */
export const EXAMPLE = { type: 'kitchen', modules: 4, moduleWidth: 600 } as const;
const EXAMPLE_DATE = '2026-10-02';

let cached: LandingAssets | null = null;

/** Целият лист, когато няма какво да се изреже: размерът идва от viewBox на чертежа (двигателят рисува A3). */
function wholeSheet(svg: string, scale: number): DrawingView {
  const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  const [w, h] = box ? [Number(box[1]), Number(box[2])] : [420, 297];
  return { svg, width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Изрязва изглед от чертежа по първия правоъгълник с даден клас (`d-out` — контурът на вратата, `d-box` —
 * рамката на детайла на пантата). Ако подредбата на чертежа се смени, изгледът следва контура.
 */
export function cropView(
  svg: string,
  rectClass: string,
  pad: { x: number; top: number; bottom: number },
  scale: number,
): DrawingView {
  const rect = new RegExp(
    `<rect class="${rectClass}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`,
  ).exec(svg);
  if (!rect) return wholeSheet(svg, scale);
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
    product: 'Korpora',
    hash: sha256Hex(api.canonicalJson(model.spec)),
    owner: 'Примерен проект',
    date: EXAMPLE_DATE,
  };
  const nesting = api.nest(model);
  const sheet = nesting.sheets[0] as SheetLike;
  const sheetMeta = { ...meta, sheetCount: nesting.sheets.length };
  const art = sheetArt(model, sheet, sheetMeta);
  const dxf = api.toDxf(model, sheet);
  const door = model.parts.find((p) => p.role === 'door') as
    | (EngineModel['parts'][number] & {
        L: number;
        W: number;
        hinge?: { c: number; overlay: number; plate: number };
      })
    | undefined;
  // двигателят номерира листа на вратата сам — като в редактора и в изтегления проект
  const doorSvg = door ? api.drawingPart(model, meta, door.id) : '';
  const boards = model.parts as Array<
    EngineModel['parts'][number] & { stock: string; decor: string }
  >;
  const sheets = nesting.sheets as Array<SheetLike & { yield: number }>;
  cached = {
    example: {
      modules: EXAMPLE.modules,
      moduleWidth: EXAMPLE.moduleWidth,
      parts: model.parts.length,
    },
    story: {
      size: api.typeDims(EXAMPLE.type, model.spec),
      parts: model.parts.length,
      materials: new Set(boards.map((b) => `${b.stock}|${b.decor}`)).size,
      sheets: sheets.length,
      sheetW: sheet.w,
      sheetH: sheet.h,
      yieldPct: Math.round((sheets.reduce((sum, sh) => sum + sh.yield, 0) / sheets.length) * 100),
      sheet1Parts: sheet.placements.length,
      sheet1Holes: art.holes,
      firstMove: art.firstMove,
    },
    sheet: {
      svg: art.svg,
      no: sheet.index,
      count: nesting.sheets.length,
      parts: sheet.placements.length,
      holes: art.holes,
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
