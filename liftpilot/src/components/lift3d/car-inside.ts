// The inside of the car: brushed stainless panels with their joints on the walls, the skirting and the trims of the
// entrances, the handrail and the mirror on the wall facing the main entrance, the operating panel on a side wall
// (floor display, floor and door buttons, alarm), the suspended ceiling with its spots and the granite floor; the
// light. Built in plan and heights from the car floor (millimetres) into the car's batch; the display and the light
// go into the car's group. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { DoorLayout, Layout } from '@/shaft';
import { P, onWall, type Batch, type Point } from './geom';
import type { LiftMaterials, Side } from './materials';

/** A wall of the car seen from inside: its inner face (depth from that shaft wall) and its span along the wall. */
export interface CarWall {
  side: Side;
  face: number;
  a0: number;
  a1: number;
  door?: DoorLayout;
}

export interface CarInside {
  /** the floor display: label of the floor and the direction of travel */
  setDisplay(label: string, dir: -1 | 0 | 1): void;
  dispose(): void;
}

// floor finish, skirting, handrail height (EN 81-70: 900 mm), the operating panel's centre from the front wall
const FLOOR = 12, SKIRT = 100, RAIL_Z = 900, COP_FROM_FRONT = 450;
const OPPOSITE: Record<Side, Side> = { front: 'rear', rear: 'front', left: 'right', right: 'left' };

/** The display's face: the floor in amber segments-like digits and an arrow of the direction. */
function display(): { mesh: THREE.Mesh; draw(label: string, dir: -1 | 0 | 1): void; dispose(): void } {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicNodeMaterial({ map: tex });
  const draw = (label: string, dir: -1 | 0 | 1): void => {
    if (!g) return;
    g.fillStyle = '#06080b';
    g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#ffab3d';
    g.font = `700 ${label.length > 2 ? 40 : 56}px ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 80, 44);
    if (dir !== 0) {
      g.beginPath();
      g.moveTo(14, dir > 0 ? 50 : 30);
      g.lineTo(34, dir > 0 ? 50 : 30);
      g.lineTo(24, dir > 0 ? 28 : 52);
      g.fill();
    }
    tex.needsUpdate = true;
  };
  return { mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.128, 0.08), material), draw, dispose: () => { tex.dispose(); material.dispose(); } };
}

export function buildCarInside(L: Layout, walls: readonly CarWall[], H: number, labels: readonly string[], M: LiftMaterials, B: Batch, group: THREE.Group): CarInside {
  const { W, D } = L.inputs, ci = L.carInner, t = L.inputs.carWall;
  // a point on the inner face of a car wall: u along it, `out` from the face into the car, z high
  const at = (w: CarWall, u: number, out: number, z: number): Point => {
    const [x, y] = onWall(w.side, W, D, u, w.face + out);
    return [x, y, z];
  };
  const on = (w: CarWall, u0: number, u1: number, o0: number, o1: number, z0: number, z1: number, m: THREE.Material): void => {
    const lo = Math.max(u0, w.a0), hi = Math.min(u1, w.a1);
    if (hi - lo > 1) B.wallBox(w.side, W, D, lo, hi, w.face + o0, w.face + o1, z0, z1, m);
  };

  // walls: the stainless skin around the openings, joints between the panels, skirting, trims round the entrances
  for (const w of walls) {
    const d = w.door, n = Math.max(2, Math.round((w.a1 - w.a0) / 420));
    const full = d ? [[w.a0, d.u0], [d.u1, w.a1]] : [[w.a0, w.a1]];
    for (const [u0, u1] of full) {
      on(w, u0, u1, -2, 0, 0, H, M.car);
      on(w, u0, u1, 0, 3, FLOOR, FLOOR + SKIRT, M.alu);
    }
    for (let k = 1; k < n; k++) {
      const u = w.a0 + ((w.a1 - w.a0) * k) / n;
      if (!d || u < d.u0 - 60 || u > d.u1 + 60) on(w, u - 2.5, u + 2.5, 0, 1.2, FLOOR + SKIRT, H, M.glass);
    }
    if (!d) continue;
    on(w, d.u0, d.u1, -2, 0, d.height, H, M.car);
    on(w, d.u0 - 40, d.u0, 0, 4, FLOOR, d.height + 40, M.alu);
    on(w, d.u1, d.u1 + 40, 0, 4, FLOOR, d.height + 40, M.alu);
    on(w, d.u0 - 40, d.u1 + 40, 0, 4, d.height, d.height + 40, M.alu);
    // the reveals of the opening through the wall
    if (d.u0 - w.a0 > 1) B.wallBox(w.side, W, D, d.u0, d.u0 + 2, w.face - t, w.face, 0, d.height, M.alu);
    if (w.a1 - d.u1 > 1) B.wallBox(w.side, W, D, d.u1 - 2, d.u1, w.face - t, w.face, 0, d.height, M.alu);
    B.wallBox(w.side, W, D, d.u0, d.u1, w.face - t, w.face, d.height - 2, d.height, M.alu);
  }

  // where things go: the operating panel on the side wall at the entrance's closing side, the handrail and the
  // mirror on the wall facing the main entrance (or on a free side wall)
  const main = walls.find((w) => w.door?.side === 'A') ?? walls[0], solid = walls.filter((w) => !w.door);
  const sides = solid.filter((w) => w.side !== OPPOSITE[main.side]);
  const closing: Side = main.side === 'front' || main.side === 'rear' ? (main.door?.stack === 'low' ? 'right' : 'left') : main.door?.stack === 'low' ? 'rear' : 'front';
  const copWall = sides.find((w) => w.side === closing) ?? sides[0] ?? null;
  const facing = solid.find((w) => w.side === OPPOSITE[main.side]) ?? solid.find((w) => w !== copWall) ?? null;

  if (facing) {
    const span = facing.a1 - facing.a0, u0 = facing.a0 + Math.min(150, span * 0.12), u1 = facing.a1 - Math.min(150, span * 0.12);
    // handrail: Ø 40 tube 35 mm clear of the wall, its ends turned back to the wall
    const out = 55, r = 20;
    B.rod(at(facing, u0, out, RAIL_Z), at(facing, u1, out, RAIL_Z), r, M.chrome, 16);
    for (const u of [u0, u1]) {
      B.rod(at(facing, u, 0, RAIL_Z), at(facing, u, out, RAIL_Z), r, M.chrome, 16);
      const [x, y, z] = at(facing, u, out, RAIL_Z), c = P(x, y, z);
      B.add(new THREE.SphereGeometry(r / 1000, 16, 10).translate(c.x, c.y, c.z), M.chrome);
    }
    // mirror above it, in an aluminium frame
    const m0 = u0 + 30, m1 = u1 - 30, z0 = RAIL_Z + 130, z1 = H - 150;
    on(facing, m0, m1, 0, 5, z0, z1, M.mirror);
    on(facing, m0 - 14, m1 + 14, 0, 8, z0 - 14, z0, M.alu);
    on(facing, m0 - 14, m1 + 14, 0, 8, z1, z1 + 14, M.alu);
    on(facing, m0 - 14, m0, 0, 8, z0, z1, M.alu);
    on(facing, m1, m1 + 14, 0, 8, z0, z1, M.alu);
  }

  const screen = display();
  if (copWall) {
    const front = copWall.side === 'left' || copWall.side === 'right' ? (main.side === 'rear' ? copWall.a1 - COP_FROM_FRONT : copWall.a0 + COP_FROM_FRONT) : (copWall.a0 + copWall.a1) / 2;
    const uc = Math.min(Math.max(front, copWall.a0 + 140), copWall.a1 - 140), w = copWall;
    // black glass in a stainless frame; the display and the intercom grille behind the glass
    on(w, uc - 118, uc + 118, 0, 3, 757, 1923, M.chrome);
    on(w, uc - 112, uc + 112, 3, 5, 763, 1917, M.glass);
    on(w, uc - 45, uc + 45, 5, 5.5, 1420, 1500, M.rubber);
    const [x, y, z] = at(w, uc, 6.5, 1760);
    screen.mesh.position.copy(P(x, y, z));
    screen.mesh.rotation.y = { front: Math.PI, rear: 0, left: Math.PI / 2, right: -Math.PI / 2 }[w.side];
    group.add(screen.mesh);
    // buttons: the floors in two columns from the bottom, door open and close under them, the alarm (yellow) lowest
    const button = (u: number, z: number, m: THREE.Material, ring: boolean): void => {
      if (ring) B.rod(at(w, u, 5, z), at(w, u, 9, z), 21, M.led, 20);
      B.rod(at(w, u, 5, z), at(w, u, 11, z), 17, m, 20);
    };
    labels.forEach((_, k) => button(uc + (k % 2 ? 38 : -38), 990 + Math.floor(k / 2) * 62, M.chrome, true));
    button(uc - 38, 920, M.chrome, false);
    button(uc + 38, 920, M.chrome, false);
    button(uc, 850, M.base, false);
  }
  screen.draw(labels[0] ?? '', 0);

  // suspended ceiling: a shadow gap round a satin panel, round spots in a grid
  B.box(ci.x, ci.y, H - 8, ci.x + ci.w, ci.y + ci.h, H, M.glass);
  B.box(ci.x + 12, ci.y + 12, H - 34, ci.x + ci.w - 12, ci.y + ci.h - 12, H - 8, M.ceiling);
  const nx = ci.w > 1300 ? 3 : 2, ny = ci.h > 1500 ? 3 : 2;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = ci.x + (ci.w * (i + 0.5)) / nx, y = ci.y + (ci.h * (j + 0.5)) / ny;
      B.rod([x, y, H - 35.5], [x, y, H - 34], 47, M.chrome, 24);
      B.rod([x, y, H - 36], [x, y, H - 34], 38, M.carLight, 24);
    }
  }
  const lamp = new THREE.PointLight(0xfff1dc, 2, 3.4, 2);
  lamp.position.copy(P(ci.x + ci.w / 2, ci.y + ci.h / 2, H - 260));
  group.add(lamp);

  // floor
  B.box(ci.x, ci.y, 0, ci.x + ci.w, ci.y + ci.h, FLOOR, M.stone);

  let shown = '';
  return {
    setDisplay(label, dir) {
      const key = `${label}|${dir}`;
      if (key === shown) return;
      shown = key;
      screen.draw(label, dir);
    },
    dispose: screen.dispose,
  };
}
