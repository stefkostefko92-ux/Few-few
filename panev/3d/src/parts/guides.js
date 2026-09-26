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

// SG 225 50 (p. 61): 5 mm guide plate 225 x 50 for the rail with its long slot, and one lower part
// folded off its whole bottom edge: 30 mm deep along the plate, 150 mm at the arm (x 50-95) that
// rests on the support (length "A" to the customer's drawing). The Ø12 hole and the arm's two
// slots sit on the arm's centre line, 20, 80 and 130 mm from the plate: the hole in the 30 mm
// strip, the slots further back, running across the arm, parallel to the plate, to cross the
// lengthwise slots of the SC 50 170. The drawing shows the arm on the top edge and the hole in
// the plate: the model follows the real part as the owner described it.
export function guideCustom() {
  const p = sheet({ t: 5, bevel: 0.6 });
  p.face('plate', { outline: rect(0, 0, 225, 50), holes: [slotX(90, 212, 25, 12)] });
  p.face('base', {
    outline: [[0, 0], [225, 0], [225, 30], [95, 30], [95, 150], [50, 150], [50, 30], [0, 30]],
    holes: [circle(72.5, 20, 12), slotX(59, 86, 80, 12), slotX(59, 86, 130, 12)],
  });
  p.bend('plate', 'base', { from: [0, 0], to: [225, 0], dir: 'up' });
  return p;
}
