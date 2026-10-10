// The drum brake of a maker's machine as src/shaft/machine-detail.ts lays it out round the shape's drum, arms and
// magnet: the turned drum on the worm (it turns with it), on each side a lever pivoted at the bottom with its lined
// shoe on the drum, the tie rod through the levers' tops with the pressure springs, washers and nuts outside them, the
// release magnet between the tops with its plungers onto the levers, the hand release lever with its red knob. Our own
// design, sized by the machine. Metres, the machine's frame. Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { partBox } from '@/shaft/machine-shape';
import type { BrakeDetail } from '@/shaft/machine-detail';
import type { MachineMaterials } from '../materials';
import { V, cylX, cylZ, hexZ, latheX, latheZ, mesh, slab, springZ } from '../parts/common';

const m = (v: number): number => v / 1000;

/** The drum turned in one piece: the braking band, a recessed web and the hub (axis X, centred on x = 0). */
function drum(r: number, w: number): THREE.BufferGeometry {
  const h = w / 2, web = Math.min(0.2 * w, 0.012), hub = 0.38 * r, band = Math.min(0.12 * r, 0.02);
  const half = [V(0.0001, -h), V(hub - 0.003, -h), V(hub, -h + 0.003), V(hub, -web), V(r - band, -web), V(r - band, -h + 0.004), V(r - band + 0.003, -h), V(r - 0.003, -h), V(r, -h + 0.003)];
  const g = latheX([...half, ...half.slice().reverse().map((p) => V(p.x, -p.y))], 96);
  g.computeTangents();
  return g;
}

/** An annular sector round +Z seen along X (a shoe or its lining), from r1 to r2, ± half. */
function sector(r1: number, r2: number, half: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(r1 * Math.cos(-half), r1 * Math.sin(-half));
  s.absarc(0, 0, r2, -half, half, false);
  s.absarc(0, 0, r1, half, -half, true);
  return s;
}

/** The release magnet lying along Z between the levers' tops: coil housing between two end flanges, a seam band. */
function magnetBody(r: number, half: number): THREE.BufferGeometry {
  const f = Math.min(0.016, 0.18 * half), s = 0.003;
  return latheZ([V(0.0001, -half), V(r - s, -half), V(r, -half + s), V(r, -half + f), V(r - 0.004, -half + f + 0.002), V(r - 0.004, -0.005), V(r - 0.0015, -0.004),
    V(r - 0.0015, 0.004), V(r - 0.004, 0.005), V(r - 0.004, half - f - 0.002), V(r, half - f), V(r, half - s), V(r - s, half), V(0.0001, half)], 72);
}

export function shapedBrake(B: BrakeDetail, M: MachineMaterials, worm: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group(), y = m(B.y), r = m(B.r), x = m(B.x), xd = m(B.x0 + B.x1) / 2, w = m(B.x1 - B.x0), rod = m(B.rodY);
  const d = mesh(drum(r, w), M.machined, xd, y, 0);
  worm.push(d);
  g.add(d);
  for (const L of B.levers) {
    const s = L.side, z0 = m(L.z0), z1 = m(L.z1), t = z1 - z0, zc = s * (z0 + z1) / 2;
    // the lever: its outline extruded across Z, painted like the castings
    const outline = new THREE.Shape(L.outline.map(([px, py]) => new THREE.Vector2(m(px), m(py))));
    g.add(mesh(slab(outline, t, Math.min(0.003, t / 6), 8), M.black, 0, 0, zc));
    // the shoe and its lining on the drum's side, the pin joining it to the lever, the pivot pin at the bottom
    const turn = s > 0 ? 0 : Math.PI, len = 0.8 * w;
    const lining = slab(sector(r + 0.0005, r + 0.0065, L.shoeHalf), len, 0.0015, 16).rotateY(-Math.PI / 2).rotateY(turn);
    const shoe = slab(sector(r + 0.006, r + 0.016, L.shoeHalf + 0.03), 0.7 * len, 0.002, 16).rotateY(-Math.PI / 2).rotateY(turn);
    g.add(mesh(lining, M.lining, x, y, 0), mesh(shoe, M.black, x, y, 0));
    const pin = Math.max(0, z0 - (r + 0.016));
    if (pin > 0.002) g.add(mesh(cylZ(0.011, pin, 20), M.steel, x, y, s * (r + 0.016 + pin / 2)));
    g.add(mesh(cylZ(0.01, t + 0.024, 20), M.steel, m(L.pivot[0]), m(L.pivot[1]), zc));
  }
  // the tie rod through the tops, the springs outside the levers held by a washer and two nuts
  const reach = Math.max(...B.springs.map((sp) => sp[1])), ends = m(reach) + 0.026;
  g.add(mesh(cylZ(0.008, 2 * ends, 16), M.steel, x, rod, 0));
  B.springs.forEach(([a, b], i) => {
    const s = B.levers[i].side, za = m(a), zb = m(b), rr = Math.min(0.022, Math.max(0.014, 0.35 * (zb - za)));
    g.add(mesh(springZ(x, rod, s * za, s * zb, rr, 0.0042, 6), M.spring));
    g.add(mesh(cylZ(rr + 0.005, 0.004, 32), M.steel, x, rod, s * (zb + 0.002)));
    g.add(mesh(hexZ(0.014, 0.011), M.steel, x, rod, s * (zb + 0.0095)), mesh(hexZ(0.014, 0.008), M.steel, x, rod, s * (zb + 0.0205)));
  });
  // the magnet between the tops: the coil housing along Z with its plungers onto the levers; a magnet the shape gives
  // as a box keeps its box
  const mg = B.magnet;
  if (mg && 'cyl' in mg && mg.cyl === 'z') {
    const [mx, my] = mg.at.map(m), mr = m(mg.r), half = m(mg.span[1] - mg.span[0]) / 2;
    g.add(mesh(magnetBody(mr, half), M.alu, mx, my, 0));
    for (const L of B.levers) {
      const gap = m(L.z0) - half;
      if (gap > 0.003) g.add(mesh(cylZ(Math.min(0.012, 0.25 * mr), gap, 20), M.steel, mx, Math.min(my, rod + 0.02), L.side * (half + gap / 2)));
    }
    // the hand release: a cam on the magnet's back, the bar and the red knob
    const lever = new THREE.Group(), bar = Math.max(0.1, 1.6 * mr);
    lever.position.set(mx, my + mr * 0.9, -half * 0.6);
    lever.rotation.z = -0.9;
    lever.add(mesh(cylZ(0.016, 0.018, 24), M.steel), mesh(new RoundedBoxGeometry(0.012, bar, 0.01, 2, 0.003), M.steel, 0, bar / 2, 0));
    lever.add(mesh(latheZ([V(0.0001, -0.03), V(0.011, -0.03), V(0.015, -0.02), V(0.016, 0.01), V(0.013, 0.028), V(0.0001, 0.032)], 32).rotateX(-Math.PI / 2), M.red, 0, bar + 0.028, 0));
    g.add(lever);
  } else if (mg) {
    const [bx0, by0, bz0, bx1, by1, bz1] = partBox(mg).map(m), e = Math.min(0.012, 0.12 * Math.min(bx1 - bx0, by1 - by0, bz1 - bz0));
    g.add(mesh(new RoundedBoxGeometry(bx1 - bx0, by1 - by0, bz1 - bz0, 2, e), M.alu, (bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2));
    g.add(mesh(cylX(0.008, 0.02, 16), M.rubber, bx1 + 0.01, (by0 + by1) / 2, 0));
  }
  return g;
}
