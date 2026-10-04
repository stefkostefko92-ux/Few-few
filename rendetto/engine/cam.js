// CNC operations for one nested sheet and the G-code posts. Tools come from a demo machine profile (fixed tool
// numbers per drill diameter); a real installation reads them from the machine's tool library.
import { cutSize, THROUGH_EXTRA } from './panel.js';
import { STOCK } from './materials.js';
import { r1, asciiName, dimTxt } from './util.js';

const DRILL_SET = [[1, 5], [2, 7], [3, 35], [6, 8], [7, 3], [8, 10], [9, 15], [10, 20], [11, 26], [12, 12], [13, 6], [14, 4.5], [15, 4], [16, 25], [17, 30], [18, 40]];
export const DRILLS = DRILL_SET.map(([h, d]) => ({
  id: `T${h}`, h, kind: 'drill', d,
  rpm: d <= 10 ? 6000 : d <= 20 ? 5000 : 4000,
  feed: d <= 10 ? 2000 : d <= 20 ? 1500 : 1200,
  label: d >= 15 ? `BORING BIT D${d}` : `DRILL D${d}`,
}));
export const GROOVE_MILL = { id: 'T4', h: 4, kind: 'mill', d: 4, rpm: 18000, flutes: 2, fz: 0.08, plunge: 1000, label: 'MILL D4' };
export const CONTOUR_MILL = { id: 'T5', h: 5, kind: 'mill', rpm: 18000, flutes: 2, fz: 0.25, plunge: 3000 };
export const SPOIL = 0.3; // final contour depth below the sheet, mm
export const ONION = 0.3; // skin left by the first contour pass, mm
export const drillFor = (d) => DRILLS.find((t) => Math.abs(t.d - d) < 0.01) ?? null;
export const contourTool = (d) => ({ ...CONTOUR_MILL, d, label: `COMPRESSION D${d}` });

export const POSTS = {
  iso: { id: 'iso', name: 'ISO / Fanuc-стил (G81, G43, смяна T…M6)', version: 'iso-2.1' },
  grbl: { id: 'grbl', name: 'GRBL (хоби, ръчна смяна на инструмента)', version: 'grbl-2.1' },
};

// Finished-part (u, v) → cut-part offset (edge band) → placement on the sheet (with rotation).
function placer(part, pl, compensate) {
  const cut = cutSize(part, compensate);
  return (u, v) => {
    const uc = u - cut.du0;
    const vc = v - cut.dv0;
    return pl.rot ? [r1(pl.x + cut.W - vc), r1(pl.y + uc)] : [r1(pl.x + uc), r1(pl.y + vc)];
  };
}

// Holes whose circle would leave the cut contour of their part on this sheet.
function strayHoles(model, sheet) {
  const out = [];
  const byId = new Map(model.parts.map((p) => [p.id, p]));
  for (const pl of sheet.placements) {
    const part = byId.get(pl.partId);
    const map = placer(part, pl, model.spec.bandCompensation);
    for (const f of part.features) {
      if (f.type !== 'hole') continue;
      const [X, Y] = map(f.u, f.v);
      const r = f.d / 2 - 0.05;
      if (X - r < pl.x || X + r > pl.x + pl.w || Y - r < pl.y || Y + r > pl.y + pl.h) out.push(`${part.name}: отвор Ø${dimTxt(f.d)} би излязъл извън детайла на лист ${sheet.index}.`);
    }
  }
  return out;
}

// Why the CNC files must not be made: an error from the checks of the model (a hole outside its part, a part larger
// than the sheet, a door outside the hinge maker's table…), a part the nesting could not place, a hole that would land
// outside its part on the sheet. G-code and DXF are never written while one of these stands.
export function cncBlockers(model, nesting) {
  const out = model.warnings.filter((w) => w.level === 'error').map((w) => w.text);
  out.push(...nesting.errors);
  for (const sheet of nesting.sheets) out.push(...strayHoles(model, sheet));
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
        const op = { X, Y, d: f.d, depth: r1(Math.min(f.depth, T + THROUGH_EXTRA)), partId: part.id, kind: f.kind };
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

export function toGcode(model, sheet, meta) {
  const post = POSTS[model.spec.post];
  const ops = sheetOps(model, sheet);
  const { T } = ops;
  const safe = 20;
  const clear = 3;
  const iso = post.id === 'iso';
  const L = [];
  const moves = [];
  let pos = { X: 0, Y: 0, Z: 50 };
  let curF = 0;
  const words = (X, Y, Z) => [X !== undefined && `X${num(X)}`, Y !== undefined && `Y${num(Y)}`, Z !== undefined && `Z${num(Z)}`].filter(Boolean);
  const go = (type, X, Y, Z, F, tool) => {
    const w = words(X, Y, Z);
    if (F !== undefined) {
      w.push(`F${Math.round(F)}`);
      curF = F;
    }
    L.push(`${type === 'rapid' ? 'G0' : 'G1'} ${w.join(' ')}`);
    const nxt = { X: X ?? pos.X, Y: Y ?? pos.Y, Z: Z ?? pos.Z };
    moves.push({ type, from: pos, to: nxt, tool, F: curF });
    pos = nxt;
  };
  const rapid = (X, Y, Z) => go('rapid', X, Y, Z);
  const feed = (X, Y, Z, F, tool) => go('feed', X, Y, Z, F, tool);
  const arc = (seg, Z, tool) => {
    const [fx, fy] = seg.from;
    const [tx, ty] = seg.to;
    L.push(`G2 X${num(tx)} Y${num(ty)} I${num(seg.center[0] - fx)} J${num(seg.center[1] - fy)}`);
    const nxt = { X: tx, Y: ty, Z };
    moves.push({ type: 'arc', from: pos, to: nxt, center: seg.center, tool, F: curF });
    pos = nxt;
  };
  const title = `${asciiName(meta.product)} - SHEET ${sheet.index}/${meta.sheetCount}`;
  if (iso) L.push('%', `O${String(1000 + sheet.index)} (${title})`);
  else L.push(`(${title})`);
  L.push(`(SPEC SHA256 ${meta.hash.slice(0, 16)} - POST ${post.version})`);
  L.push(`(STOCK ${sheet.stock.toUpperCase()} ${sheet.w}X${sheet.h}X${T} - Z0 TOP OF SHEET - XY0 LOWER LEFT)`);
  L.push('(SIMULATE AND DRY RUN BEFORE CUTTING)');
  if (ops.manual.length) L.push(`(${ops.manual.length} HOLES WITHOUT A TOOL IN THE LIBRARY - DRILL BY HAND)`);
  L.push(iso ? 'G21 G17 G90 G94 G40 G49 G80' : 'G21 G17 G90 G94');
  if (iso) L.push('G54');
  const startTool = (tool, note) => {
    L.push(`(${tool.id} ${tool.label}${note ? ` - ${note}` : ''})`);
    if (iso) {
      // Z to the machine's reference point before the change, then the length offset of the new tool
      // G0 on the G43 line: the first approach must not depend on the control's power-on motion mode
      L.push('G91 G28 Z0', 'G90', `${tool.id} M6`, `S${tool.rpm} M3`, `G0 G43 H${tool.h} Z${num(safe)}`);
      pos = { ...pos, Z: safe };
    } else {
      // the bit was just touched off on the sheet top: lift to safe Z before the spindle starts
      L.push('M5', `(INSERT ${tool.label} AND SET Z0 ON SHEET TOP, THEN RESUME)`, 'M0');
      rapid(undefined, undefined, safe);
      L.push(`S${tool.rpm} M3`, 'G4 P2');
    }
  };
  const endTool = () => {
    rapid(undefined, undefined, safe);
    L.push('M5');
  };

  for (const { tool, holes } of ops.drillOps) {
    startTool(tool, `${holes.length} HOLES`);
    if (iso) {
      // canned cycle; the depth differs per hole, so Z and R are on every line
      holes.forEach((h, i) => {
        moves.push({ type: 'rapid', from: pos, to: { X: h.X, Y: h.Y, Z: safe } }, { type: 'drill', at: [h.X, h.Y], depth: h.depth, tool: tool.id });
        pos = { X: h.X, Y: h.Y, Z: safe };
        L.push(`${i === 0 ? 'G98 G81 ' : ''}X${num(h.X)} Y${num(h.Y)} Z${num(-h.depth)} R${num(clear)}${i === 0 ? ` F${tool.feed}` : ''}`);
      });
      L.push('G80');
    } else {
      for (const h of holes) {
        rapid(h.X, h.Y);
        rapid(undefined, undefined, clear);
        feed(undefined, undefined, -h.depth, tool.feed, tool.id);
        moves.push({ type: 'drill', at: [h.X, h.Y], depth: h.depth, tool: tool.id });
        rapid(undefined, undefined, clear);
      }
    }
    endTool();
  }

  if (ops.grooves.length) {
    const tool = GROOVE_MILL;
    const F = tool.rpm * tool.flutes * tool.fz;
    startTool(tool, `${ops.grooves.length} GROOVES`);
    for (const g of ops.grooves) {
      const passes = Math.ceil(g.depth / 4);
      rapid(g.X1, g.Y1);
      rapid(undefined, undefined, clear);
      let atStart = true;
      for (let k = 1; k <= passes; k++) {
        feed(undefined, undefined, -Math.min(g.depth, (g.depth * k) / passes), tool.plunge, tool.id);
        if (atStart) feed(g.X2, g.Y2, undefined, F, tool.id);
        else feed(g.X1, g.Y1, undefined, F, tool.id);
        atStart = !atStart;
      }
      rapid(undefined, undefined, clear);
    }
    endTool();
  }

  const tool = contourTool(model.spec.tool);
  const r = tool.d / 2;
  const Fc = tool.rpm * tool.flutes * tool.fz;
  const passes = model.spec.onion && T > 6 ? [-(T - ONION), -(T + SPOIL)] : [-(T + SPOIL)];
  startTool(tool, `${ops.contours.length} PROFILES${passes.length > 1 ? ' - ONION SKIN' : ''}`);
  passes.forEach((z, pi) => {
    L.push(`(PROFILE PASS ${pi + 1}/${passes.length} Z${num(z)})`);
    for (const c of ops.contours) {
      const path = profilePath(c, r);
      const first = path[0];
      L.push(`(${c.partId} ${asciiName(c.name)} ${dimTxt(c.w).replace(',', '.')}X${dimTxt(c.h).replace(',', '.')})`);
      rapid(first.from[0], first.from[1]);
      rapid(undefined, undefined, clear);
      const rampLen = Math.min(80, Math.abs(first.to[1] - first.from[1]));
      if (pi === 0) {
        feed(undefined, undefined, 0, tool.plunge, tool.id);
        feed(first.from[0], first.from[1] + rampLen, z, tool.plunge, tool.id); // ramp entry
      } else {
        feed(undefined, undefined, z, tool.plunge, tool.id);
      }
      feed(first.to[0], first.to[1], undefined, Fc, tool.id);
      for (const seg of path.slice(1)) {
        if (seg.kind === 'line') feed(seg.to[0], seg.to[1], undefined, undefined, tool.id);
        else arc(seg, z, tool.id);
      }
      if (pi === 0) feed(first.from[0], first.from[1] + rampLen, undefined, undefined, tool.id); // clean the ramp wedge
      rapid(undefined, undefined, clear);
    }
  });
  endTool();
  rapid(undefined, undefined, 50);
  L.push('M30');
  if (iso) L.push('%');
  const tools = [...ops.drillOps.map((o) => o.tool), ...(ops.grooves.length ? [GROOVE_MILL] : []), tool];
  return { text: `${L.join('\n')}\n`, moves, ops, post, tools, feedContour: Fc };
}
