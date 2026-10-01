// The shaft built from its design: the four walls with the landing door openings at the floors each entrance
// serves, the landing doors (stainless portal and panels, telescopic or centre opening; on the shaft side the header
// with its track and lock, the aluminium sill on Panev's brackets), the landings outside with the call button, the pit
// floor, the slab over the shaft with its openings and a label at each floor. Plan and heights in millimetres
// (geom.ts turns them into metres); static parts merged by material. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { DoorLayout, Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV } from '@/shaft/norme';
import { Batch, P } from './geom';
import { LANDING_PANEL, doorPanels, landingTracks, trackPlanes, type DoorPanels } from './doors';
import { landingHeader } from './operator';
import { SILL_H, sill } from './sill';
import { doorBrackets } from './staffe';
import { buildSlab, type Opening } from './slab';
import { SIDES, type LiftMaterials, type Side } from './materials';

const LANDING = 1200;
const SLAB = 200;

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

/** The hardware of a landing entrance at the level z, on the shaft side of the wall: the suspension, the panels (by
 *  the car's across the sill gap), the sill on Panev's brackets, the stone threshold through the wall. */
export function landingEntrance(C: Batch, M: LiftMaterials, I: Layout['inputs'], d: DoorLayout, z: number): DoorPanels {
  const W = I.W, D = I.D, tracks = landingTracks(I.landingDepth);
  landingHeader(C, M, d.wall, W, D, d, tracks, LANDING_PANEL, z + d.height, I.landingDepth);
  const panels = doorPanels(d.wall, W, D, d, z, tracks, LANDING_PANEL, M.landing[d.wall], M, { kind: 'lock', v0: I.landingDepth + I.sillGap });
  sill(C, M, d.wall, W, D, d.u0 - 40, d.u1 + 40, -25, I.landingDepth, z, trackPlanes(d, tracks, LANDING_PANEL));
  doorBrackets(C, M, d.wall, W, D, d.u0 + 10, d.u1 - 10, z, I.landingDepth, SILL_H);
  C.wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u1 + KV.doorPortal, -I.wall, -25, z - 30, z, M.stone);
  return panels;
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

/** `cuts`: where the slab over the shaft is open (slabOpenings). */
export function buildShaft(L: Layout, S: Section, M: LiftMaterials, cuts: readonly Opening[]): ShaftModel {
  const I = L.inputs, V = I.vertical, W = I.W, D = I.D, wall = I.wall;
  const zBot = S.pitFloor, zTop = S.ceiling;
  const sides = { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() } as Record<Side, THREE.Group>;
  const common = new THREE.Group(), C = new Batch(), byside: Record<Side, Batch> = { front: new Batch(), rear: new Batch(), left: new Batch(), right: new Batch() };
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
    const a0 = along ? -wall : 0, a1 = along ? W + wall : D, mat = M.walls[side], g = byside[side];
    const ops = openings[side].slice().sort((p, q) => p.z0 - q.z0);
    const piece = (u0: number, u1: number, z0: number, z1: number): void => {
      if (u1 - u0 > 1 && z1 - z0 > 1) g.wallBox(side, W, D, u0, u1, -wall, 0, z0, z1, mat);
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

  // landing doors: the portal through the wall, the panels on the shaft side of the wall; the landing floor outside
  V.floors.forEach((f, i) => {
    const z = S.levels[i];
    for (const d of doorsOf(L, f.door)) {
      const g = byside[d.wall], frame = M.landing[d.wall], len = d.wall === 'front' || d.wall === 'rear' ? W : D, zh = z + d.height;
      g.wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u0, -wall - 30, 10, z, zh + 60, frame);
      g.wallBox(d.wall, W, D, d.u1, d.u1 + KV.doorPortal, -wall - 30, 10, z, zh + 60, frame);
      g.wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u1 + KV.doorPortal, -wall - 30, 10, zh, zh + 60, frame);
      // call button by the portal, on the landing
      const cb = d.u1 + KV.doorPortal + 110 < len ? d.u1 + KV.doorPortal + 60 : d.u0 - KV.doorPortal - 120;
      g.wallBox(d.wall, W, D, cb, cb + 60, -wall - 6, -wall, z + 1040, z + 1220, frame);
      g.wallBox(d.wall, W, D, cb + 15, cb + 45, -wall - 11, -wall - 6, z + 1100, z + 1130, frame);
      const panels = landingEntrance(C, M, I, d, z);
      sides[d.wall].add(panels.group);
      landings.push({ floor: i, panels });
      g.wallBox(d.wall, W, D, -wall - 400, len + wall + 400, -wall - LANDING, -wall, z - SLAB, z, M.floors[d.wall]);
      const tag = label(f.label);
      const [lx, ly] = d.wall === 'front' ? [d.u0 - 320, -wall - 60] : d.wall === 'rear' ? [d.u1 + 320, D + wall + 60] : d.wall === 'left' ? [-wall - 60, d.u1 + 320] : [W + wall + 60, d.u0 - 320];
      tag.position.copy(P(lx, ly, z + d.height - 250));
      common.add(tag);
    }
  });

  // pit floor and the slab over the shaft with the openings it needs (slab.ts)
  C.box(-wall, -wall, zBot - 300, W + wall, D + wall, zBot, M.pit);
  const R = I.room;
  const rect = [R ? -R.shaftX : -wall, R ? -R.shaftY : -wall, R ? R.W - R.shaftX : W + wall, R ? R.D - R.shaftY : D + wall] as const;
  buildSlab(C, M, rect, zTop, zTop + (R ? R.slab : 250), cuts, Boolean(R));
  C.into(common);
  for (const side of SIDES) byside[side].into(sides[side]);

  return {
    sides, common,
    setLanding(floor, k) {
      for (const l of landings) l.panels.set(l.floor === floor ? k : 0);
    },
  };
}
