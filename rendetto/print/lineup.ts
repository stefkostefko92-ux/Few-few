import { engine } from '../src/services/engine.js';
import {
  furnitureByGroup,
  type FurnitureGroup,
  type FurnitureKind,
} from '../src/services/furniture.js';

/**
 * Всички видове мебели в изглед отпред, в един мащаб, по групи. Геометрията е на двигателя (детайлите и
 * символите на модела с размерите по подразбиране) — същото правило като сглобения чертеж: детайлите
 * отзад напред, фронтовете отгоре, отварянето на вратите с пунктир. Без надписи вътре — четат се на
 * всеки език.
 */
interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

interface Part {
  role: string;
  box: Box;
  hingeSide?: 'left' | 'right';
}

interface Sym {
  type: string;
  x?: number;
  y?: number;
  y0?: number;
  h?: number;
  x0?: number;
  x1?: number;
  t?: number;
  horizontal?: boolean;
  model?: { holes?: number; spacing?: number };
}

interface Model {
  parts: Part[];
  symbols: Sym[];
}

export interface LineupItem {
  kind: FurnitureKind;
  /** Изгледът отпред в мм на модела; `rowHeight` е общ за реда, за да стоят всички на един под. */
  inner: string;
  x0: number;
  width: number;
  height: number;
}

export interface LineupGroup {
  group: FurnitureGroup;
  rowHeight: number;
  items: LineupItem[];
}

/** Видимите лица в декора: фронтовете и таблите на леглото. */
const FRONTS = new Set(['door', 'drawer-front', 'bed-head', 'bed-foot']);
const r = (value: number) => Math.round(value * 10) / 10;

function rect(cls: string, x: number, top: number, w: number, h: number, extra = ''): string {
  return `<rect class="${cls}" x="${r(x)}" y="${r(top)}" width="${r(w)}" height="${r(h)}"${extra}/>`;
}

/** Изгледът отпред на един модел; `Y` обръща оста — в SVG надолу, в мебелта нагоре. */
function frontView(model: Model, rowHeight: number): string {
  const Y = (y: number) => rowHeight - y;
  let g = '';
  for (const s of model.symbols.filter((sy) => sy.type === 'leg')) {
    const x = s.x ?? 0;
    const y0 = s.y0 ?? 0;
    const h = s.h ?? 0;
    g += rect('l-leg', x - 15, Y(y0 + h), 30, h);
  }
  for (const p of [...model.parts].sort((a, b) => a.box.max[2] - b.box.max[2])) {
    const [x0, y0] = p.box.min;
    const [x1, y1] = p.box.max;
    g += rect(FRONTS.has(p.role) ? 'l-front' : 'l-body', x0, Y(y1), x1 - x0, y1 - y0);
  }
  for (const d of model.parts.filter((p) => p.role === 'door')) {
    const [x0, y0] = d.box.min;
    const [x1, y1] = d.box.max;
    const apex = d.hingeSide === 'left' ? x0 : x1;
    const free = d.hingeSide === 'left' ? x1 : x0;
    g += `<polyline class="l-open" points="${r(free)},${r(Y(y1))} ${r(apex)},${r(Y((y0 + y1) / 2))} ${r(free)},${r(Y(y0))}"/>`;
  }
  for (const s of model.symbols.filter((sy) => sy.type === 'handle')) {
    const len = s.model?.holes === 2 && s.model.spacing ? s.model.spacing + 24 : 24;
    const x = s.x ?? 0;
    const y = s.y ?? 0;
    g += s.horizontal
      ? `<line class="l-handle" x1="${r(x - len / 2)}" y1="${r(Y(y))}" x2="${r(x + len / 2)}" y2="${r(Y(y))}"/>`
      : `<line class="l-handle" x1="${r(x)}" y1="${r(Y(y - len / 2))}" x2="${r(x)}" y2="${r(Y(y + len / 2))}"/>`;
  }
  for (const s of model.symbols.filter((sy) => sy.type === 'worktop')) {
    g += rect('l-top', s.x0 ?? 0, Y((s.y ?? 0) + (s.t ?? 0)), (s.x1 ?? 0) - (s.x0 ?? 0), s.t ?? 0);
  }
  for (const s of model.symbols.filter((sy) => sy.type === 'mattress')) {
    g += rect(
      'l-mattress',
      s.x0 ?? 0,
      Y((s.y ?? 0) + (s.h ?? 0)),
      (s.x1 ?? 0) - (s.x0 ?? 0),
      s.h ?? 0,
      ' rx="20"',
    );
  }
  return g;
}

/** Габаритът отпред: с краката, ако ги има; горен шкаф — само собствената му височина. */
function extents(model: Model): { x0: number; x1: number; y0: number; y1: number } {
  const xs = model.parts.flatMap((p) => [p.box.min[0], p.box.max[0]]);
  const ys = model.parts.flatMap((p) => [p.box.min[1], p.box.max[1]]);
  for (const s of model.symbols.filter((sy) => sy.type === 'worktop')) {
    xs.push(s.x0 ?? 0, s.x1 ?? 0);
    ys.push((s.y ?? 0) + (s.t ?? 0));
  }
  const legs = model.symbols.some((s) => s.type === 'leg');
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: legs ? 0 : Math.min(...ys),
    y1: Math.max(...ys),
  };
}

export function furnitureLineup(): LineupGroup[] {
  const api = engine();
  return furnitureByGroup().map(({ group, kinds }) => {
    const built = kinds.map((kind) => {
      const model = api.buildModel({ type: kind.id }) as unknown as Model;
      return { kind, model, ext: extents(model) };
    });
    const rowHeight = Math.max(...built.map((b) => b.ext.y1));
    return {
      group,
      rowHeight,
      items: built.map(({ kind, model, ext }) => ({
        kind,
        inner: frontView(model, rowHeight),
        x0: ext.x0,
        width: ext.x1 - ext.x0,
        height: ext.y1 - ext.y0,
      })),
    };
  });
}
