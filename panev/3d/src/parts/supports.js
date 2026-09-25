// Counterweight-guide supports (sections 02-04): SU (universal), SD (offset) and SC (sliding).
// Each is a wall flange 65 mm high with the plate folded off its top edge into the shaft.
// Plate outlines come from the dimensioned assembly plans (pp. 21-55), flange slots from the
// isometric drawings. Root face = wall flange in (x along the wall, y up to the mould line at 65).
import { sheet } from '../geo/part.js';
import { rect, slotX, slotY, circle } from '../geo/path.js';

const H = 65; // flange height to the plate's top surface
const ANCHOR = 12;

// Plate outlines in (x along the wall, y out from the wall), arm last. Lp = arm length.
const PLATES = {
  SU: { flange: 220, span: 220, arm: [160, 220], outline: (Lp) => [[0, 0], [0, 20], [130, 50], [160, 110], [160, Lp], [220, Lp], [220, 0]], slots: [[11, 83], [95, 193]] },
  SD150: { flange: 150, span: 90, arm: [30, 90], outline: (Lp) => [[0, 0], [0, 30], [30, 110], [30, Lp], [90, Lp], [90, 0]], slots: [[10, 61], [105, 145]] },
  SD220: { flange: 220, span: 160, arm: [100, 160], outline: (Lp) => [[0, 0], [0, 30], [70, 50], [100, 110], [100, Lp], [160, Lp], [160, 0]], slots: [[11, 83], [161, 215]] },
};

// SU 220 Lp, SD 150 Lp, SD 220 Lp — 5 mm plate.
export function supportArm(kind, Lp) {
  const k = PLATES[kind];
  const p = sheet({ t: 5, bevel: 0.6 });
  const flangeSlots = k.slots.map(([x0, x1]) => slotX(x0, x1, H / 2, ANCHOR));
  p.face('flange', { outline: rect(0, 0, k.flange, H), holes: flangeSlots });
  const xc = (k.arm[0] + k.arm[1]) / 2;
  const mid = (Lp + 15) / 2;
  p.face('plate', { outline: k.outline(Lp), holes: [slotY(xc, 25, mid - 5, 10), slotY(xc, mid + 5, Lp - 10, 10)] });
  p.bend('flange', 'plate', { from: [0, H], to: [k.span, H], dir: 'up' });
  return p;
}

// Slot runs along the length, as measured on the 200 and 220 mm parts (and the 170 special).
const SC_RUNS = {
  170: { plate: [[11, 50], [65, 105], [120, 159]], flange: [[10, 75], [95, 160]] },
  200: { plate: [[11, 61], [70, 130], [139, 189]], flange: [[10, 90], [110, 190]] },
  220: { plate: [[11, 70], [80, 140], [150, 209]], flange: [[10, 100], [120, 210]] },
};

// SC W L — 4 mm. W = plate depth from the wall (50/60: one row of Ø12 slots; 80/90: a row of
// Ø10 holes and two rows of Ø10 slots, all referenced from the free edge).
export function supportSliding(W, L) {
  const runs = SC_RUNS[L];
  const p = sheet({ t: 4, bevel: 0.5 });
  p.face('flange', { outline: rect(0, 0, L, H), holes: runs.flange.map(([a, b]) => slotX(a, b, H / 2, ANCHOR)) });
  const holes = [];
  if (W <= 60) {
    for (const [a, b] of runs.plate) holes.push(slotX(a, b, W - 22, 12));
  } else {
    for (const x of [15, 30, L / 2, L - 30, L - 15]) holes.push(circle(x, W - 56, 10));
    for (const y of [W - 35, W - 15.5]) for (const [a, b] of runs.plate) holes.push(slotX(a, b, y, 10));
  }
  p.face('plate', { outline: rect(0, 0, L, W), holes });
  p.bend('flange', 'plate', { from: [0, H], to: [L, H], dir: 'up' });
  return p;
}

export const SUPPORT_H = H;

// Arm (x range along the wall, length out from it) of an SU/SD code, and the SC plate size, for
// placing the guide bracket in the assembly view.
export function armOf(code) {
  const [fam, a, b] = code.split(' ');
  if (fam === 'SC') return { kind: 'SC', L: Number(b), W: Number(a) };
  const k = PLATES[fam === 'SU' ? 'SU' : `SD${a}`];
  return { kind: fam, x0: k.arm[0], x1: k.arm[1], Lp: Number(b), flange: k.flange };
}
