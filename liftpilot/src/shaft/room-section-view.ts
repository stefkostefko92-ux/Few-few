// Section B-B of the machine room along the rope drops (room-view.ts draws its plan): the floor slab over the shaft with
// its openings, walls and roof, the machine on its support (support-view.ts), the pulley, the ropes as they run halfway
// through the travel; its dimensions. Model entities for the drawing kernel.
import { chain, edit as E, line, path, rect, union, type Box, type Entity, type Pt } from '../drawing';
import { ownAxis } from './support';
import { rinvioHEdit } from './rinvio-view';
import { bedplateLegs, rinvioRun } from './rinvio';
import { hebDrawn } from './heb';
import { supportSection } from './support-view';
import { MACHINE_A, machineElevation } from './machine-outline';
import { bodyBox } from './machine-shape';
import { shapeElevation } from './machine-shape-view';
import { dropSpan as span, machineRun, machineU, roomRopes, supportRunIn, type MachineSpec, type RoomGeo } from './machine-room';
import { WALL, holesOf, onDrop, type RoomDrawOpts } from './room-draw';
import type { RoomSite } from './room-site';
import { pulleySection } from './room-pulley';
import { columns } from './section-columns';
import { KV_VERT } from './norme-vert';
import { hookOf } from './room-hook';
import { aboveSection, hitchesSection, hookSection, kerbDim, kerbsSection, notesSection, outsideSection, seenFittings } from './room-section-extra';
import { hebNote } from './heb-view';
import { mountsLines } from './room-mounts';
import { AT, takenBy } from './room-label';
import { foundGaps, foundSection } from './room-section-found';

/** Section B-B along the rope drops: X is u along the drop line, Z the height above the room floor. `o`: the door's and
 *  the panel's heights in one row, the dimensions placed for another scale than 1:25 (views.ts, to keep the section at
 *  its plan's scale). */
export function roomSectionOn(S: RoomSite, M: MachineSpec, G: RoomGeo, o: RoomDrawOpts = {}): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], sk = (o.scale ?? 25) / 25;
  const [r0, r1] = span(G, 0, 0, R.W, R.D), [s0, s1] = span(G, R.shaftX, R.shaftY, R.shaftX + S.W, R.shaftY + S.D);
  const top = R.H, ridge = R.ridge > 0 ? R.ridge : R.H, midU = (r0 + r1) / 2, below = 1300 * sk, foot = -R.slab - below;
  // floor slab over the shaft, open where the ropes and a pulley go through and where the cut crosses an existing
  // opening a survey found (round 37); the shaft's walls under it
  let u = r0 - WALL;
  for (const [a, b] of [...holesOf(S, M, G).map((h): [number, number] => [h.u0, h.u1]), ...foundGaps(S, G)].sort((p, q) => p[0] - q[0])) {
    if (a > u) out.push(rect(u, -R.slab, a, 0, 'wall', 'concrete'));
    u = Math.max(u, b);
  }
  if (r1 + WALL > u) out.push(rect(u, -R.slab, r1 + WALL, 0, 'wall', 'concrete'));
  for (const x of [s0 - S.wall, s1]) out.push(rect(x, foot, x + S.wall, -R.slab, 'wall', 'concrete'));
  out.push(line([s0, foot], [s1, foot], 'axis'));
  // walls and roof: where the cut goes through the door's opening, only the lintel over it cut, the jambs seen beyond
  out.push(...[[r0, r0 - WALL, r0, -1], [r1, r1, r1 + WALL, 1]].flatMap(([e, x0, x1, sg]) => (throughDoor(G, e, sg)
    ? [rect(x0, Math.min(R.doorH, top), x1, top, 'wall', 'concrete'), rect(x0, 0, x1, Math.min(R.doorH, top), 'thin')] : [rect(x0, 0, x1, top, 'wall', 'concrete')])));
  if (ridge > top) {
    out.push(path([[r0 - WALL, top], [midU, ridge], [r1 + WALL, top], [r1 + WALL, top + WALL], [midU, ridge + WALL], [r0 - WALL, top + WALL]], true, 'wall', 'concrete'));
  } else out.push(rect(r0 - WALL, top, r1 + WALL, top + WALL, 'wall', 'concrete'));
  // the door and the panel where the view sees them, under the machine drawn next; the openings' upstands (round 36)
  const fit = seenFittings(G, r0, r1);
  out.push(...fit.entities, ...kerbsSection(S, M, G));
  // the machine on its support (shims, frame, beams, plates or plinth), its sheave's axis at the height the
  // calculation counts
  const k = 1000 * G.s, F = G.frame, base = F.shape ? M.axis - F.axis : M.axis - MACHINE_A.yWheel * k, zs = M.axis, D = M.D, rf = M.rinvio ?? null;
  // the pulley's h right of it and of the frames, nearest to them (on the bedplate of the pulley, past it); the support's
  // own heights beyond it
  // (kept 150 off the wall, not on its face, as long as the room allows)
  const bedRun = rf?.on === 'frame' && M.Dp > 0 && G.pulleyZ - M.Dp / 2 >= 0 ? rinvioRun(M, G) : null;
  const near = Math.max(G.pulleyAt + M.Dp / 2, G.frame1, bedRun ? bedRun[1] : -Infinity);
  const ue = Math.max(Math.min(near + (bedRun ? 300 : 160) * sk, r1 - 150 * sk), near + 60 * sk), hChain = M.Dp > 0 && Math.abs(M.h) > 1;
  const heb = hebDrawn(G, M, S, S.govRopes);
  out.push(...supportSection(M, G, r0, r1, hChain ? ue : null, heb, sk, S.kept ?? null));
  // (turned round, the machine seen from its other side: its elevation mirrored along the drop line)
  out.push(...(F.shape ? shapeElevation(F, D, (x, y) => [machineU(G, x), base + y]) : machineElevation((x, y) => [machineU(G, x * k), base + y * k])));
  const centre = (c: Pt, r: number): void => { out.push(line([c[0] - r - 40, c[1]], [c[0] + r + 40, c[1]], 'axis'), line([c[0], c[1] - r - 40], [c[0], c[1] + r + 40], 'axis')); };
  centre([G.sheaveAt, zs], D / 2);
  // the ropes as they run with the car halfway, cut at the drawing's foot; the pulley in the bedplate (drawn with it), on
  // its stand, or — an h entered by hand that takes it under the floor (an issue of the form) — hung under the slab; the
  // dead ends of a 2:1 roping
  // (cut over the band of the dimensions at the foot, which they would cross)
  const [carD, cwD] = S.mid, ropeFoot = foot + 620 * sk;
  for (const [p, q] of roomRopes(M, G, carD, cwD)) {
    if (p[1] < ropeFoot && q[1] < ropeFoot) continue;
    const cut = (a: readonly [number, number], b: readonly [number, number]): Pt => (a[1] >= ropeFoot ? [a[0], a[1]] : [a[0] + ((b[0] - a[0]) * (ropeFoot - a[1])) / (b[1] - a[1]), ropeFoot]);
    out.push(line(cut(p, q), cut(q, p), 'thin'));
  }
  if (M.Dp > 0) out.push(...pulleySection(M, G, s0, s1));
  // a 2:1 roping's hitches under the slab, where they stand along the drop line, with P2 and P3 (round 36)
  out.push(...hitchesSection(G, ropeFoot, sk));
  // dimensions and references: the axis' height, the pulley's h and dx as the calculation takes them
  out.push(chain({ dir: 'y', pts: [-R.slab, 0, top], side: 'left', row: 0, text: ['{v} Soletta', '{v} H. Locale'], edit: [E('room.slab'), E('room.H')] }));
  if (ridge > top) out.push(chain({ dir: 'y', pts: [0, ridge], side: 'left', row: 1, text: ['{v} H. Colmo'], edit: [E('room.ridge')] }));
  // what the machine takes in the section along u with its support, its bedplate and the pulley (the panel's height
  // and the mounts' lettering keep off it)
  const span0 = supportRunIn(G, M), run = span0 ? machineRun(G, span0[0], span0[1]) : null, ends = [...(run ? [run] : []), ...(bedRun ? [bedRun] : [])];
  const held = [G.frame0, G.frame1, ...ends.flat(), ...(M.Dp > 0 ? [G.pulleyAt - M.Dp / 2, G.pulleyAt + M.Dp / 2] : [])];
  const machineTop = Math.max(zs + D / 2, ...(M.Dp > 0 ? [G.pulleyZ + M.Dp / 2] : [])), machineArea: Box = { x0: Math.min(...held) - 60, y0: -R.slab, x1: Math.max(...held) + 60, y1: machineTop + 60 };
  // the door's and the panel's heights from the floor on the side the view sees each (none seen: the plan gives it),
  // each in its row past the room's own there; compact, two on one side in one (the higher's value written whole,
  // typed whole when changed), on opposite sides the panel's in the room by its outline, clear of the machine and of the
  // upright chains (round 36 review: not across the sheave), else on the left in the room's own height (the rows kept)
  const rows = { left: ridge > top ? 2 : 1, right: 0 }, ps = fit.panelSpan;
  const inside = o.compact === true && fit.door !== null && fit.panel !== null && fit.door !== fit.panel && ps !== null;
  const heights = [{ h: R.doorH, key: 'room.doorH', name: 'H. Porta', side: fit.door }, { h: R.panelH, key: 'room.panelH', name: 'H. Quadro', side: inside ? null : fit.panel }];
  for (const side of ['left', 'right'] as const) {
    const [lo, hi] = heights.filter((x) => x.side === side).sort((a, b) => a.h - b.h);
    if (lo && hi && o.compact === true && lo.h < hi.h) {
      out.push(chain({ dir: 'y', pts: [0, lo.h, hi.h], side, row: rows[side]++, text: [`{v} ${lo.name}`, `${hi.h} ${hi.name}`], edit: [E(lo.key), { ...E(hi.key), value: hi.h }] }));
    } else for (const x of [lo, hi]) if (x) out.push(chain({ dir: 'y', pts: [0, x.h], side, row: rows[side]++, text: [`{v} ${x.name}`], edit: [E(x.key)] }));
  }
  // the sheave's axis: the support's height takes the change (the machine's own height and the HEB beams under
  // the support stay)
  const hb = M.base ?? 0, axisEdit = rf?.on === 'frame' ? (rf.maker ? null : E('rinvio.height', -F.axis - hb)) : E('sup.height', -(ownAxis(D, F.shape) + hb));
  // (on the bedplate of the pulley, left of its two heights; the h of the pulley right of its legs)
  out.push(chain({ dir: 'y', pts: [0, zs], at: bedRun ? Math.min(G.frame0 - 120 * sk, bedRun[0] - 620 * sk) : G.frame0 - 120 * sk, from: [null, G.sheaveAt], text: ['Asse {v}'],
    edit: [axisEdit] }));
  if (M.Dp > 0) {
    const low = G.pulleyZ < zs;
    const left = G.sheaveAt < G.pulleyAt;
    // the pulley's height below the sheave is the calculation's h; its distance dx follows the rope drop
    // on the bedplate whose h the calculation took, a change of h is a change of the bedplate's top; on its own stand,
    // of the machine's support (the pulley's axis stays where the stand has it)
    const standH = E('sup.height', G.pulleyZ - ownAxis(D, F.shape) - hb, low ? 1 : -1);
    const hEdit = rf?.auto ? (rf.on === 'frame' ? (low ? rinvioHEdit(M, rf) : null) : standH) : S.calcEdits ? E('calc.h', 0, low ? 1 : -1) : null;
    if (hChain) out.push(chain({ dir: 'y', pts: low ? [G.pulleyZ, zs] : [zs, G.pulleyZ], at: ue, from: low ? [G.pulleyAt, G.sheaveAt] : [G.sheaveAt, G.pulleyAt], text: ['h {v}'], edit: [hEdit] }));
    const less = 2 * M.ropeIn + M.D / 2 + (M.reverse ? -M.Dp / 2 : M.Dp / 2);
    // over the room, nearest to it: the frames' lengths in the rows beyond
    out.push(chain({ dir: 'x', pts: left ? [G.sheaveAt, G.pulleyAt] : [G.pulleyAt, G.sheaveAt], side: 'top', row: 0, from: left ? [zs, G.pulleyZ] : [G.pulleyZ, zs], text: ['dx {v}'],
      edit: [left ? S.calata(less, false, true) : null] }));
  }
  // the bedframe's length over the room, from its ends (none on a bedplate's irons or the maker's pedestal); the rope
  // drop between the ropes' axes in the shaft
  if (F.on === 'frame') out.push(chain({ dir: 'x', pts: [G.frame0, G.frame1], side: 'top', row: M.Dp > 0 ? 1 : 0, from: [base, base], text: ['{v} Telaio argano'] }));
  out.push(chain({ dir: 'x', pts: [0, G.calata], at: foot + 160 * sk, from: [ropeFoot, ropeFoot], axis: [true, true], text: ['{v} Calata Funi (Rif.)'], edit: [S.calata(0, false, true)] }));
  const along = Math.abs(G.uy) > 0.999 ? 'D' : Math.abs(G.ux) > 0.999 ? 'W' : null;
  // (askew, the shaft cut on the slant: a reference, no one input of the shaft gives it)
  out.push(chain({ dir: 'x', pts: [s0, s1], at: foot + 420 * sk, text: [along ? 'Vano {v}' : 'Vano {v} (Rif.)'], edit: [along ? E(along) : null] }));
  // the sheave's diameter with its leader to the rim, on the side away from the motor
  const away = -G.dir, rim: Pt = [G.sheaveAt + away * (D / 2) * Math.SQRT1_2, zs + (D / 2) * Math.SQRT1_2], tag: Pt = [G.sheaveAt + away * (D / 2 + 40 * sk), zs + D / 2 + 60 * sk];
  out.push(line([tag[0] - away * 10 * sk, tag[1] + 20 * sk], rim, 'dim'), { e: 'text', at: tag, text: `Ø${M.D}`, size: 2.2, align: away < 0 ? 'r' : 'l', halo: true });
  const body = F.shape ? bodyBox(F.shape) : null, um = machineU(G, body ? (body[0] + body[3]) / 2 : 0.53 * k);
  out.push({ e: 'tag', at: [um, top - 350 * sk], text: 'P1', to: [um, body ? base + F.bed + 0.9 * body[4] : base + 0.55 * k] });
  out.push({ e: 'text', at: [(s0 + s1) / 2, foot - 250 * sk], text: 'VANO', size: 2.2, align: 'c' });
  // the upright chains beside the machine where they fit in the room, else outside it past the rows there
  columns(out, { x0: r0, y0: 0, x1: r1, y1: top }, { left: Math.min(...held), right: Math.max(...held) }, ends, sk, rows);
  // (after them, not set again with them: the panel's height by its outline, the upstand's height)
  if (inside && ps && fit.panel) {
    const at = panelSpot(out, ps, machineArea, [r0, r1], sk), from = at === null ? 0 : Math.min(Math.max(at, ps[0]), ps[1]), i = out.findIndex((e) => e.e === 'chain' && e.c.side === 'left' && e.c.row === 0);
    const text = '{v} H. Quadro', panelH = E('room.panelH');
    if (at !== null) out.push(chain({ dir: 'y', pts: [0, R.panelH], at, from: [from, from], text: [text], edit: [panelH] }));
    else if (fit.panel === 'left' && R.panelH < top && i >= 0) {
      out[i] = chain({ dir: 'y', pts: [-R.slab, 0, R.panelH, top], side: 'left', row: 0, text: ['{v} Soletta', text, `${top} H. Locale`], edit: [E('room.slab'), panelH, { ...E('room.H'), value: top }] });
    } else {
      const taken = out.flatMap((e) => (e.e === 'chain' && e.c.side === fit.panel && e.c.row !== undefined ? [e.c.row + 1] : []));
      out.push(chain({ dir: 'y', pts: [0, R.panelH], side: fit.panel, row: Math.max(rows[fit.panel], ...taken), text: [text], edit: [panelH] }));
    }
  }
  out.push(...kerbDim(S, M, G, out, r0, r1, sk));
  // the hook over the machine with its rated load, the free height over the rotating parts; the mounts and the
  // fixings named (round 36)
  const hook = hookOf(G, M, S.pieces ?? []);
  out.push(...aboveSection(G, M, hook.u, sk));
  // the existing openings the cut crosses, named under the slab (the hook's name and the notes keep off them)
  out.push(...foundSection(S, G, out, sk));
  // (outside the drawing, under its foot or right of the room, as much as the paper leaves at this scale — round 37)
  const bounds0: Box = { x0: r0 - WALL, y0: foot, x1: r1 + WALL, y1: Math.max(top, ridge) + WALL }, outside = outsideSection(out, bounds0, AT * sk, o.paper);
  const named = hookSection(G, hook, out, { r0, r1 }, outside, sk, [machineArea]);
  out.push(...named);
  const under: Box = { x0: s0 - S.wall, y0: -R.slab - below, x1: s1 + S.wall, y1: -R.slab };
  // (to a mount: under the first leg of the bedplate with the pulley — where the drawing stands it, on the HEB beams where
  // its sides cross them (rinvio.ts bedplateLegs) —, else under the machine's bedplate)
  const legs = rf?.on === 'frame' && M.Dp > 0 ? bedplateLegs(G, M, heb) : [], firstLeg = legs.length ? Math.min(...legs.map(([u]) => u)) : null;
  const mountAt: Pt = rf?.on === 'frame' && M.Dp > 0 ? [firstLeg ?? rinvioRun(M, G)[0] + KV_VERT.rinvioLeg / 2, (rf.base ?? 0) + KV_VERT.rinvioPads / 2] : [G.frame0 + 60 * sk, base - 10];
  // the notes in words: the mounts and fixings (on a replacement's existing support kept; the anchors in tension of the
  // bearings pulled up, as sheet 1 has them), then the HEB beams' bearings — off the machine, the shaft under the slab
  // and the hatched walls (round 37: placed as drawn, at TEXT.min)
  const walls = out.flatMap((e): Box[] => (e.e === 'path' && e.fill === 'concrete' ? [{ x0: Math.min(...e.pts.map((p) => p[0])), y0: Math.min(...e.pts.map((p) => p[1])), x1: Math.max(...e.pts.map((p) => p[0])), y1: Math.max(...e.pts.map((p) => p[1])) }] : []));
  const notes = [{ text: mountsLines(G, M, { kept: S.kept, uplift: S.uplift }).join(' '), to: mountAt }, ...(heb ? [hebNote(heb, G)] : [])];
  const noted = notesSection(G, notes, out, [machineArea, under, ...walls], { r0, r1, low: 140 * sk, foot }, outside, sk);
  out.push(...noted);
  // (a note or the hook's name set outside the drawing — under its foot, right of the room — widens what the sheet
  // places, round 37 review)
  return { entities: out, bounds: takenBy([...named, ...noted], AT * sk).reduce(union, bounds0) };
}

/** Where the panel's height stands in compact section B-B: the line in the room nearest the panel's outline `ps` (u)
 *  whose lettering (left of it) keeps off the machine `busy` and off the upright chains of `out`, within the room's
 *  walls `rw`; null: none. */
function panelSpot(out: readonly Entity[], ps: readonly [number, number], busy: Box, rw: readonly [number, number], sk: number): number | null {
  const [r0, r1] = rw, band = (at: number): [number, number] => [at - 110 * sk, at + 30 * sk];
  const lines = out.flatMap((e) => (e.e === 'chain' && e.c.dir === 'y' && !e.c.side && e.c.at !== undefined && !e.c.on ? [band(e.c.at)] : []));
  const clear = (at: number): boolean => {
    const [a, b] = band(at);
    return a > r0 + 20 * sk && b < r1 - 20 * sk && (b < busy.x0 || a > busy.x1) && lines.every(([p, q]) => b < p || a > q);
  };
  const off = (at: number): number => Math.min(Math.abs(at - ps[0]), Math.abs(at - ps[1]));
  const tries = Array.from({ length: 200 }, (_, k) => [ps[0] - 70 * sk - k * 20 * sk, ps[1] + 70 * sk + k * 20 * sk]).flat();
  return tries.sort((p, q) => off(p) - off(q)).find(clear) ?? null;
}

/** Where the section's cut at u = e leaves the room (`sg` −1 at its start, 1 at its end) through the door's opening:
 *  on the door's wall, within the opening on both the wall's faces. */
function throughDoor(G: RoomGeo, e: number, sg: number): boolean {
  const R = G.room, p = onDrop(G, e, 0);
  const wall = Math.abs(p[1]) < 1 ? 'front' : Math.abs(p[1] - R.D) < 1 ? 'rear' : Math.abs(p[0]) < 1 ? 'left' : Math.abs(p[0] - R.W) < 1 ? 'right' : null;
  if (wall !== R.doorWall) return false;
  const level = wall === 'front' || wall === 'rear', across = Math.abs(level ? G.uy : G.ux);
  if (across < 1e-9) return false;
  const outer = onDrop(G, e + (sg * WALL) / across, 0), at = (q: Pt): number => (level ? q[0] : q[1]);
  return [p, outer].every((q) => at(q) > R.doorAt && at(q) < R.doorAt + R.doorW);
}
