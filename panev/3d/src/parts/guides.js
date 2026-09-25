// Guide junction brackets SG (sections 02-05) and the made-to-drawing SG 225 50 (section 06).
// SG W L: 4 mm angle, plate W wide on the support, flange 50 mm high carrying the guide rail.
// Root face = plate in (x along the length, y from the flange's mould line to the free edge).
import { sheet } from '../geo/part.js';
import { rect, slotX, slotY, circle } from '../geo/path.js';

// Transverse Ø10 slot stations on the plate: 20 mm pitch from 15 mm in at each end, as counted
// on the dimension tables (pp. 57-59) and plans.
export const STATIONS = {
  130: [15, 35, 55, 75, 95, 115],
  150: [15, 35, 55, 95, 115, 135],
  170: [15, 35, 55, 85, 115, 135, 155],
  190: [15, 35, 55, 75, 115, 135, 155, 175],
  220: [15, 35, 55, 75, 110, 145, 165, 185, 205],
};
export const SG_FLANGE = 50;

// Flange slots 10 mm in from each end, 8 mm webs: two equal slots up to 150 mm, from 170 mm a
// 73 mm middle slot between two shorter ones.
function flangeRuns(L) {
  if (L <= 150) {
    const s = (L - 28) / 2;
    return [[10, 10 + s], [18 + s, L - 10]];
  }
  const sh = (L - 109) / 2;
  return [[10, 10 + sh], [18 + sh, 91 + sh], [99 + sh, L - 10]];
}

export function guideSG(W, L) {
  const p = sheet({ t: 4, bevel: 0.5 });
  const y1 = W - (W >= 80 ? 10 : 5);
  p.face('plate', { outline: rect(0, 0, L, W), holes: STATIONS[L].map((x) => slotY(x, 20, y1, 10)) });
  p.face('flange', { outline: rect(0, 0, L, SG_FLANGE), holes: flangeRuns(L).map(([a, b]) => slotX(a, b, SG_FLANGE / 2, 10)) });
  p.bend('plate', 'flange', { from: [0, 0], to: [L, 0], dir: 'up' });
  return p;
}

// SG 225 50: 5 mm guide plate 225 x 50 for the rail, a 150 mm arm folded off its top edge onto the
// support (length "A" to the customer's drawing) and a 30 mm lip at the foot of the far end.
export function guideCustom() {
  const p = sheet({ t: 5, bevel: 0.6 });
  p.face('plate', { outline: rect(0, 0, 225, 50), holes: [circle(38, 25, 12), slotX(90, 212, 25, 12)] });
  p.face('arm', { outline: rect(0, 0, 45, 150), holes: [slotY(22.5, 25, 75, 12), slotY(22.5, 90, 140, 12)] });
  p.face('lip', { outline: rect(0, 0, 50, 30) });
  p.bend('plate', 'arm', { from: [50, 50], to: [95, 50], dir: 'up' });
  p.bend('plate', 'lip', { from: [175, 0], to: [225, 0], dir: 'up' });
  return p;
}
