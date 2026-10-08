// Section A-A as model entities: a vertical cut through the middle of the car along the depth of the shaft, seen
// from the right, so the front (entrance A) is on the left and the rear on the right. X is the plan y, Z the height
// from the lowest floor. Walls with the landing openings and slabs of the floors each side serves, pit and slab over
// the shaft, the machine room, the car at a floor with frame, operator and balustrade, the counterweight where the
// ropes put it, rails, buffers, the spaces for the maintenance person and the ropes. A long travel is compressed
// between two heights (the floors in between keep only their level), with break marks on the walls. From the top floor
// to the slab the walls stand where head.ts puts them (an old building's may stand elsewhere).
import { clipBand, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import { bufferType } from './buffers';
import { buffer } from './section-buffer';
import { headOf } from './head';
import { portalOf } from './frame';
import { hasImbotti, wallOpeningHeight } from './imbotti';
import { KV } from './norme';
import { KV_VERT } from './norme-vert';
import { lampHeights, nichesOf } from './niche';
import { CAR_PANEL, HEADER, LANDING_PANEL, carTracks, landingTracks, sillSection, trackPlanes } from './sill';
import { doorPairSection, doorTopPairSection } from './section-staffe';
import { doorPairOf, topPairRoom } from './staffe-porte';
import { bufferPlan, pitSpace } from './pit';
import { RAILS } from './rails';
import { cwPlateAt, section, type Section } from './section';
import { cwScreen, screenLowDim } from './screen';
import { carLowest, refugeHigh } from './extremes';
import { pitKitSection } from './pit-kit';
import { toeSection } from './toe';
import type { Layout, Rail } from './types';

/** Real heights between z0 and z1 are drawn f times shorter. */
export interface ZMap {
  z0: number;
  z1: number;
  f: number;
}

export const mapZ = (m: ZMap | null, z: number): number =>
  !m ? z : z <= m.z0 ? z : z >= m.z1 ? z - (m.z1 - m.z0) * (1 - m.f) : m.z0 + (z - m.z0) * m.f;

export interface SectionView {
  /** floor where the car is */
  carFloor: number;
  /** real heights shown */
  lo: number;
  hi: number;
  zmap: ZMap | null;
  /** the details of the extreme positions: the car on its compressed buffers dashed in the pit (extremes.ts) */
  extremes?: boolean;
}

const LANDING_EXT = 400;
const SLAB = 220;

export function sectionEntities(L: Layout, v: SectionView): { entities: Entity[]; bounds: Box; S: Section } {
  const S = section(L), I = L.inputs, V = I.vertical, T = I.wall, D = I.D, out: Entity[] = [];
  const Z = (z: number): number => mapZ(v.zmap, z);
  const P = (x: number, z: number): Pt => [x, Z(z)];
  const inWin = (z: number): boolean => z >= v.lo - 1 && z <= v.hi + 1;
  const compressed = (z: number): boolean => !!v.zmap && z > v.zmap.z0 + 1 && z < v.zmap.z1 - 1;
  const roomTop = S.ceiling + (I.room ? I.room.slab + (I.room.ridge || I.room.H) : 0);
  const zBot = Math.max(v.lo, S.pitFloor - SLAB), zTop = Math.min(v.hi, I.room ? roomTop + 250 : S.ceiling + SLAB);
  const box = (x0: number, z0: number, x1: number, z1: number, st: Parameters<typeof rect>[4] = 'thin', fill?: Parameters<typeof rect>[5]): Entity =>
    path([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], true, st, fill);

  // walls with the landing openings of the floors each side serves
  const served = (side: 'front' | 'rear'): number[] => V.floors.flatMap((f, i) => {
    const onFront = f.door.includes('A'), onRear = I.entrances === 'opposite' && f.door.includes('B');
    return (side === 'front' ? onFront : onRear) ? [i] : [];
  });
  // a niche the cut passes through: the wall is thinner there, all the way up (counterweight, trunking) or at each lamp
  const cutX = L.car.x + L.car.w / 2, hd = headOf(I), topFloor = V.floors.length - 1, zHead = S.levels[topFloor] ?? Infinity;
  for (const side of ['front', 'rear'] as const) {
    // a wall `s` mm into the shaft (in the headroom), behind its face by d (a niche)
    const face = (d: number, s = 0): [number, number] => (side === 'front' ? [-T + s, -d + s] : [D + d - s, D + T - s]);
    const shift = side === 'front' ? hd.front : hd.rear;
    const across = nichesOf(I).filter((n) => n.wall === side && cutX > n.at && cutX < n.at + n.width);
    const chase = Math.max(0, ...across.filter((n) => n.use !== 'light').map((n) => n.depth)), light = across.find((n) => n.use === 'light');
    const lamps = light ? lampHeights(S, KV.nicheLightH).map((z) => [z, z + KV.nicheLightH] as const) : [];
    const put = (d: number, s: number, za: number, zb: number): void => {
      const [a, b] = face(d, s);
      out.push(box(a, za, b, zb, 'wall', 'concrete'));
    };
    const piece = (d: number, za: number, zb: number): void => {
      const h0 = Math.max(za, zHead), h1 = Math.min(zb, S.ceiling);
      if (!shift || h1 <= h0) return put(d, 0, za, zb);
      if (h0 > za) put(d, 0, za, h0);
      put(d, shift, h0, h1);
      if (zb > h1) put(d, 0, h1, zb);
    };
    // the wall from za to zb, recessed where a niche is: niches go from the pit floor to the slab, lamps' at the lamps
    const stretch = (za: number, zb: number): void => {
      if (chase > 0 && (za < S.pitFloor || zb > S.ceiling)) {
        const a = Math.max(za, S.pitFloor), b = Math.min(zb, S.ceiling);
        if (za < a) piece(0, za, a);
        if (b > a) stretch(a, b);
        if (zb > b) piece(0, Math.max(b, za), zb);
        return;
      }
      let z = za;
      for (const [l0, l1] of lamps) {
        if (l1 <= z || l0 >= zb || !light) continue;
        if (l0 > z) piece(chase, z, l0);
        piece(Math.max(chase, light.depth), Math.max(z, l0), Math.min(l1, zb));
        z = Math.min(l1, zb);
      }
      if (zb > z + 1) piece(chase, z, zb);
    };
    // the opening in the wall: the door's, its own frame's (frame.ts) or the old one between the marbles round its linings
    const fr = portalOf(I), opening = wallOpeningHeight(I);
    // the openings of the floors drawn shorter too (their doors drawn as a scheme below)
    const gaps = served(side).map((i) => S.levels[i]).filter((z) => inWin(z)).map((z) => [z, z + opening] as const);
    let z = zBot;
    for (const [a, b] of [...gaps, [zTop, zTop] as const]) {
      if (a > z + 1) stretch(z, Math.min(a, zTop));
      z = Math.max(z, b);
    }
    for (const i of served(side)) {
      const zf = S.levels[i];
      if (!inWin(zf)) continue;
      const sh = i === topFloor ? (side === 'front' ? hd.front : -hd.rear) : 0;
      const ext = side === 'front' ? [-T - LANDING_EXT + sh, -T + sh] : [D + T + sh, D + T + LANDING_EXT + sh];
      if (compressed(zf)) {
        out.push(line(P(ext[0], zf), P(ext[1], zf), 'outline'));
        // the landing door as a scheme where the travel is drawn shorter: its sill and its panels up to its clear height
        const s = side === 'front' ? 1 : -1, w0 = side === 'front' ? 0 : D, X = (q: number): number => w0 + s * q, f = landingTracks(I.landingDepth).fast;
        out.push(box(X(-25), zf - 24, X(I.landingDepth), zf, 'outline', 'steel'), box(X(f), zf, X(f + LANDING_PANEL), zf + I.doorHeight, 'thin', 'door'));
      } else {
        out.push(box(ext[0], zf - SLAB, ext[1], zf, 'wall', 'concrete'));
        const s = side === 'front' ? 1 : -1, w0 = side === 'front' ? 0 : D, dl = I.landingDepth, X = (v: number): number => w0 + s * v;
        // Panev's brackets under the sill and over the suspension (section-staffe.ts); the sill's section with a groove
        // under each panel's track, the panels on their tracks, the suspension over them (sill.ts, as the 3D)
        const door = L.doors.find((d) => d.wall === side), grooves = door ? trackPlanes(door, landingTracks(dl), LANDING_PANEL) : [];
        const zh = zf + I.doorHeight, Q = (v: number, z: number): Pt => P(X(v), z), pair = doorPairOf(I);
        const up = served(side).includes(i + 1) ? S.levels[i + 1] : undefined, over = door ? topPairRoom(pair, door, zf, opening - I.doorHeight, up) >= 0 : false;
        out.push(...doorPairSection(pair, dl, zf, Q), ...(over ? doorTopPairSection(pair, dl, zh + HEADER.top, Q) : []));
        // the plate under the sill (toe.ts)
        out.push(...toeSection(I, zf, Q));
        out.push(path(sillSection(-25, dl, grooves, false).map(([v, z]) => P(X(v), zf + z)), true, 'outline', 'steel'));
        for (const g of grooves) out.push(box(X(g - LANDING_PANEL / 2), zf, X(g + LANDING_PANEL / 2), zh, 'thin', 'door'));
        out.push(box(w0 + s * (fr.depth ?? 0), zh + HEADER.foot, w0 + s * (dl + 6), zh + HEADER.top, 'thin'));
        if (opening > I.doorHeight) {
          // the portal's head across the wall, or the door's own frame's header in the shaft against the wall (the
          // suspension behind it); the top lining up to the marble
          const head = zh + fr.head;
          out.push(fr.depth === null ? box(w0 - s * T, zh, w0, head, 'outline', 'steel') : box(w0, zh, w0 + s * fr.depth, head, 'outline', 'steel'));
          if (hasImbotti(I)) out.push(box(w0 - s * T, head, w0, zf + opening, 'outline', 'paper'));
        }
      }
      out.push({ e: 'text', at: P(side === 'front' ? -T - LANDING_EXT + 60 : D + T + LANDING_EXT - 60, zf + 80), text: V.floors[i].label, size: 3, align: side === 'front' ? 'l' : 'r' });
    }
  }
  // break marks where the travel is compressed
  if (v.zmap) for (const z of [v.zmap.z0, v.zmap.z1]) for (const [x0, x1] of [[-T - 60, 60], [D - 60, D + T + 60]]) out.push(...zigzag(P(x0, z), P(x1, z)));

  // pit floor, slab over the shaft, machine room
  if (inWin(S.pitFloor)) out.push(box(-T, S.pitFloor - SLAB, D + T, S.pitFloor, 'wall', 'concrete'));
  // the slab over the shaft reaches the walls where they stand in the headroom too
  const s0 = Math.min(-T, -T + hd.front), s1 = Math.max(D + T, D + T - hd.rear);
  if (I.room && S.ceiling <= v.hi) {
    const r = I.room, top = S.ceiling + r.slab + r.H, ridge = r.ridge ? S.ceiling + r.slab + r.ridge : top;
    const holeX = L.car.y + L.car.h / 2;
    out.push(box(s0, S.ceiling, holeX - 120, S.ceiling + r.slab, 'wall', 'concrete'), box(holeX + 120, S.ceiling, s1, S.ceiling + r.slab, 'wall', 'concrete'));
    // the room's walls up to the roof, or cut where the view ends
    const wallTop = Math.min(ridge, zTop);
    if (wallTop > S.ceiling + r.slab + 1) out.push(box(-T, S.ceiling + r.slab, 0, wallTop, 'wall', 'concrete'), box(D, S.ceiling + r.slab, D + T, wallTop, 'wall', 'concrete'));
    if (ridge <= zTop && top <= v.hi + 1) out.push(box(-T, ridge, D + T, ridge + SLAB, 'wall', 'concrete'));
    if (S.ceiling + r.slab + 250 <= zTop) out.push({ e: 'text', at: P(D / 2, S.ceiling + r.slab + 250), text: 'LOCALE MACCHINA', size: 2.4, align: 'c' });
  } else if (S.ceiling <= v.hi) {
    out.push(box(s0, S.ceiling, s1, S.ceiling + SLAB, 'wall', 'concrete'));
  }

  // rails seen beyond the cut: facing the cut, a rail shows its foot; along it, its side from foot to tip
  const seen = new Set<string>();
  const railBand = (r: Rail): void => {
    const s = RAILS[r.kind === 'car' ? I.carRail : I.cwRail];
    const [a, b] = r.dir === 'back' ? [r.y - s.h, r.y] : r.dir === 'front' ? [r.y, r.y + s.h] : [r.y - s.b / 2, r.y + s.b / 2];
    if (seen.has(`${a}:${b}`)) return;
    seen.add(`${a}:${b}`);
    const z0 = Math.max(zBot, S.pitFloor), z1 = Math.min(zTop, S.ceiling - 60);
    out.push(line(P(a, z0), P(a, z1), 'steel'), line(P(b, z0), P(b, z1), 'steel'));
  };
  for (const r of L.rails) if (r.kind === 'car' || L.cwSide !== 'rear') railBand(r);

  // counterweight where the car's position puts it, and its screen in the pit
  const plate = cwPlateAt(S, S.levels[v.carFloor] ?? 0), cwTop = plate + V.cwH, c = L.cw;
  if (cwTop >= v.lo && plate <= v.hi) {
    out.push(box(c.y, plate, c.y + c.h, cwTop, 'outline', 'cw'));
    for (let z = plate + 150; z < cwTop - 120; z += 120) out.push(line(P(c.y + 18, z), P(c.y + c.h - 18, z), 'fine'));
    out.push(line(P(c.y + c.h / 2, cwTop), P(c.y + c.h / 2, Math.min(S.ceiling, zTop)), 'thin'));
  }
  if (inWin(S.pitFloor)) {
    // seen edge-on in front of a counterweight at the back, face-on across one on a side (screen.ts)
    const sc = cwScreen(L), x0 = L.cwSide === 'rear' ? c.y - 25 : sc.u0, x1 = L.cwSide === 'rear' ? c.y - 15 : sc.u1;
    out.push(box(x0, S.pitFloor + sc.low, x1, S.pitFloor + sc.high, 'hidden'));
  }

  // buffers on their bases where pit.ts puts them (each row of car buffers, the counterweight's), and the space in the pit
  if (inWin(S.pitFloor)) {
    const bp = bufferPlan(L), cwAt = bp.spots.find((b) => b.kind === 'cw')?.c[1] ?? c.y + c.h / 2;
    for (const y of bp.rows) out.push(...buffer(P, y, S.pitFloor, V.carBufferBase, V.carBufferH, bufferType(V, 'car')));
    out.push(...buffer(P, cwAt, S.pitFloor, V.cwBufferBase, V.cwBufferH, bufferType(V, 'cw')));
    const ps = pitSpace(L), h = KV_VERT.refugeH[V.pitRefuge];
    out.push(...cross(P, ps.y0, S.pitFloor, ps.y1, S.pitFloor + h), { e: 'mark', at: P((ps.y0 + ps.y1) / 2 - 80, S.pitFloor + h / 2), sym: 'square' });
    // the access ladder and the pit's control box, the screen's lower edge in the pit's detail (pit-kit.ts, screen.ts)
    if (v.extremes && v.carFloor === 0) out.push(...pitKitSection(L, P, S.pitFloor), ...screenLowDim(L, P, S.pitFloor));
  }

  // the car at its floor; at the top floor also dashed where the counterweight on its buffer lets it go
  const zf = S.levels[v.carFloor] ?? 0;
  if (zf + S.highest >= v.lo && zf - V.frameBelow <= v.hi) out.push(...car(L, P, zf, Math.min(S.ceiling, zTop)));
  if (v.carFloor === V.floors.length - 1 && zf + S.moveUp + S.highest >= v.lo) out.push(...carTopAt(L, P, zf + S.moveUp));
  // the refuge space on the roof where the car stands at its highest position; the car on its compressed buffers in the
  // pit's detail (extremes.ts)
  if (v.carFloor === V.floors.length - 1 && zf + S.moveUp + V.carOutH <= v.hi) out.push(...refugeHigh(L, P, zf + S.moveUp));
  if (v.extremes && v.carFloor === 0 && inWin(S.pitFloor)) out.push(...carLowest(L, P, S));
  const bounds: Box = { x0: -T - LANDING_EXT + Math.min(0, hd.front), y0: Z(zBot), x1: D + T + LANDING_EXT + Math.max(0, -hd.rear), y1: Z(zTop) };
  return { entities: clipBand(out, bounds.y0, bounds.y1), bounds, S };
}

function zigzag(a: Pt, b: Pt): Entity[] {
  const mx = (a[0] + b[0]) / 2, h = 70;
  return [path([a, [mx - 40, a[1]], [mx - 15, a[1] + h], [mx + 15, a[1] - h], [mx + 40, a[1]], b], false, 'thin')];
}

/** Dashed box with its diagonals: a space for the maintenance person. */
function cross(P: (x: number, z: number) => Pt, x0: number, z0: number, x1: number, z1: number): Entity[] {
  return [path([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], true, 'space'), line(P(x0, z0), P(x1, z1), 'space'), line(P(x0, z1), P(x1, z0), 'space')];
}


/** Stiles of the car frame in the section: at the rails' axis, or one at each rail's tip on a cantilever sling. */
export const stilesOf = (L: Layout): number[] =>
  L.frame.kind === 'central' ? [L.frame.axis] : L.rails.filter((r) => r.kind === 'car').map((r) => r.y + (r.dir === 'back' ? 55 : -55));

/** The top of the car dashed at the floor level zf: roof, operators, crosshead, balustrade (its highest position). */
function carTopAt(L: Layout, P: (x: number, z: number) => Pt, zf: number): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, x0 = c.y, x1 = c.y + c.h, roof = zf + V.carOutH, out: Entity[] = [];
  const b = (a0: number, z0: number, a1: number, z1: number): Entity => path([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], true, 'space');
  out.push(line(P(x0, roof), P(x1, roof), 'space'));
  for (const d of L.doors.filter((x) => x.wall === 'front' || x.wall === 'rear')) {
    const front = d.wall === 'front';
    if (V.opTop > V.carOutH + 60) out.push(b(front ? x0 - I.carDoorDepth : x1 - 150, roof + 60, front ? x0 + 150 : x1 + I.carDoorDepth, zf + V.opTop));
  }
  const stiles = stilesOf(L);
  out.push(b(Math.min(...stiles) - KV_VERT.crossheadHalf, zf + V.frameTop - KV_VERT.crossheadH, Math.max(...stiles) + KV_VERT.crossheadHalf, zf + V.frameTop));
  if (V.parapet > 0) {
    const zt = roof + V.parapet;
    out.push(line(P(x0 + 60, zt), P(x1 - 60, zt), 'space'), line(P(x0 + 60, roof), P(x0 + 60, zt), 'space'), line(P(x1 - 60, roof), P(x1 - 60, zt), 'space'));
  }
  return out;
}

/** Car at the floor zf: platform, walls cut at the entrances, roof, doors, operator, frame, balustrade (the refuge space
 *  on the roof is drawn where the car stands at its highest position: extremes.ts). */
function car(L: Layout, P: (x: number, z: number) => Pt, zf: number, ropeTop: number): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, out: Entity[] = [], x0 = c.y, x1 = c.y + c.h, w = I.carWall;
  const b = (a0: number, z0: number, a1: number, z1: number, st: Parameters<typeof rect>[4] = 'thin', fill?: Parameters<typeof rect>[5]): Entity =>
    path([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], true, st, fill);
  out.push(b(x0, zf - V.platform, x1, zf, 'outline', 'car'));
  const front = L.doors.some((d) => d.wall === 'front'), rear = L.doors.some((d) => d.wall === 'rear');
  for (const [a, open] of [[x0, front], [x1 - w, rear]] as const) {
    if (open) {
      out.push(b(a, zf + I.doorHeight, a + w, zf + V.carOutH, 'outline', 'car'));
      // the car sill from the gap to the car's inside, nosing at the gap, the panels on their tracks (sill.ts)
      const fr = a === x0, X = (v: number): number => (fr ? v : I.D - v), v0 = I.landingDepth + I.sillGap, inner = fr ? x0 + w : I.D - (x1 - w);
      const door = L.doors.find((d) => d.wall === (fr ? 'front' : 'rear')), grooves = door ? trackPlanes(door, carTracks(v0), CAR_PANEL) : [];
      out.push(path(sillSection(v0, inner, grooves, true).map(([v, z]) => P(X(v), zf + z)), true, 'outline', 'steel'));
      for (const g of grooves) out.push(b(X(g - CAR_PANEL / 2), zf, X(g + CAR_PANEL / 2), zf + I.doorHeight, 'thin', 'door'));
      // operator over the entrance, on the car roof
      if (V.opTop > V.carOutH + 60) out.push(b(a === x0 ? x0 - I.carDoorDepth : x1 - 150, zf + V.carOutH + 60, a === x0 ? x0 + 150 : x1 + I.carDoorDepth, zf + V.opTop, 'thin'));
    } else {
      out.push(b(a, zf, a + w, zf + V.carOutH, 'outline', 'car'));
    }
  }
  out.push(b(x0, zf + V.carH, x1, zf + V.carOutH, 'outline', 'car'));
  // car frame seen beyond: the stiles, crosshead and safety plank cut
  const stiles = stilesOf(L);
  for (const ax of stiles) {
    out.push(b(ax - 55, zf - V.frameBelow, ax + 55, zf + V.frameTop, 'thin'));
    for (const z of [zf + V.frameTop, zf - V.frameBelow - 90]) out.push(b(ax - 35, z, ax + 35, z + 90, 'thin'));
  }
  const [s0, s1] = [Math.min(...stiles) - KV_VERT.crossheadHalf, Math.max(...stiles) + KV_VERT.crossheadHalf];
  out.push(b(s0, zf + V.frameTop - KV_VERT.crossheadH, s1, zf + V.frameTop, 'outline', 'steel'));
  out.push(b(s0, zf - V.frameBelow, s1, zf - V.frameBelow + 150, 'outline', 'steel'));
  // suspension ropes up to the machine
  if (ropeTop > zf + V.frameTop) out.push(line(P(c.y + c.h / 2, zf + V.frameTop), P(c.y + c.h / 2, ropeTop), 'thin'));
  // balustrade on the roof, seen along its side
  if (V.parapet > 0) {
    const zt = zf + V.carOutH + V.parapet;
    out.push(line(P(x0 + 60, zt), P(x1 - 60, zt), 'outline'), line(P(x0 + 60, zf + V.carOutH), P(x0 + 60, zt), 'outline'), line(P(x1 - 60, zf + V.carOutH), P(x1 - 60, zt), 'outline'));
    out.push(line(P(x0 + 60, zf + V.carOutH + V.parapet / 2), P(x1 - 60, zf + V.carOutH + V.parapet / 2), 'thin'));
  }
  return out;
}
