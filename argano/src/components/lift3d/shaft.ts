// The shaft built from its design: the four walls with the landing door openings at the floors each entrance
// serves, the landing doors (frame and panels, telescopic or centre opening), the landings outside, the pit floor,
// the slab over the shaft with the rope opening and a label at each floor. Plan and heights in millimetres
// (geom.ts turns them into metres). Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import type { DoorLayout, Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV } from '@/shaft/norme';
import { P, box, wallBox } from './geom';
import { SIDES, type LiftMaterials, type Side } from './materials';

const LANDING = 1200;
const SLAB = 200;

export interface DoorPanels {
  group: THREE.Group;
  /** opening 0 (closed) … 1 (open) */
  set(k: number): void;
}

/** Door panels of a door layout at height z0, on two tracks at v0 and v1 from the wall's inner face. */
export function doorPanels(wall: Side, W: number, D: number, d: DoorLayout, z0: number, v0: number, v1: number, t: number, material: THREE.Material): DoorPanels {
  const group = new THREE.Group(), L = d.width, ov = 20, h = d.height;
  type Panel = { mesh: THREE.Mesh; travel: number; base: THREE.Vector3; dir: THREE.Vector3 };
  const panels: Panel[] = [];
  const axis = wall === 'front' || wall === 'rear' ? P(1, 0, 0) : P(0, 1, 0);
  const add = (a0: number, a1: number, track: number, travel: number): void => {
    const mesh = wallBox(wall, W, D, a0, a1, track, track + t, z0, z0 + h, material);
    panels.push({ mesh, travel, base: mesh.position.clone(), dir: axis.clone().normalize() });
    group.add(mesh);
  };
  if (d.kind === 'C2') {
    const mid = (d.u0 + d.u1) / 2;
    add(d.u0, mid + ov / 2, v0, -L / 2);
    add(mid - ov / 2, d.u1, v0, L / 2);
  } else {
    const sgn = d.stack === 'low' ? -1 : 1;
    // the fast panel away from the stack, on the track nearer the shaft; the slow one next to the stack
    if (sgn > 0) { add(d.u0, d.u0 + L / 2 + ov, v1, L); add(d.u0 + L / 2, d.u1 + ov, v0, L / 2); }
    else { add(d.u1 - L / 2 - ov, d.u1, v1, -L); add(d.u0 - ov, d.u0 + L / 2, v0, -L / 2); }
  }
  return {
    group,
    set(k) {
      for (const p of panels) p.mesh.position.copy(p.base).addScaledVector(p.dir, (p.travel * k) / 1000);
    },
  };
}

export interface ShaftModel {
  /** walls and landing doors of each side, for the x-ray */
  sides: Record<Side, THREE.Group>;
  common: THREE.Group;
  /** landing doors of a floor (both entrances), opening 0…1 */
  setLanding(floor: number, k: number): void;
}

/** Entrances serving a floor, as door layouts. */
export function doorsOf(L: Layout, door: 'A' | 'B' | 'AB'): DoorLayout[] {
  return L.doors.filter((d) => door === 'AB' || d.side === door);
}

function label(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(16, 22, 31, 0.86)';
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e0a526';
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = '#f3f5f7';
    g.font = `600 ${text.length > 2 ? 44 : 60}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 68);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: tex, depthTest: true, transparent: true }));
  s.scale.set(0.34, 0.34, 1);
  return s;
}

export function buildShaft(L: Layout, S: Section, M: LiftMaterials, holes: readonly [number, number, number, number]): ShaftModel {
  const I = L.inputs, V = I.vertical, W = I.W, D = I.D, wall = I.wall;
  const zBot = S.pitFloor, zTop = S.ceiling;
  const sides = { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() } as Record<Side, THREE.Group>;
  const common = new THREE.Group();
  const landings: { floor: number; panels: DoorPanels }[] = [];

  // openings per wall: the clear opening with its jambs, from the floor to the head of the door
  const openings: Record<Side, { u0: number; u1: number; z0: number; z1: number }[]> = { front: [], rear: [], left: [], right: [] };
  V.floors.forEach((f, i) => {
    for (const d of doorsOf(L, f.door)) {
      openings[d.wall].push({ u0: d.u0 - KV.doorPortal, u1: d.u1 + KV.doorPortal, z0: S.levels[i], z1: S.levels[i] + d.height + 120 });
    }
  });
  for (const side of SIDES) {
    const along = side === 'front' || side === 'rear';
    const a0 = along ? -wall : 0, a1 = along ? W + wall : D, mat = M.walls[side], g = sides[side];
    const ops = openings[side].slice().sort((p, q) => p.z0 - q.z0);
    const piece = (u0: number, u1: number, z0: number, z1: number): void => {
      if (u1 - u0 > 1 && z1 - z0 > 1) g.add(wallBox(side, W, D, u0, u1, -wall, 0, z0, z1, mat));
    };
    if (!ops.length) piece(a0, a1, zBot, zTop);
    else {
      const o0 = Math.min(...ops.map((o) => o.u0)), o1 = Math.max(...ops.map((o) => o.u1));
      piece(a0, o0, zBot, zTop);
      piece(o1, a1, zBot, zTop);
      let z = zBot;
      for (const o of ops) { piece(o0, o1, z, o.z0); z = o.z1; }
      piece(o0, o1, z, zTop);
    }
  }

  // landing doors: frame on the wall, panels on the shaft side of the wall; the landing floor outside
  V.floors.forEach((f, i) => {
    const z = S.levels[i];
    for (const d of doorsOf(L, f.door)) {
      const g = sides[d.wall], len = d.wall === 'front' || d.wall === 'rear' ? W : D;
      g.add(wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u0, -wall - 30, 10, z, z + d.height + 60, M.frame));
      g.add(wallBox(d.wall, W, D, d.u1, d.u1 + KV.doorPortal, -wall - 30, 10, z, z + d.height + 60, M.frame));
      g.add(wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u1 + KV.doorPortal, -wall - 30, 10, z + d.height, z + d.height + 60, M.frame));
      // the header of the door over the stack, on the shaft side
      g.add(wallBox(d.wall, W, D, Math.min(d.frame0, d.u0), Math.max(d.frame1, d.u1), 0, I.landingDepth, z + d.height, z + d.height + 180, M.frame));
      const panels = doorPanels(d.wall, W, D, d, z, 12, 44, 26, M.landing[d.wall]);
      g.add(panels.group);
      landings.push({ floor: i, panels });
      // sill and landing
      common.add(wallBox(d.wall, W, D, d.u0 - 40, d.u1 + 40, -wall, I.landingDepth, z - 30, z, M.frame));
      g.add(wallBox(d.wall, W, D, -wall - 400, len + wall + 400, -wall - LANDING, -wall, z - SLAB, z, M.floors[d.wall]));
      const tag = label(f.label);
      const [lx, ly] = d.wall === 'front' ? [d.u0 - 320, -wall - 60] : d.wall === 'rear' ? [d.u1 + 320, D + wall + 60] : d.wall === 'left' ? [-wall - 60, d.u1 + 320] : [W + wall + 60, d.u0 - 320];
      tag.position.copy(P(lx, ly, z + d.height - 250));
      common.add(tag);
    }
  });

  // pit floor and the slab over the shaft with the opening for the ropes
  common.add(box(-wall, -wall, zBot - 300, W + wall, D + wall, zBot, M.pit));
  const R = I.room, slab = R ? R.slab : 250;
  const [hx0, hy0, hx1, hy1] = holes;
  const sx0 = R ? -R.shaftX : -wall, sy0 = R ? -R.shaftY : -wall, sx1 = R ? R.W - R.shaftX : W + wall, sy1 = R ? R.D - R.shaftY : D + wall;
  const slabPiece = (x0: number, y0: number, x1: number, y1: number): void => {
    if (x1 - x0 > 1 && y1 - y0 > 1) common.add(box(x0, y0, zTop, x1, y1, zTop + slab, M.slab));
  };
  slabPiece(sx0, sy0, hx0, sy1);
  slabPiece(hx1, sy0, sx1, sy1);
  slabPiece(hx0, sy0, hx1, hy0);
  slabPiece(hx0, hy1, hx1, sy1);

  return {
    sides, common,
    setLanding(floor, k) {
      for (const l of landings) l.panels.set(l.floor === floor ? k : 0);
    },
  };
}
