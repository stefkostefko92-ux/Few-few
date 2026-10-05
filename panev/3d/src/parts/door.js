// Landing-door brackets (section 01 of the catalogue): the vertical fixing bracket B (wall face
// 11 with anchor slots, stiffening rib 15 with the joint hole 19 and the locking slot 21) and the
// support plate A (platform 12 with the sill slots 18, rib 16 carrying the joint 20 and lock 22).
// Numbers follow the patent tables; dimensions are read off the catalogue drawings (pp. 14-18).
import { sheet } from '../geo/part.js';
import { Path, rect, slotX, slotY, circle } from '../geo/path.js';

// Rib 15 of B by section: full width down to `full` mm from the top, then a straight taper to
// `foot` at the bottom; joint hole `pivot` mm below the top, locking slot `drop` below that.
export const B_SECTIONS = {
  65: { t: 5, rib: 65, face: 65, full: 160, foot: 20, pivot: 20, col: 33.5, drop: 115, lock: 35, lockAt: 34 },
  45: { t: 5, rib: 45, face: 60, full: 138, foot: 15, pivot: 18, col: 23.5, drop: 95, lock: 26, lockAt: 25 },
  37: { t: 4, rib: 37, face: 60, full: 134, foot: 20, pivot: 16, col: 20, drop: 85, lock: 20, lockAt: 21 },
};

const ANCHOR = 12; // wall anchor slots
const BOLT = 10.5; // M10 joint and locking bolts

// B: root = fixing face 11 in (x across from the mould-line corner, y up the length).
export function bracketB(section, L) {
  const s = B_SECTIONS[section];
  const p = sheet({ t: s.t, bevel: s.t >= 5 ? 0.6 : 0.5 });
  const cx = s.face / 2;
  const open = L >= 300 ? 95 : 50; // open anchor slot from the bottom edge up to here
  const hw = ANCHOR / 2;
  const fixing = new Path(0, 0)
    .to(cx - hw, 0)
    .to(cx - hw, open - hw)
    .arcAround(cx, open - hw, 0)
    .to(cx + hw, 0)
    .to(s.face, 0)
    .to(s.face, L)
    .to(0, L)
    .close();
  p.face('fixing', { outline: fixing, holes: [slotY(cx, L - 160, L - 30, ANCHOR)] });
  // Rib 15 in (x up the length from the bottom, y out from the mould line).
  const rib = new Path(0, 0).to(L, 0).to(L, s.rib).to(L - s.full, s.rib).to(0, s.foot).close();
  const pivotX = L - s.pivot;
  const lockX = pivotX - s.drop;
  p.face('rib', {
    outline: rib,
    holes: [circle(pivotX, s.col, BOLT), slotY(lockX, s.lockAt - s.lock / 2, s.lockAt + s.lock / 2, BOLT)],
  });
  p.bend('fixing', 'rib', { from: [0, 0], to: [0, L], dir: 'up' });
  return p;
}

// Rib 16 profiles of A (x from the wall end along the platform, y down from the mould line):
// strip along the platform, chamfer, then the leg bolted to rib 15 of B.
export const A_LEGS = {
  65: { t: 5, strip: 30, chamfer: [80, 50, 60], legIn: [50, 165], legOut: [10, 165], holes: [[30, 33, 22], [30, 149, 22]] },
  45: { t: 5, strip: 29, chamfer: [64, 40, 69], legIn: [29, 140], legOut: [8, 140], holes: [[19, 31, 0], [19, 125, 14]] },
  37: { t: 4, strip: 25, chamfer: [49, 28, 69], legIn: [27, 120], legOut: [4, 120], holes: [[15, 25, 0], [15, 110, 14]] },
};

// A: root = platform 12 in (x from the wall end, y across from the rib's mould line).
// slots: 'cross' = transverse sill slots at a 23 mm pitch, 'long' = two slots along the platform.
export function plateA(section, length, width, slots, count = 7) {
  const g = A_LEGS[section];
  const p = sheet({ t: g.t, bevel: g.t >= 5 ? 0.6 : 0.5 });
  const holes = [];
  if (slots === 'cross') {
    const pitch = 23;
    const first = (length - (count - 1) * pitch) / 2;
    for (let i = 0; i < count; i++) holes.push(slotY(first + i * pitch, 12, width - 12, 10));
  } else {
    const len = 70;
    const gap = 12;
    const x0 = (length - 2 * len - gap) / 2;
    holes.push(slotX(x0, x0 + len, width / 2, 10), slotX(x0 + len + gap, x0 + 2 * len + gap, width / 2, 10));
  }
  p.face('platform', { outline: rect(0, 0, length, width), holes });
  const [cx0, cx1, cy1] = g.chamfer;
  const rib = new Path(0, 0)
    .to(length, 0)
    .to(length, g.strip)
    .to(cx0, g.strip)
    .to(cx1, cy1)
    .to(...g.legIn)
    .to(...g.legOut)
    .to(0, 12)
    .close();
  const legHoles = g.holes.map(([x, y, l]) => (l > 0 ? slotX(x - l / 2, x + l / 2, y, BOLT) : circle(x, y, BOLT)));
  p.face('rib', { outline: rib, holes: legHoles });
  p.bend('platform', 'rib', { from: [0, 0], to: [length, 0], dir: 'down' });
  return p;
}
