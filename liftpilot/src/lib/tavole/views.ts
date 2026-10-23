// The views of the drawing set without the paper around them: a plan of the shaft at a level, section A-A whole or in
// a detail, the machine room in plan or in section B-B, each laid out at the largest standard scale that fits an area
// with its dimensions. The sheets add titles, legends and marks; the screens show the views alone.
import { shapeOf } from '@/lib/catalog/shapes';
import { TEXT, boxH, boxW, clipBand, fitView, moveHits, moveShapes, renderView, textWidth, type Box, type Entity, type Hit, type Place, type Shape, type SymbolName, type ViewResult } from '@/drawing';
import { cwGapLabel } from '@/shaft/cw-gap';
import { roomGeo, type MachineSpec, type RoomGeo } from '@/shaft/machine-room';
import { planDims } from '@/shaft/plan-dims';
import { planEntities, wallsAt, type PlanLevel } from '@/shaft/plan-view';
import type { RoomDrawOpts } from '@/shaft/room-draw';
import type { Uplift } from '@/shaft/room-reactions';
import { roomPlanEntities, roomPlanOn, roomSectionEntities, roomSectionOn } from '@/shaft/room-view';
import { section } from '@/shaft/section';
import { sectionDims, type SectionKind } from '@/shaft/section-dims';
import { mapZ, sectionEntities, type SectionView } from '@/shaft/section-view';
import { TAG_SCALE, letteringBoxes } from '@/shaft/tag-place';
import type { Layout } from '@/shaft/types';
import type { RoomDerived } from '../room/derive';
import { bottomGeo, sheaveHalfBelow, type BottomGeo, type BottomScheme } from '../lift/bottom';
import { machineSpec, sheaveAxisBelow } from '../lift/machine';
import { sheetLayout } from '../lift/shaft-rig';
import { belowPlanEntities, belowSectionEntities } from './below-view';
import { headLoads } from './head-loads';
import type { Plant } from '../plant';
import { machineName } from './machine-name';
import type { Analysis } from '../present/analysis';

export const PLAN_SCALES = [20, 25, 50, 100, 200], DETAIL_SCALES = [25, 50, 100, 200];
const SLAB = 220;

export interface View {
  r: ViewResult;
  place: Place;
}

/** A view with the entities it draws (a CAD file of the view takes the same: cad/project.ts). */
export type Placed = View & { entities: Entity[] };

/** Place a view: the largest scale of `scales` that fits, or throw (a drawing that does not fit even at 1:200). */
function placeIn(model: Box, entities: readonly Entity[], area: Box, scales: readonly number[]): Place {
  const p = fitView(model, entities, area, scales);
  if (!p) throw new Error('drawing does not fit on the sheet');
  return p;
}

/** Plan of the shaft at a level; `total` names the level in the overall dimensions (e.g. `in Testata`); `extra`: what
 *  the set draws on it besides, for the scale it is drawn at (the loads on the head of a machine below: headLoadsOf).
 *  The references of the loads are placed for that scale: once more when it is past 1:25 (tag-place.ts). */
export function planView(L: Layout, level: PlanLevel, floor: number, total: string, area: Box, extra: (scale: number) => readonly Entity[] = () => []): Placed {
  const T = L.inputs.wall, B = wallsAt(L, level), dims = planDims(L, level, floor, { level: total });
  const model: Box = { x0: Math.min(0, B.x0) - T, y0: Math.min(0, B.y0) - T, x1: Math.max(L.inputs.W, B.x1) + T, y1: Math.max(L.inputs.D, B.y1) + T };
  // (the references off the dimensions across the plan too)
  const at = (k: number): Entity[] => [...planEntities(L, level, floor, k, letteringBoxes(dims, k)), ...extra(k), ...dims];
  let k = TAG_SCALE, ents = at(k), place = placeIn(model, ents, area, PLAN_SCALES);
  while (place.scale > k) {
    k = place.scale;
    ents = at(k);
    place = placeIn(model, ents, area, PLAN_SCALES);
  }
  return { r: renderView(ents, place), place, entities: ents };
}

/** The top of section A-A over the shaft: `z`, or over a pulley room the pulleys in it (rig-view.ts). */
const overTop = (L: Layout, z: number): number =>
  Math.max(z, ...(L.rig?.scheme === 'room' ? L.rig.head.map((p) => p.z + p.r + 100) : []));

/** The least paper between two floors' levels in section A-A whole [mm]: a floor's number (3 mm) and 1 mm over it; and
 *  past its rise's figure (TEXT.dim), so that each sits in its own segment of the row of rises (dims.ts). */
export const FLOOR_GAP = 4, RISE_PAST = 1;

/** Section A-A whole: the travel between the lowest floor's door and the car at the top floor drawn shorter, so the
 *  rest stays at 1:50 (or the next scale); the machine room as a stub over its floor slab. Each floor drawn stays
 *  readable: where the shortened travel brings two floors closer on paper than FLOOR_GAP or the figure of the rise
 *  between them, the floors of the shortened travel are left out but its first and its last where they read against the
 *  floors next to them (`omit`: the sheet gives their heights in a table, the dimensions their sum). */
function fullSection(L: Layout, area: Box): { v: SectionView; scale: number } {
  const S = section(L), I = L.inputs, V = I.vertical, r = I.room, top = V.floors.length - 1;
  const zTop = overTop(L, r ? S.ceiling + r.slab + 600 : S.ceiling + SLAB), zBot = S.pitFloor - SLAB;
  const z0 = (S.levels[0] ?? 0) + I.doorHeight + 250, z1 = S.top - V.frameBelow - 600, band = z1 - z0;
  const view = (scale: number, omit: readonly number[]): SectionView | null => {
    const room = boxH(area) - 4, fixed = zTop - zBot - Math.max(0, band);
    const f = band > 1000 ? ((room * scale - fixed) / band) * 0.97 : 1;
    if (f < 0.03) return null;
    return { carFloor: top, lo: -Infinity, hi: zTop, zmap: f >= 1 ? null : { z0, z1, f }, scale, ...(omit.length ? { omit } : {}) };
  };
  const fits = (v: SectionView, scale: number): boolean => {
    const { entities, bounds } = sectionEntities(L, v);
    return !!fitView(bounds, [...entities, ...sectionDims(L, S, 'full', v.carFloor, v.zmap, v.omit)], area, [scale]);
  };
  // the floors drawn: each pair apart on paper by FLOOR_GAP and by the figure of the rise between them
  const readable = (v: SectionView, scale: number): boolean => {
    const drawn = S.levels.filter((_, i) => !v.omit?.includes(i));
    return drawn.every((z, i) => {
      if (i === 0) return true;
      const gap = (mapZ(v.zmap, z) - mapZ(v.zmap, drawn[i - 1])) / scale;
      return gap >= Math.max(FLOOR_GAP, textWidth(String(Math.round(z - drawn[i - 1])), { size: TEXT.dim, cond: true }) + RISE_PAST) - 1e-9;
    });
  };
  // at each scale every floor; else the floors of the shortened travel left out, then its first and its last drawn
  // again where they read
  const inside = S.levels.flatMap((z, i) => (z > z0 && z < z1 ? [i] : []));
  for (const scale of [50, 100, 200]) {
    const all = view(scale, []);
    if (!all) continue;
    if (readable(all, scale) && fits(all, scale)) return { v: all, scale };
    let v = view(scale, inside) ?? all;
    for (const i of new Set([inside[0], inside[inside.length - 1]])) {
      const w = view(scale, (v.omit ?? []).filter((j) => j !== i));
      if (i !== undefined && w && readable(w, scale)) v = w;
    }
    if (fits(v, scale)) return { v, scale };
  }
  throw new Error('section A-A does not fit on the sheet');
}

/** Section A-A whole at its real height (no travel drawn shorter), from under the pit to the machine room's stub. */
export function realSection(L: Layout): SectionView {
  const S = section(L), r = L.inputs.room;
  return { carFloor: L.inputs.vertical.floors.length - 1, lo: -Infinity, hi: overTop(L, r ? S.ceiling + r.slab + 600 : S.ceiling + SLAB), zmap: null };
}

/** The heights a detail shows: the headroom with the car at the top floor, the car at a floor, the pit. */
export function detailWindow(L: Layout, kind: SectionKind, floor: number): SectionView {
  const S = section(L), V = L.inputs.vertical, r = L.inputs.room, zf = S.levels[floor] ?? 0, low = S.levels[0] ?? 0;
  // the headroom's and the pit's details show the car at its extreme positions too (extremes.ts)
  if (kind === 'top') return { carFloor: floor, lo: zf - V.frameBelow - 400, hi: overTop(L, r ? S.ceiling + r.slab + 500 : S.ceiling + SLAB), zmap: null, extremes: true };
  if (kind === 'pit') return { carFloor: floor, lo: S.pitFloor - SLAB, hi: low + S.highest + 500, zmap: null, extremes: true };
  const nearPit = zf - low <= 2600;
  return { carFloor: floor, lo: nearPit ? S.pitFloor - SLAB : zf - V.frameBelow - 700, hi: zf + S.highest + 600, zmap: null };
}

/** What section A-A draws of the heights `v` shows: the section, its dimensions for `kind` (those, too, only where the
 *  view shows the heights they measure: clipBand) and, where the pit is shown (whole or its detail), `cwGap` — the
 *  clearance on the counterweight's sign sheet 1 gives — on the screen (cw-gap.ts). The sheets and the CAD files alike
 *  (cad/project.ts: section A-A whole at its real height). */
export function sectionParts(L: Layout, kind: SectionKind, v: SectionView, cwGap: number | null): { entities: Entity[]; bounds: Box } {
  // (the dimensions first: the pit kit's heights keep off their lettering, the sign off all the view letters)
  const k = v.scale ?? TAG_SCALE, dims = sectionDims(L, section(L), kind, v.carFloor, v.zmap, v.omit);
  const { entities, bounds, S, kit } = sectionEntities(L, { ...v, avoid: letteringBoxes(dims, k) }), ents = [...entities, ...clipBand(dims, bounds.y0, bounds.y1)];
  if (cwGap !== null && (kind === 'full' || kind === 'pit')) ents.push(...cwGapLabel(L, S, (x, z) => [x, mapZ(v.zmap, z)], cwGap, letteringBoxes(ents, k), k, letteringBoxes(kit, k)));
  return { entities: ents, bounds };
}

/** The symbols the entities place (a legend shows those). */
export const marksOf = (ents: readonly Entity[]): SymbolName[] => [...new Set(ents.flatMap((e) => (e.e === 'mark' ? [e.sym] : [])))];

/** Section A-A: whole (`full`, car at the top floor) or a detail with the car at `floor`; `cwGap` as `sectionParts`
 *  writes it. With the symbols it places and whether the travel is drawn shorter. */
export function sectionView(L: Layout, kind: SectionKind, floor: number, area: Box, cwGap: number | null = null): Placed & { marks: SymbolName[]; compressed: boolean; omit: readonly number[] } {
  const { v: v0, scale } = kind === 'full' ? fullSection(L, area) : { v: detailWindow(L, kind, floor), scale: 0 };
  let v = v0, { entities: ents, bounds } = sectionParts(L, kind, v, cwGap), place = placeIn(bounds, ents, area, scale ? [scale] : DETAIL_SCALES);
  // (a detail past 1:25 lettered once more for the scale it takes)
  while (!scale && place.scale > (v.scale ?? TAG_SCALE)) {
    v = { ...v, scale: place.scale };
    ({ entities: ents, bounds } = sectionParts(L, kind, v, cwGap));
    place = placeIn(bounds, ents, area, DETAIL_SCALES);
  }
  return { r: renderView(ents, place), place, entities: ents, marks: marksOf(ents), compressed: v.zmap !== null, omit: v.omit ?? [] };
}

// the machine's name on the sheets (machine-name.ts: pure, for the forms too)
export { machineConflict, machineName, machineText } from './machine-name';

/** The machine as the calculation describes it (its mass the calculation's; its name the catalogue's, else as the data of
 *  the installation write it), on the room's support: the maker's as it is when the proposal took one from a catalogue
 *  (`catalog` of the marks; its bedplate with the diverting pulley), else the generic machine. */
export function machineOf(a: Analysis, plant: Plant, L: Layout, catalog: { brand: string; model: string } | null = null): MachineSpec {
  return machineSpec(a.ctx, a.ctx.N.mass, machineName(plant, catalog), L.inputs.room, catalog ? shapeOf(catalog.brand, catalog.model) : null, catalog);
}

/** A machine room's view as the sheet takes it, at 1:25 when it can be had: the plan with its door open outward, or
 *  shut in its frame when the swing alone would cost it that scale, its names placed for the scale it takes; section
 *  B-B as it is, else with the door's and the panel's heights in one row, else with its dimensions placed for the scale
 *  it takes (kept on paper). The entities drawn go with it (a CAD file of the view takes the same). */
type Drawn = { entities: Entity[]; bounds: Box };
function roomPlaced(drawOn: (o: RoomDrawOpts) => Drawn, kind: 'plan' | 'section', area: Box): Placed {
  // (the paper the view has: what is set outside the drawing keeps to it — round 37 review)
  const draw = (o: RoomDrawOpts): Drawn => drawOn({ ...o, paper: { w: boxW(area), h: boxH(area) } });
  let opts: RoomDrawOpts = {}, d = draw(opts), place = placeIn(d.bounds, d.entities, area, DETAIL_SCALES);
  const best = DETAIL_SCALES[0], next = (o: RoomDrawOpts, keep: boolean): void => {
    const e = draw(o), p = placeIn(e.bounds, e.entities, area, DETAIL_SCALES);
    if (keep || p.scale < place.scale) [d, place, opts] = [e, p, o];
  };
  if (place.scale !== best) next(kind === 'plan' ? { closedDoor: true } : { compact: true }, kind === 'section');
  // (the plan's drops inside the shaft when their row outside costs the scale, round 36)
  if (kind === 'plan' && place.scale !== best) next({ closedDoor: true, dropsInside: true }, false);
  if (kind === 'section' && place.scale !== best) next({ compact: true, scale: place.scale }, true);
  // (the plan's names and references kept clear at the scale it takes — its lettering is as large on paper, round 37)
  if (kind === 'plan' && place.scale !== best) next({ ...opts, scale: place.scale }, true);
  return { r: renderView(d.entities, place), place, entities: d.entities };
}

/** The machine room in plan or in section B-B; null when the design has no machine room. `uplift`: the bearings pulled
 *  up at sheet 1's load (data.ts), whose anchors in tension section B-B asks for. */
export function roomView(L: Layout, M: MachineSpec, kind: 'plan' | 'section', area: Box, uplift: readonly Uplift[] = []): (Placed & { G: RoomGeo }) | null {
  const G = roomGeo(L, M);
  if (!G) return null;
  return { ...roomPlaced((o) => (kind === 'plan' ? roomPlanEntities(L, M, G, o) : roomSectionEntities(L, M, G, o, uplift)), kind, area), G };
}

/** The layout the shaft's sheets draw of the design `L` for the calculation `a` and its machine `M` (the machine below's
 *  geometry `g`): the lift's rope rig in the shaft and the room over it it has (lib/lift/shaft-rig.ts sheetLayout). */
export const sheetLayoutOf = (a: Analysis, L: Layout, M: MachineSpec, g: BottomGeo | null): Layout => sheetLayout(L, a.ctx.I.r, a.ctx.I.Dp, M.n, M.d, g);

/** The geometry of the machine below for the calculation's machine (the 3D's: bottom.ts). */
export const belowGeoOf = (a: Analysis, L: Layout, M: MachineSpec, scheme: BottomScheme): BottomGeo =>
  bottomGeo(L, scheme, M.D, a.ctx.I.Dp, M.n, M.d, a.ctx.I.r, sheaveAxisBelow(M.D, M.shape ?? null), sheaveHalfBelow(M.D, M.n, M.d, M.shape ?? null));

/** The loads on the head of the shaft of a machine below for the calculation's machine, on the plan at the top floor
 *  drawn at `scale` (head-loads.ts). */
export const headLoadsOf = (a: Analysis, L: Layout, M: MachineSpec, g: BottomGeo, scale: number = TAG_SCALE): Entity[] => headLoads(L, g, a.ctx.I.r, a.ctx.I.Dp, M.n, M.d, scale);

/** The machine's room with the machine below, in plan or in section C-C (below-view.ts). */
export function belowView(L: Layout, M: MachineSpec, g: BottomGeo, kind: 'plan' | 'section', area: Box): Placed {
  // the plan keeps its names clear of each other at the scale it is drawn at: placed once more when that is not 1:25 —
  // first with its door shut in its frame, when the swing alone costs it that scale
  const at = (s: number, shut = false) => (kind === 'plan' ? belowPlanEntities(L, M, g, s, shut) : belowSectionEntities(L, M, g));
  let { entities, bounds } = at(DETAIL_SCALES[0]), place = placeIn(bounds, entities, area, DETAIL_SCALES);
  if (kind === 'plan' && place.scale !== DETAIL_SCALES[0]) {
    const shut = at(DETAIL_SCALES[0], true), p = placeIn(shut.bounds, shut.entities, area, DETAIL_SCALES);
    ({ entities, bounds } = p.scale < place.scale ? (p.scale === DETAIL_SCALES[0] ? shut : at(p.scale, true)) : at(place.scale));
    place = placeIn(bounds, entities, area, DETAIL_SCALES);
  }
  return { r: renderView(entities, place), place, entities };
}

/** The machine room of a replacement (its survey) in plan or in section B-B, the machine `M` (the derived one, or the
 *  same with the name the data of the installation give it); null with the machine below. */
export function surveyView(d: RoomDerived, kind: 'plan' | 'section', area: Box, M = d.M): (Placed & { G: RoomGeo }) | null {
  const G = d.G;
  if (!G) return null;
  return { ...roomPlaced((o) => (kind === 'plan' ? roomPlanOn(d.site, M, G, o) : roomSectionOn(d.site, M, G, o)), kind, area), G };
}

/** A view cropped to its extent with a margin, for the screens: shapes in a box w × h [mm], the scale, the editable
 *  dimensions. */
export function cropped(v: View, pad = 3): { shapes: Shape[]; w: number; h: number; scale: number; hits: Hit[] } {
  const e = v.r.extent, dx = pad - e.x0, dy = pad - e.y0;
  return { shapes: moveShapes(v.r.shapes, dx, dy), w: e.x1 - e.x0 + 2 * pad, h: e.y1 - e.y0 + 2 * pad, scale: v.place.scale, hits: moveHits(v.r.hits, dx, dy) };
}

/** Section A-A whole for the screens; null when it does not fit even at 1:200 (the plan is shown alone). */
function sectionPreview(L: Layout): ReturnType<typeof cropped> | null {
  try {
    return cropped(sectionView(L, 'full', L.inputs.vertical.floors.length - 1, { x0: 0, y0: 0, x1: 130, y1: 260 }));
  } catch {
    return null;
  }
}

export type ScreenView = 'plan' | 'head' | 'pit-plan' | SectionKind | 'room-plan' | 'room-section' | 'below-plan' | 'below-section';

/** A machine below as the screens draw its room: the machine, the calculation it comes from, the rope scheme. */
export interface BelowSource {
  machine: MachineSpec;
  analysis: Analysis;
  scheme: BottomScheme;
}

/** One view for the screens that change the design: the plan at the main floor, at the top floor and in the headroom
 *  (its walls where they stand there) or at the lowest floor and in the pit (the buffers and the refuge space), section
 *  A-A whole or a detail (the headroom, the car at the main floor, the pit), the machine room in plan or in section B-B
 *  (with a machine), the room of a machine below in plan or in section C-C (`below`); null when it cannot be drawn. */
export function screenView(L: Layout, v: ScreenView, M: MachineSpec | null, below: BelowSource | null = null): ReturnType<typeof cropped> | null {
  const V = L.inputs.vertical, top = V.floors.length - 1, main = Math.min(V.main, top), area: Box = { x0: 0, y0: 0, x1: 190, y1: 190 };
  try {
    if (v === 'plan') return cropped(planView(L, 'main', main, `piano "${V.floors[main]?.label ?? ''}"`, area));
    if (v === 'head') return cropped(planView(L, 'top', top, 'in Testata', area));
    if (v === 'pit-plan') return cropped(planView(L, 'pit', 0, `piano "${V.floors[0]?.label ?? ''}" e in Fossa`, area));
    if (v === 'room-plan' || v === 'room-section') {
      const r = M ? roomView(L, M, v === 'room-plan' ? 'plan' : 'section', area) : null;
      return r ? cropped(r) : null;
    }
    if (v === 'below-plan' || v === 'below-section') {
      const B = below;
      return B ? cropped(belowView(L, B.machine, belowGeoOf(B.analysis, L, B.machine, B.scheme), v === 'below-plan' ? 'plan' : 'section', area)) : null;
    }
    return cropped(sectionView(L, v, v === 'floor' ? main : v === 'pit' ? 0 : top, v === 'full' ? { x0: 0, y0: 0, x1: 130, y1: 260 } : area));
  } catch {
    return null;
  }
}

/** The plan at the main floor and section A-A of a design, as the designer and the design page show them. */
export function previews(L: Layout): { plan: ReturnType<typeof cropped>; section: ReturnType<typeof cropped> | null } {
  const V = L.inputs.vertical, main = Math.min(V.main, V.floors.length - 1);
  const plan = cropped(planView(L, 'main', main, `piano "${V.floors[main]?.label ?? ''}"`, { x0: 0, y0: 0, x1: 190, y1: 190 }));
  return { plan, section: sectionPreview(L) };
}
