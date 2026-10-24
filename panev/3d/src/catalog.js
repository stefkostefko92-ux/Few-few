// Every article of the 2026 catalogue (docs/catalogo-staffe-panev-2026.pdf) with the builder of
// its sheet-metal model. Codes, thicknesses, sizes and pages as printed; `size` is the catalogue's
// own description of the part.
import { bracketB, plateA } from './parts/door.js';
import { supportArm, supportSliding } from './parts/supports.js';
import { guideSG, guideCustom } from './parts/guides.js';
import { cornerSN, squareSN, armBraccio } from './parts/special.js';

export const FAMILIES = ['door', 'SU', 'SD', 'SC', 'SG', 'special'];

// How each part is presented, as in its catalogue drawing: root-face frame (Y up), whether the
// drawn hand (DX) is the mirror of the model as built, and the direction the camera looks from.
const WALL = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const PLATFORM = { o: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] };
const FLAT = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] };
export const VIEWS = {
  A: { frame: PLATFORM, mirror: true, dir: [1, 1, -1] },
  B: { frame: WALL, mirror: true, dir: [1, 1, -1] },
  support: { frame: WALL, mirror: true, dir: [-1, 1, -1] },
  SG: { frame: FLAT, mirror: false, dir: [-1, 1, 1] },
  corner: { frame: WALL, mirror: false, dir: [1, 1, 1] },
  square: { frame: WALL, mirror: false, dir: [-1, 1, 1] },
  bar: { frame: FLAT, mirror: false, dir: [-1, 1, 1] },
  // SG 225 50: from the side of its lower part, so the hole and both arm slots show (the drawing
  // on p. 61 has the arm on top, see guides.js).
  guide: { frame: WALL, mirror: true, dir: [-1, 1.25, 1] },
};

const items = [];
const add = (code, family, page, t, size, build, view) => items.push({ code, id: code.replace(/\s+/g, '-'), family, page, t, size, build, view: VIEWS[view] });

// Section 01 — landing-door brackets (pp. 14-18).
add('A 65 170 7', 'door', 14, 5, '170 × 75', () => plateA(65, 170, 75, 'cross', 7), 'A');
add('A 45 170 7', 'door', 15, 5, '170 × 70', () => plateA(45, 170, 70, 'cross', 7), 'A');
add('A 45 175 2', 'door', 16, 5, '175 × 60', () => plateA(45, 175, 60, 'long'), 'A');
add('A 37 150 7', 'door', 17, 4, '150 × 70', () => plateA(37, 150, 70, 'cross', 6), 'A');
add('A 37 170 2', 'door', 18, 4, '170 × 60', () => plateA(37, 170, 60, 'long'), 'A');
for (const [s, t, face, page] of [[65, 5, 65, 14], [45, 5, 60, 15], [37, 4, 60, 17]]) {
  for (const L of [320, 220]) add(`B ${s} ${L}`, 'door', page, t, `${L} × ${s} × ${face}`, () => bracketB(s, L), 'B');
}

// Sections 02-03 — SU and SD supports (5 mm).
for (const Lp of [160, 180, 200]) add(`SU 220 ${Lp}`, 'SU', 20 + (Lp - 160) / 10, 5, `220 × ${Lp}`, () => supportArm('SU', Lp), 'support');
for (const B of [150, 220]) {
  for (const Lp of [160, 180, 200]) add(`SD ${B} ${Lp}`, 'SD', (B === 150 ? 27 : 33) + (Lp - 160) / 10, 5, `${B} × ${Lp}`, () => supportArm(`SD${B}`, Lp), 'support');
}

// Section 04 — SC sliding supports (4 mm), plus the SC 50 170 of section 06.
for (const L of [200, 220]) {
  for (const W of [50, 60, 80, 90]) add(`SC ${W} ${L}`, 'SC', (L === 200 ? 40 : 48) + [50, 60, 80, 90].indexOf(W) * 2, 4, `${W} × ${L}`, () => supportSliding(W, L), 'support');
}
add('SC 50 170', 'SC', 61, 4, '50 × 170', () => supportSliding(50, 170), 'support');

// Section 05 — SG guide junction brackets (4 mm), plus the SG 225 50 of section 06 (5 mm).
for (const W of [50, 60, 80]) {
  for (const L of [130, 150, 170, 190, 220]) add(`SG ${W} ${L}`, 'SG', L <= 150 ? 57 : L <= 190 ? 58 : 59, 4, `${W} × ${L}`, () => guideSG(W, L), 'SG');
}
add('SG 225 50', 'SG', 61, 5, '150 + 30', () => guideCustom(), 'guide');

// Section 06 — rigid-arm wall fixing (p. 62).
add('SN 60 65', 'special', 62, 5, '65 × 65 × 60', () => cornerSN(), 'corner');
add('SN 65 200', 'special', 62, 5, '65 × 200 × 50', () => squareSN(), 'square');
add('BRACCIO 160 190', 'special', 62, 5, '190', () => armBraccio(), 'bar');

export const CATALOG = items;
export const byId = (id) => items.find((i) => i.id === id || i.code === id);
