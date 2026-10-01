// The Panev brackets the 3D installation fits, from the 2026 catalogue (docs/catalogo-staffe-panev-2026.pdf, the page of
// each in its comment), as sheet-metal parts. Landing-door brackets: the vertical fixing bracket B (wall face with its
// anchor slots, stiffening rib with the joint hole and the locking slot) and the support plate A under the sill
// (platform with the sill slots, rib with the joint and the lock), A cut to the sill's depth as the catalogue allows.
// Counterweight-guide supports SU (universal), SD (offset) and SC (sliding), and the SG guide bracket that carries the
// rail on them. Ported from Panev's 3D catalogue (panev/3d/src/parts); the products share no code. Millimetres.
import { sheet, type Sheet } from './part';
import { Path, circle, rect, slotX, slotY, type Loop, type V2 } from './path';

const ANCHOR = 12; // wall anchor slots
const BOLT = 10.5; // M10 joint and locking bolts

/** Rib 15 of B by section (pp. 14-18): full width down to `full` from the top, then a taper to `foot`; joint hole
 *  `pivot` below the top at `col` from the wall, locking slot `drop` below it. */
export const B_SECTIONS = {
  65: { t: 5, rib: 65, face: 65, full: 160, foot: 20, pivot: 20, col: 33.5, drop: 115, lock: 35, lockAt: 34 },
  45: { t: 5, rib: 45, face: 60, full: 138, foot: 15, pivot: 18, col: 23.5, drop: 95, lock: 26, lockAt: 25 },
  37: { t: 4, rib: 37, face: 60, full: 134, foot: 20, pivot: 16, col: 20, drop: 85, lock: 20, lockAt: 21 },
} as const;
export type Section = keyof typeof B_SECTIONS;

/** B section L: root = the fixing face (x across from the mould-line corner, y up the length). */
export function bracketB(section: Section, L: number): Sheet {
  const s = B_SECTIONS[section], p = sheet({ t: s.t }), cx = s.face / 2, hw = ANCHOR / 2;
  const open = L >= 300 ? 95 : 50; // the open anchor slot from the bottom edge up to here
  const fixing = new Path(0, 0).to(cx - hw, 0).to(cx - hw, open - hw).arcAround(cx, open - hw, 0).to(cx + hw, 0).to(s.face, 0).to(s.face, L).to(0, L).close();
  p.face('fixing', { outline: fixing, holes: [slotY(cx, L - 160, L - 30, ANCHOR)] });
  const rib = new Path(0, 0).to(L, 0).to(L, s.rib).to(L - s.full, s.rib).to(0, s.foot).close();
  const pivotX = L - s.pivot, lockX = pivotX - s.drop;
  p.face('rib', { outline: rib, holes: [circle(pivotX, s.col, BOLT), slotY(lockX, s.lockAt - s.lock / 2, s.lockAt + s.lock / 2, BOLT)] });
  p.bend('fixing', 'rib', { from: [0, 0], to: [0, L], dir: 'up' });
  return p;
}

/** Rib 16 of A (x from the wall end along the platform, y down from the mould line): strip, chamfer, the leg bolted
 *  to rib 15 of B; its holes [x, y, slot length] (pp. 14-18). */
export const A_LEGS = {
  65: { t: 5, strip: 30, chamfer: [80, 50, 60], legIn: [50, 165], legOut: [10, 165], holes: [[30, 33, 22], [30, 149, 22]] },
  45: { t: 5, strip: 29, chamfer: [64, 40, 69], legIn: [29, 140], legOut: [8, 140], holes: [[19, 31, 0], [19, 125, 14]] },
  37: { t: 4, strip: 25, chamfer: [49, 28, 69], legIn: [27, 120], legOut: [4, 120], holes: [[15, 25, 0], [15, 110, 14]] },
} as const;

/** The part of a polygon with x ≤ xs (one cut across it). */
function clipX(poly: Loop, xs: number): Loop {
  const out: Loop = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (p[0] <= xs) out.push(p);
    if ((p[0] - xs) * (q[0] - xs) < 0) out.push([xs, p[1] + ((xs - p[0]) / (q[0] - p[0])) * (q[1] - p[1])]);
  });
  return out;
}

/** A section length × width, root = the platform (x from the wall end, y across from the rib's mould line); 'cross':
 *  `count` sill slots across at a 23 mm pitch, 'long': two slots along. `cut`: the platform cut to that length. */
export function plateA(section: Section, length: number, width: number, slots: 'cross' | 'long', count = 7, cut = length): Sheet {
  const g = A_LEGS[section], p = sheet({ t: g.t }), L = Math.min(cut, length), holes: Loop[] = [];
  if (slots === 'cross') {
    const first = (length - (count - 1) * 23) / 2;
    for (let i = 0; i < count; i++) if (first + i * 23 + 5 <= L - 6) holes.push(slotY(first + i * 23, 12, width - 12, 10));
  } else {
    const x0 = (length - 2 * 70 - 12) / 2;
    for (const a of [x0, x0 + 82]) if (a + 70 <= L - 6) holes.push(slotX(a, a + 70, width / 2, 10));
  }
  p.face('platform', { outline: rect(0, 0, L, width), holes });
  const [cx0, cx1, cy1] = g.chamfer;
  const rib: Loop = [[0, 0], [length, 0], [length, g.strip], [cx0, g.strip], [cx1, cy1], [...g.legIn], [...g.legOut], [0, 12]];
  p.face('rib', { outline: clipX(rib, L), holes: g.holes.map(([x, y, l]) => (l > 0 ? slotX(x - l / 2, x + l / 2, y, BOLT) : circle(x, y, BOLT))) });
  p.bend('platform', 'rib', { from: [0, 0], to: [L, 0], dir: 'down' });
  return p;
}

// ---- counterweight-guide supports (sections 02-05): a wall flange 65 mm high, the plate folded off its top edge

export const SUPPORT_H = 65;
const APRON = 30; // the stiffening flange folded down along the SU/SD arm's straight side (pp. 20-38)

/** Plate outlines in (x along the wall, y out from it), the arm last (pp. 21-55); flange slots [x0, x1]. */
export const PLATES = {
  SU: { flange: 220, span: 220, arm: [160, 220], outline: (Lp: number): Loop => [[0, 0], [0, 20], [130, 50], [160, 110], [160, Lp], [220, Lp], [220, 0]], slots: [[11, 83], [95, 193]] },
  SD150: { flange: 150, span: 90, arm: [30, 90], outline: (Lp: number): Loop => [[0, 0], [0, 30], [30, 110], [30, Lp], [90, Lp], [90, 0]], slots: [[10, 61], [105, 145]] },
  SD220: { flange: 220, span: 160, arm: [100, 160], outline: (Lp: number): Loop => [[0, 0], [0, 30], [70, 50], [100, 110], [100, Lp], [160, Lp], [160, 0]], slots: [[11, 83], [161, 215]] },
} as const;
export type ArmKind = keyof typeof PLATES;

/** SU 220 Lp, SD 150 Lp, SD 220 Lp — 5 mm; root = the wall flange (x along the wall, y up to the plate at 65). */
export function supportArm(kind: ArmKind, Lp: number): Sheet {
  const k = PLATES[kind], t = 5, p = sheet({ t });
  p.face('flange', { outline: rect(0, 0, k.flange, SUPPORT_H), holes: k.slots.map(([x0, x1]) => slotX(x0, x1, SUPPORT_H / 2, ANCHOR)) });
  const xc = (k.arm[0] + k.arm[1]) / 2, mid = (Lp + 15) / 2;
  p.face('plate', { outline: k.outline(Lp), holes: [slotY(xc, 25, mid - 5, 10), slotY(xc, mid + 5, Lp - 10, 10)] });
  p.bend('flange', 'plate', { from: [0, SUPPORT_H], to: [k.span, SUPPORT_H], dir: 'up' });
  // the apron: a 1.5 mm tab and relief at the corner past the flange's bend, reaching back to 0.5 mm off the flange
  const sb = 2 * t, y0 = sb + 3, reach = y0 - t - 0.5, len = Lp - y0;
  p.face('apron', { outline: [[0, 0], [len, 0], [len, APRON], [-reach, APRON], [-reach, sb + 1], [0, sb + 1]] });
  p.bend('plate', 'apron', { from: [k.arm[1], y0], to: [k.arm[1], Lp], dir: 'up' });
  return p;
}

/** Slot runs along the SC plate and flange (pp. 40-55, 61). */
const SC_RUNS: Record<170 | 200 | 220, { plate: readonly V2[]; flange: readonly V2[] }> = {
  170: { plate: [[11, 50], [65, 105], [120, 159]], flange: [[10, 75], [95, 160]] },
  200: { plate: [[11, 61], [70, 130], [139, 189]], flange: [[10, 90], [110, 190]] },
  220: { plate: [[11, 70], [80, 140], [150, 209]], flange: [[10, 100], [120, 210]] },
};

/** SC W L — 4 mm; W the plate's depth from the wall. */
export function supportSliding(W: 50 | 60 | 80 | 90, L: 200 | 220): Sheet {
  const runs = SC_RUNS[L], p = sheet({ t: 4 }), holes: Loop[] = [];
  p.face('flange', { outline: rect(0, 0, L, SUPPORT_H), holes: runs.flange.map(([a, b]) => slotX(a, b, SUPPORT_H / 2, ANCHOR)) });
  if (W <= 60) for (const [a, b] of runs.plate) holes.push(slotX(a, b, W - 22, 12));
  else {
    for (const x of [15, 30, L / 2, L - 30, L - 15]) holes.push(circle(x, W - 56, 10));
    for (const y of [W - 35, W - 15.5]) for (const [a, b] of runs.plate) holes.push(slotX(a, b, y, 10));
  }
  p.face('plate', { outline: rect(0, 0, L, W), holes });
  p.bend('flange', 'plate', { from: [0, SUPPORT_H], to: [L, SUPPORT_H], dir: 'up' });
  return p;
}

/** SG W L (pp. 57-59): transverse Ø10 slot stations on the plate, 20 mm pitch from 15 mm in at each end. */
export const STATIONS: Record<130 | 150 | 170 | 190 | 220, readonly number[]> = {
  130: [15, 35, 55, 75, 95, 115],
  150: [15, 35, 55, 95, 115, 135],
  170: [15, 35, 55, 85, 115, 135, 155],
  190: [15, 35, 55, 75, 115, 135, 155, 175],
  220: [15, 35, 55, 75, 110, 145, 165, 185, 205],
};
export type SgLength = keyof typeof STATIONS;
export const SG_FLANGE = 50, SG_T = 4, SG_SLOT = 11; // the flange slots take the clips' M10 shanks

/** Flange slots 10 mm in from each end, 8 mm webs: two up to 150 mm, from 170 mm a 73 mm one between two shorter. */
export function flangeRuns(L: number): V2[] {
  if (L <= 150) {
    const s = (L - 28) / 2;
    return [[10, 10 + s], [18 + s, L - 10]];
  }
  const sh = (L - 109) / 2;
  return [[10, 10 + sh], [18 + sh, 91 + sh], [99 + sh, L - 10]];
}

/** SG W L — 4 mm angle: root = the plate (x along the length, y from the flange's mould line to the free edge). */
export function guideSG(W: 50 | 60 | 80, L: SgLength): Sheet {
  const p = sheet({ t: SG_T }), y1 = W - (W >= 80 ? 10 : 5);
  p.face('plate', { outline: rect(0, 0, L, W), holes: STATIONS[L].map((x) => slotY(x, 20, y1, 10)) });
  p.face('flange', { outline: rect(0, 0, L, SG_FLANGE), holes: flangeRuns(L).map(([a, b]) => slotX(a, b, SG_FLANGE / 2, SG_SLOT)) });
  p.bend('plate', 'flange', { from: [0, 0], to: [L, 0], dir: 'up' });
  return p;
}
