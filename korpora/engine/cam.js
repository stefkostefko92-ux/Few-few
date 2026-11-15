// CNC operations for one nested sheet: what keeps the machine files from being made (cncBlockers) and the feature
// positions on the sheet. The tools are in tooling.js (a demo machine profile: fixed tool numbers per drill diameter; a
// real installation reads them from the machine's tool library), the G-code posts in gcode.js.
import { cutSize, THROUGH_EXTRA } from './panel.js';
import { STOCK } from './materials.js';
import { r1 } from './util.js';
import { translator } from './i18n.js';
import { DRILLS, drillFor, GROOVE_MILL } from './tooling.js';

export { GROOVE_MILL, CUT_LENGTH, contourTool } from './tooling.js';
export { toGcode, RAMP_MAX_DEG } from './gcode.js';

// Board thickness tolerance ±0,3 mm (EN 14323): the last pass goes 0,6 mm into the spoilboard, so a board 0,3 mm
// thicker is still cut through, and the onion skin is 0,5 mm, so a board 0,3 mm thinner still keeps 0,2 mm of it.
export const SPOIL = 0.6; // final contour depth below the sheet, mm
export const CLEAR = 3; // R plane: rapids end and feeds start this high above the sheet top, mm
export const ONION = 0.5; // skin left by the first contour pass, mm

// GRBL drives light hobby routers: milling goes down in levels of at most stepDown (mm) and no feed exceeds maxFeed
// (mm/min). These are conservative defaults; the project sets its own (spec grblStepDown, grblMaxFeed, within the
// ranges below) and the G-code header prints them. When the cap cuts a feed, the spindle slows with it to keep the chip
// load, down to minRpm (our assumption: a hobby router such as the Makita RT0701C runs from 10 000 rpm). ISO keeps the
// full-depth passes of an industrial nesting machine.
export const POSTS = {
  iso: { id: 'iso', name: 'ISO / Fanuc-стил (G81/G83, G43, смяна T…M6)', version: 'iso-2.2' },
  grbl: { id: 'grbl', name: 'GRBL (хоби, ръчна смяна на инструмента)', version: 'grbl-2.3', stepDown: 3, maxFeed: 2000, minRpm: 10000 },
};
export const STEP_DOWN_RANGE = [0.5, 20];
export const MAX_FEED_RANGE = [300, 10000];

// A groove wider than the cutter (the 10 mm groove of a Planofit straightener) is cut in passes side by side, the
// outer ones on the edges of the groove, at most 80 % of the cutter apart; a groove as wide as the cutter, in one.
export function grooveLines(g, tool) {
  const spread = g.w - tool.d;
  if (spread <= 0.01) return [g];
  const n = Math.ceil(spread / (0.8 * tool.d)) + 1;
  const len = Math.hypot(g.X2 - g.X1, g.Y2 - g.Y1);
  const [nx, ny] = [-(g.Y2 - g.Y1) / len, (g.X2 - g.X1) / len];
  return Array.from({ length: n }, (_, k) => {
    const o = -spread / 2 + (spread * k) / (n - 1);
    return { X1: r1(g.X1 + nx * o), Y1: r1(g.Y1 + ny * o), X2: r1(g.X2 + nx * o), Y2: r1(g.Y2 + ny * o) };
  });
}

// The name of a sheet's CNC file — one rule for cnc.zip, project.zip (under cnc/) and the CNC tab: sheet-01.nc.
export const cncFileName = (index, ext) => `sheet-${String(index).padStart(2, '0')}.${ext}`;

// Finished-part (u, v) → cut-part offset (edge band) → placement on the sheet (with rotation).
function placer(part, pl, compensate) {
  const cut = cutSize(part, compensate);
  return (u, v) => {
    const uc = u - cut.du0;
    const vc = v - cut.dv0;
    return pl.rot ? [r1(pl.x + cut.W - vc), r1(pl.y + uc)] : [r1(pl.x + uc), r1(pl.y + vc)];
  };
}

// Holes whose circle would leave the cut contour of their part on this sheet, and grooves narrower than the groove mill
// (a wider one is cut in passes side by side, grooveLines).
function sheetFaults(model, sheet) {
  const out = [];
  const byId = new Map(model.parts.map((p) => [p.id, p]));
  for (const pl of sheet.placements) {
    const part = byId.get(pl.partId);
    const map = placer(part, pl, model.spec.bandCompensation);
    for (const f of part.features) {
      if (f.type === 'groove' && f.w < GROOVE_MILL.d - 0.01) out.push(translator(model.lang)('w.grooveNarrow', { part: part.name, w: translator(model.lang).num(f.w), d: translator(model.lang).num(GROOVE_MILL.d) }));
      if (f.type !== 'hole') continue;
      const [X, Y] = map(f.u, f.v);
      const r = f.d / 2 - 0.05;
      if (X - r < pl.x || X + r > pl.x + pl.w || Y - r < pl.y || Y + r > pl.y + pl.h) out.push(translator(model.lang)('w.strayHole', { part: part.name, d: translator(model.lang).num(f.d), sheet: sheet.index }));
    }
  }
  return out;
}

// Why the CNC files must not be made: an error from the checks of the model (a hole outside its part or too near an
// edge, a groove or another hole, a part larger than the sheet, a contour deeper than the cutter's cutting length, a
// door outside the hinge maker's table…), a part the nesting could not place, a hole that would land outside its part
// on the sheet, a groove the groove mill cannot cut. G-code and DXF are never written while one of these stands.
export function cncBlockers(model, nesting) {
  const out = model.warnings.filter((w) => w.level === 'error').map((w) => w.text);
  out.push(...nesting.errors);
  for (const sheet of nesting.sheets) out.push(...sheetFaults(model, sheet));
  return [...new Set(out)];
}

// Feature positions on the sheet. Refuses a model with a blocker: no caller can turn it into machine code.
export function sheetOps(model, sheet) {
  const blockers = cncBlockers(model, { sheets: [sheet], errors: [] });
  if (blockers.length) throw new Error(`CNC blocked: ${blockers[0]}`);
  const T = STOCK[sheet.stock].thickness;
  const byId = new Map(model.parts.map((p) => [p.id, p]));
  const holes = new Map();
  const manual = [];
  const grooves = [];
  const contours = [];
  for (const pl of sheet.placements) {
    const part = byId.get(pl.partId);
    const map = placer(part, pl, model.spec.bandCompensation);
    for (const f of part.features) {
      if (f.type === 'hole') {
        const [X, Y] = map(f.u, f.v);
        // a through hole goes THROUGH_EXTRA below the sheet; a blind one keeps its depth (one deeper than T − MIN_WEB
        // is an error of the model, so it never gets here)
        const through = Boolean(f.through);
        const op = { X, Y, d: f.d, depth: through ? r1(Math.min(f.depth, T + THROUGH_EXTRA)) : f.depth, through, partId: part.id, kind: f.kind };
        const tool = drillFor(f.d);
        if (!tool) manual.push(op);
        else {
          if (!holes.has(tool.id)) holes.set(tool.id, []);
          holes.get(tool.id).push(op);
        }
      } else if (f.type === 'groove') {
        const [X1, Y1] = map(f.u1, f.v1);
        const [X2, Y2] = map(f.u2, f.v2);
        grooves.push({ X1, Y1, X2, Y2, w: f.w, depth: f.depth, partId: part.id });
      }
    }
    contours.push({ partId: part.id, name: part.name, x: pl.x, y: pl.y, w: pl.w, h: pl.h, area: pl.w * pl.h });
  }
  const drillOps = DRILLS.filter((t) => holes.has(t.id)).map((t) => ({ tool: t, holes: nearestNeighbour(holes.get(t.id)) }));
  contours.sort((a, b) => a.area - b.area); // small parts first, while the sheet still holds them
  return { T, drillOps, manual, grooves, contours };
}

function nearestNeighbour(points) {
  const left = [...points];
  const out = [];
  let cur = { X: 0, Y: 0 };
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = (left[i].X - cur.X) ** 2 + (left[i].Y - cur.Y) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    cur = left.splice(bi, 1)[0];
    out.push(cur);
  }
  return out;
}

// Tool-centre path of an outside profile: rectangle offset by r, clockwise (climb milling with an M3 spindle).
export function profilePath(c, r) {
  const [x0, y0, x1, y1] = [c.x, c.y, c.x + c.w, c.y + c.h];
  return [
    { kind: 'line', from: [x0 - r, y0], to: [x0 - r, y1] },
    { kind: 'arcCW', from: [x0 - r, y1], to: [x0, y1 + r], center: [x0, y1] },
    { kind: 'line', from: [x0, y1 + r], to: [x1, y1 + r] },
    { kind: 'arcCW', from: [x1, y1 + r], to: [x1 + r, y1], center: [x1, y1] },
    { kind: 'line', from: [x1 + r, y1], to: [x1 + r, y0] },
    { kind: 'arcCW', from: [x1 + r, y0], to: [x1, y0 - r], center: [x1, y0] },
    { kind: 'line', from: [x1, y0 - r], to: [x0, y0 - r] },
    { kind: 'arcCW', from: [x0, y0 - r], to: [x0 - r, y0], center: [x0, y0] },
  ];
}

export const num = (v) => {
  const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/0+$/, '');
  return s === '-0.' ? '0.' : s;
};
