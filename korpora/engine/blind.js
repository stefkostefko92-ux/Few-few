// The blind front of a corner cabinet (kitchen.js): a fixed front over the part of the cabinet the side wall stands in
// front of — the front board, banded all round like a door, never opened. Three plastic corner brackets hold it from
// inside (наш избор: no special hardware): two on the bottom, one under the top or the front rail. The places of their
// screws are marked on its back and drilled on site, after the cabinet is assembled.
import { panel, mark } from './panel.js';
import { FRONT_GAP_Z } from './joinery.js';

const BRACKET_UP = 15; // the bracket's screw into the front, above the bottom or below the top (наш избор)

// a: the column, its front zone (dy0, dy1) and the front material from buildCarcass; col.blind = { side, width } is the
// side of the column the blind front covers and how wide, from the outer edge of the carcass. Returns the span left
// to the doors.
export function blindFront(ctx, a) {
  const { col, fl, fr, dy0, dy1, gap, zEnd, fs, frontGrain, bf, fT, nm, key, mod, c, T, yTop } = a;
  const left = col.blind.side === 'left';
  const x0 = left ? fl + gap / 2 : fr - col.blind.width + gap / 2;
  const x1 = left ? fl + col.blind.width - gap / 2 : fr - gap / 2;
  const zD = zEnd + FRONT_GAP_Z;
  const blind = panel(ctx, {
    stock: fs.stock, decor: fs.decor, grain: frontGrain, module: mod, key: key('blind'), name: nm(ctx.t('part.blind')), role: 'blind',
    box: { min: [x0, dy0, zD], max: [x1, dy1, zD + fT] }, n: '-z', L: 'y',
    bands: bf ? { '+x': bf, '-x': bf, '+y': bf, '-y': bf } : {}, explode: [left ? -0.3 : 0.3, 0, 1.8],
  });
  const pts = [[x0 + (x1 - x0) / 4, c + T + BRACKET_UP], [x0 + (3 * (x1 - x0)) / 4, c + T + BRACKET_UP], [(x0 + x1) / 2, yTop - BRACKET_UP]];
  for (const [x, y] of pts) mark(blind, [x, y, zD], 'blind-fix', { hw: 'blindBracket', label: ctx.t('lbl.blindBracket') });
  ctx.hw('blindBrackets', { name: ctx.t('hw.blindBrackets'), qty: pts.length, unit: ctx.t('u.pcs'), group: ctx.t('g.hardware') });
  return left ? { fl: fl + col.blind.width, fr } : { fl, fr: fr - col.blind.width };
}
