// The shaft built from its design: the four walls with the landing door openings at the floors each entrance
// serves, the landing doors (stainless portal and panels, telescopic or centre opening; on the shaft side the header
// with its track and lock, the aluminium sill on Panev's brackets), the landings outside with the call station, the pit
// floor, the slab over the shaft with its openings and a label at each floor. From the top floor to the slab the walls
// stand where src/shaft/head.ts puts them (an old building's may stand elsewhere); the landing door of the top floor
// stays in line with the car. A landing door the plan sets apart from its car door (src/shaft/landing.ts) stands where
// it is set, with everything of the landing; its lock's rollers stay in the line of the car's coupler. Plan and heights
// in millimetres (geom.ts turns them into metres); static parts merged by material. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { DoorLayout, Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV } from '@/shaft/norme';
import { callStationAt, callStationOf } from '@/shaft/callstation';
import { headOf } from '@/shaft/head';
import { portalOf } from '@/shaft/frame';
import { hasImbotti, marbleOpening, wallOpeningHeight } from '@/shaft/imbotti';
import { landingOf } from '@/shaft/landing';
import { bracketsAlong, doorPairOf, topBracketsAt } from '@/shaft/staffe-porte';
import { HEADER } from '@/shaft/sill';
import { lampHeights, nichesOf } from '@/shaft/niche';
import { Batch, P, onWall } from './geom';
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

/** The hardware of a landing entrance at the level z, on the shaft side of the wall: the suspension on Panev's brackets,
 *  the panels (by the car's across the sill gap), the sill on Panev's brackets, the stone threshold through the wall;
 *  where the landing door stands, the lock's rollers where the car door's coupler takes them. `up`: the level of the
 *  floor above when its door is on the same wall (its sill's brackets may stand by those over this door, its sill may
 *  leave no wall for them). */
export function landingEntrance(C: Batch, M: LiftMaterials, I: Layout['inputs'], car: DoorLayout, z: number, up?: number): DoorPanels {
  const W = I.W, D = I.D, tracks = landingTracks(I.landingDepth), d = landingOf(car), pair = doorPairOf(I);
  landingHeader(C, M, d.wall, W, D, d, tracks, LANDING_PANEL, z + d.height, I.landingDepth);
  const len = d.wall === 'front' || d.wall === 'rear' ? W : D;
  doorBrackets(C, M, d.wall, W, D, topBracketsAt(pair, d, len, z, wallOpeningHeight(I) - I.doorHeight, up), z + d.height + HEADER.top, I.landingDepth, pair, true);
  const lock = { kind: 'lock', v0: I.landingDepth + I.sillGap, du: car.u0 - d.u0 } as const;
  const panels = doorPanels(d.wall, W, D, d, z, tracks, LANDING_PANEL, M.landing[d.wall], M, lock);
  sill(C, M, d.wall, W, D, d.u0 - 40, d.u1 + 40, -25, I.landingDepth, z, trackPlanes(d, tracks, LANDING_PANEL));
  doorBrackets(C, M, d.wall, W, D, bracketsAlong(d.u0 + 10, d.u1 - 10), z - SILL_H, I.landingDepth, pair);
  const jamb = portalOf(I).jamb;
  C.wallBox(d.wall, W, D, d.u0 - jamb, d.u1 + jamb, -I.wall, -25, z - 30, z, M.stone);
  return panels;
}

/** The landing call station beside a door at the floor level z, where src/shaft/callstation.ts puts it: the brushed
 *  plate on the landing face of the wall (`s` mm into the shaft in the headroom), the floor display at its top, the
 *  buttons with their lit rings (one at the ends of the travel, up and down between). */
function callStation(g: Batch, M: LiftMaterials, I: Layout['inputs'], d: DoorLayout, z: number, plate: THREE.Material, calls: 'up' | 'down' | 'both', s = 0): void {
  const cs = callStationOf(I), { u } = callStationAt(d, cs, portalOf(I).jamb), [w, h, t] = KV.callPanel, f = -I.wall - t + s, zc = z + cs.height;
  g.wallBox(d.wall, I.W, I.D, u - w / 2, u + w / 2, f, -I.wall + s, zc - h / 2, zc + h / 2, plate);
  g.wallBox(d.wall, I.W, I.D, u - 40, u + 40, f - 1, f, zc + 75, zc + 115, M.glass);
  g.wallBox(d.wall, I.W, I.D, u - 14, u + 14, f - 1.5, f - 1, zc + 85, zc + 105, M.led);
  for (const dz of calls === 'both' ? [35, -35] : [0]) {
    const [a0, a1] = [onWall(d.wall, I.W, I.D, u, f), onWall(d.wall, I.W, I.D, u, f - 6)];
    g.rod([a0[0], a0[1], zc + dz], [a1[0], a1[1], zc + dz], 17, M.carLight, 20);
    const [b0, b1] = [onWall(d.wall, I.W, I.D, u, f - 6), onWall(d.wall, I.W, I.D, u, f - 9)];
    g.rod([b0[0], b0[1], zc + dz], [b1[0], b1[1], zc + dz], 14, M.chrome, 20);
  }
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

/** Openings a machine below needs: through a wall [mm along it, heights], and in the pit's slab (slabOpenings). */
export interface MachineCuts {
  walls: readonly { side: Side; u0: number; u1: number; z0: number; z1: number }[];
  pit: readonly Opening[];
}

/** The linings (imbotti) of an old opening round the new door at the level z: brushed sheet beside the portal (or the
 *  door's own frame) and over its head (the portal's stainless), a little behind the portal's face, from the landing
 *  face of the wall to the shaft; the marbles round the old opening. */
function imbotti(g: Batch, M: LiftMaterials, I: Layout['inputs'], d: DoorLayout, z: number, s: number, sheet: THREE.Material): void {
  const m = marbleOpening(I, d), { jamb: p, head } = portalOf(I), zh = z + d.height + head, top = z + m.h, f = -I.wall - 15 + s, b = s;
  if (m.u0 < d.u0 - p - 0.5) g.wallBox(d.wall, I.W, I.D, m.u0, d.u0 - p, f, b, z, top, sheet);
  if (m.u1 > d.u1 + p + 0.5) g.wallBox(d.wall, I.W, I.D, d.u1 + p, m.u1, f, b, z, top, sheet);
  if (top > zh + 0.5) g.wallBox(d.wall, I.W, I.D, m.u0, m.u1, f, b, zh, top, sheet);
  // the marbles: the old opening's jambs and head on the landing face
  for (const [u0, u1] of [[m.u0 - 30, m.u0], [m.u1, m.u1 + 30]] as const) g.wallBox(d.wall, I.W, I.D, u0, u1, -I.wall - 20 + s, -I.wall + 40 + s, z, top + 30, M.stone);
  g.wallBox(d.wall, I.W, I.D, m.u0 - 30, m.u1 + 30, -I.wall - 20 + s, -I.wall + 40 + s, top, top + 30, M.stone);
}

/** `cuts`: where the slab over the shaft is open (slabOpenings); `machine`: what a machine below needs open. */
export function buildShaft(L: Layout, S: Section, M: LiftMaterials, cuts: readonly Opening[], machine: MachineCuts = { walls: [], pit: [] }): ShaftModel {
  const I = L.inputs, V = I.vertical, W = I.W, D = I.D, wall = I.wall;
  const zBot = S.pitFloor, zTop = S.ceiling;
  const sides = { front: new THREE.Group(), rear: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group() } as Record<Side, THREE.Group>;
  const common = new THREE.Group(), C = new Batch(), byside: Record<Side, Batch> = { front: new Batch(), rear: new Batch(), left: new Batch(), right: new Batch() };
  const landings: { floor: number; panels: DoorPanels }[] = [];

  // openings per wall: the clear opening with its jambs, from the floor to the head of the door; an old opening between
  // the marbles round a smaller new door, up to the top marble
  const imb = hasImbotti(I), fr = portalOf(I), openings: Record<Side, { u0: number; u1: number; z0: number; z1: number }[]> = { front: [], rear: [], left: [], right: [] };
  V.floors.forEach((f, i) => {
    for (const d of doorsOf(L, f.door)) {
      const m = marbleOpening(I, d);
      openings[d.wall].push({ u0: m.u0, u1: m.u1, z0: S.levels[i], z1: S.levels[i] + (imb ? Math.max(m.h, d.height + fr.head) : fr.depth !== null ? d.height + fr.head : d.height + 120) });
    }
  });
  // each wall in columns between the edges of its openings and niches; in each column the runs of the same inner face
  // (through an opening: no wall; in a niche: its back) from the pit floor to the slab, moved in the headroom
  const lampZ = lampHeights(S, KV.nicheLightH), head = headOf(I), top = V.floors.length - 1, zHead = S.levels[top] ?? zTop;
  for (const side of SIDES) {
    const along = side === 'front' || side === 'rear', hs = head[side];
    const a0 = along ? -wall : 0, a1 = along ? W + wall : D, mat = M.walls[side], g = byside[side];
    const cuts = [
      ...openings[side].map((o) => ({ ...o, v: -wall })),
      ...machine.walls.filter((c) => c.side === side).map((c) => ({ ...c, v: -wall })),
      ...nichesOf(I).filter((n) => n.wall === side).flatMap((n) => (n.use === 'light' ? lampZ.map((z) => [z, z + KV.nicheLightH]) : [[zBot, zTop]])
        .map(([z0, z1]) => ({ u0: n.at, u1: n.at + n.width, z0, z1, v: -n.depth }))),
    ];
    const edges = (vals: number[], lo: number, hi: number): number[] => [...new Set([lo, hi, ...vals.filter((x) => x > lo && x < hi)])].sort((p, q) => p - q);
    const us = edges(cuts.flatMap((c) => [c.u0, c.u1]), a0, a1), zs = edges([...cuts.flatMap((c) => [c.z0, c.z1]), ...(hs ? [zHead] : [])], zBot, zTop);
    for (let i = 0; i + 1 < us.length; i++) {
      const u0 = us[i], u1 = us[i + 1], um = (u0 + u1) / 2;
      let run: { z0: number; z1: number; v: number; s: number } | null = null;
      const flush = (): void => {
        if (run && run.v > -wall + 1 && run.z1 - run.z0 > 1 && u1 - u0 > 1) g.wallBox(side, W, D, u0, u1, -wall + run.s, run.v + run.s, run.z0, run.z1, mat);
      };
      for (let j = 0; j + 1 < zs.length; j++) {
        const z0 = zs[j], z1 = zs[j + 1], zm = (z0 + z1) / 2, sh = zm > zHead ? hs : 0;
        const v = Math.min(0, ...cuts.filter((c) => um > c.u0 && um < c.u1 && zm > c.z0 && zm < c.z1).map((c) => c.v));
        if (run && run.v === v && run.s === sh) run.z1 = z1;
        else {
          flush();
          run = { z0, z1, v, s: sh };
        }
      }
      flush();
    }
  }

  // landing doors: the portal through the wall, the panels on the shaft side of the wall; the landing floor outside
  V.floors.forEach((f, i) => {
    const z = S.levels[i];
    for (const car of doorsOf(L, f.door)) {
      const d = landingOf(car), g = byside[d.wall], frame = M.landing[d.wall], len = d.wall === 'front' || d.wall === 'rear' ? W : D, zh = z + d.height;
      // the portal (or the door's own frame from the landing face: its jambs full height, its header between them) and
      // the landing on the wall where it stands at this floor; the door itself in line with the car
      const s = i === top ? head[d.wall] : 0;
      if (fr.depth === null) {
        g.wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u0, -wall - 30 + s, 10 + s, z, zh + 60, frame);
        g.wallBox(d.wall, W, D, d.u1, d.u1 + KV.doorPortal, -wall - 30 + s, 10 + s, z, zh + 60, frame);
        g.wallBox(d.wall, W, D, d.u0 - KV.doorPortal, d.u1 + KV.doorPortal, -wall - 30 + s, 10 + s, zh, zh + 60, frame);
      } else {
        const v1 = Math.min(-wall + fr.depth, 0) + s, zf = zh + fr.head;
        g.wallBox(d.wall, W, D, d.u0 - fr.jamb, d.u0, -wall + s, v1, z, zf, frame);
        g.wallBox(d.wall, W, D, d.u1, d.u1 + fr.jamb, -wall + s, v1, z, zf, frame);
        g.wallBox(d.wall, W, D, d.u0, d.u1, -wall + s, v1, zh, zf, frame);
      }
      if (imb) imbotti(g, M, I, d, z, s, frame);
      callStation(g, M, I, d, z, frame, i === 0 ? 'up' : i === V.floors.length - 1 ? 'down' : 'both', s);
      const up = V.floors[i + 1]?.door.includes(car.side) ? S.levels[i + 1] : undefined;
      const panels = landingEntrance(C, M, I, car, z, up);
      sides[d.wall].add(panels.group);
      landings.push({ floor: i, panels });
      g.wallBox(d.wall, W, D, -wall - 400, len + wall + 400, -wall - LANDING + s, -wall + s, z - SLAB, z, M.floors[d.wall]);
      const tag = label(f.label);
      const [lx, ly] = d.wall === 'front' ? [d.u0 - 320, -wall - 60] : d.wall === 'rear' ? [d.u1 + 320, D + wall + 60] : d.wall === 'left' ? [-wall - 60, d.u1 + 320] : [W + wall + 60, d.u0 - 320];
      tag.position.copy(P(lx, ly, z + d.height - 250));
      common.add(tag);
    }
  });

  // pit floor and the slab over the shaft with the openings it needs (slab.ts)
  if (machine.pit.length) buildSlab(C, M, [-wall, -wall, W + wall, D + wall], zBot - 300, zBot, machine.pit, false, M.pit);
  else C.box(-wall, -wall, zBot - 300, W + wall, D + wall, zBot, M.pit);
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
