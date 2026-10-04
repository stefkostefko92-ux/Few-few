// The Panev brackets the 3D installation fits, from the 2026 catalogue (docs/catalogo-staffe-panev-2026.pdf, the page of
// each in its comment), as sheet-metal parts. Landing-door brackets: the vertical fixing bracket B (wall face with its
// anchor slots, stiffening rib with the joint hole and the locking slot) and the support plate A under the sill
// (platform with the sill slots, rib with the joint and the lock), A cut to the sill's depth as the catalogue allows.
// Counterweight-guide supports SU (universal), SD (offset) and SC (sliding), and the SG guide bracket that carries the
// rail on them. Ported from Panev's 3D catalogue (panev/3d/src/parts); the products share no code. Millimetres.
// Loaded only through boot.ts (lazy).
// Motion: none, static geometry; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import { sheet, type Sheet } from './part';
import { Path, circle, rect, slotX, slotY, type Loop } from './path';
import { PLATES, SG_FLANGE, SG_SLOT, SG_T, STATIONS, SUPPORT_H, flangeRuns, type ArmKind, type SgLength } from '@/shaft/staffe';
import { SC_RUNS } from '@/shaft/staffe-sc';
import { A_LEGS, B_SECTIONS, type DoorSection as Section } from '@/shaft/staffe-porte';

export { A_LEGS, B_SECTIONS };

export { PLATES, SG_FLANGE, SG_SLOT, SG_T, STATIONS, SUPPORT_H, flangeRuns, type ArmKind, type SgLength };

const ANCHOR = 12; // wall anchor slots
const BOLT = 10.5; // M10 joint and locking bolts

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

const APRON = 30; // the stiffening flange folded down along the SU/SD arm's straight side (pp. 20-38)

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

/** SG W L — 4 mm angle: root = the plate (x along the length, y from the flange's mould line to the free edge). */
export function guideSG(W: 50 | 60 | 80, L: SgLength): Sheet {
  const p = sheet({ t: SG_T }), y1 = W - (W >= 80 ? 10 : 5);
  p.face('plate', { outline: rect(0, 0, L, W), holes: STATIONS[L].map((x) => slotY(x, 20, y1, 10)) });
  p.face('flange', { outline: rect(0, 0, L, SG_FLANGE), holes: flangeRuns(L).map(([a, b]) => slotX(a, b, SG_FLANGE / 2, SG_SLOT)) });
  p.bend('plate', 'flange', { from: [0, 0], to: [L, 0], dir: 'up' });
  return p;
}
