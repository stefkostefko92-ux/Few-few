// Wall-fixing pieces for the rigid-arm anchoring (section 06, p. 62): corner angle SN 60 65,
// square bracket SN 65 200 and the flat arm BRACCIO 160 190. Quoted to order; proportions follow
// the catalogue drawing.
import { sheet } from '../geo/part.js';
import { Path, rect, slotX, slotY, circle } from '../geo/path.js';

// SN 60 65: 5 mm angle, two 65 mm wings, 60 mm high, a horizontal Ø12 slot in each wing.
export function cornerSN() {
  const p = sheet({ t: 5, bevel: 0.6 });
  p.face('a', { outline: rect(0, 0, 65, 60), holes: [slotX(16, 52, 30, 12)] });
  p.face('b', { outline: rect(0, 0, 60, 65), holes: [slotY(30, 16, 52, 12)] });
  p.bend('a', 'b', { from: [0, 0], to: [0, 60], dir: 'up' });
  return p;
}

// SN 65 200: web 200 x 65 with a 65 mm wall plate folded back off its end and a 50 mm top flange
// folded forward along its upper edge (stopping short of the corner, with a relief).
export function squareSN() {
  const p = sheet({ t: 5, bevel: 0.6 });
  p.face('web', { outline: rect(0, 0, 200, 65), holes: [slotX(22, 62, 30, 12)] });
  p.face('wall', { outline: rect(0, 0, 65, 65), holes: [slotX(14, 51, 35, 12)] });
  p.face('top', { outline: rect(0, 0, 185, 50), holes: [slotX(20, 70, 25, 12), slotX(85, 135, 25, 12), slotX(150, 175, 25, 12)] });
  p.bend('web', 'wall', { from: [0, 0], to: [0, 65], dir: 'down' });
  p.bend('web', 'top', { from: [15, 65], to: [200, 65], dir: 'up' });
  return p;
}

// BRACCIO 160 190: flat 5 mm arm 190 x 30, rounded corners, bolt holes 160 mm apart.
export function armBraccio() {
  const p = sheet({ t: 5, bevel: 0.6 });
  const r = 4;
  const outline = new Path(r, 0)
    .to(190 - r, 0)
    .arcAround(190 - r, r, 0)
    .to(190, 30 - r)
    .arcAround(190 - r, 30 - r, Math.PI / 2)
    .to(r, 30)
    .arcAround(r, 30 - r, Math.PI)
    .to(0, r)
    .arcAround(r, r, (3 * Math.PI) / 2)
    .close();
  p.face('bar', { outline, holes: [circle(15, 15, 10.5), circle(175, 15, 10.5)] });
  return p;
}
