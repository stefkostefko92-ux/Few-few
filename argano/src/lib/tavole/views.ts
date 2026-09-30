// The views of the drawing set without the paper around them: a plan of the shaft at a level, section A-A whole or in
// a detail, the machine room in plan or in section B-B, each laid out at the largest standard scale that fits an area
// with its dimensions. The sheets add titles, legends and marks; the screens show the views alone.
import { boxH, fitView, moveShapes, renderView, type Box, type Entity, type Place, type Shape, type ViewResult } from '@/drawing';
import { roomGeo, type MachineSpec, type RoomGeo } from '@/shaft/machine-room';
import { planDims } from '@/shaft/plan-dims';
import { planEntities, type PlanLevel } from '@/shaft/plan-view';
import { roomPlanEntities, roomSectionEntities } from '@/shaft/room-view';
import { section } from '@/shaft/section';
import { sectionDims, type SectionKind } from '@/shaft/section-dims';
import { sectionEntities, type SectionView } from '@/shaft/section-view';
import type { Layout } from '@/shaft/types';
import type { Plant } from '../plant';
import type { Analysis } from '../present/analysis';

export const PLAN_SCALES = [20, 25, 50, 100, 200], DETAIL_SCALES = [25, 50, 100, 200];
const SLAB = 220;

export interface View {
  r: ViewResult;
  place: Place;
}

/** Place a view: the largest scale of `scales` that fits, or throw (a drawing that does not fit even at 1:200). */
function placeIn(model: Box, entities: readonly Entity[], area: Box, scales: readonly number[]): Place {
  const p = fitView(model, entities, area, scales);
  if (!p) throw new Error('drawing does not fit on the sheet');
  return p;
}

/** Plan of the shaft at a level; `total` names the level in the overall dimensions (e.g. `in Testata`). */
export function planView(L: Layout, level: PlanLevel, floor: number, total: string, area: Box): View {
  const { W, D, wall: T } = L.inputs;
  const ents = [...planEntities(L, level, floor), ...planDims(L, level, floor, { level: total })];
  const place = placeIn({ x0: -T, y0: -T, x1: W + T, y1: D + T }, ents, area, PLAN_SCALES);
  return { r: renderView(ents, place), place };
}

/** Section A-A whole: the travel between the lowest floor's door and the car at the top floor drawn shorter, so the
 *  rest stays at 1:50 (or the next scale); the machine room as a stub over its floor slab. */
function fullSection(L: Layout, area: Box): { v: SectionView; scale: number } {
  const S = section(L), I = L.inputs, V = I.vertical, r = I.room;
  const zTop = r ? S.ceiling + r.slab + 600 : S.ceiling + SLAB, zBot = S.pitFloor - SLAB;
  const z0 = (S.levels[0] ?? 0) + I.doorHeight + 250, z1 = S.top - V.frameBelow - 600, band = z1 - z0;
  for (const scale of [50, 100, 200]) {
    const room = boxH(area) - 4, fixed = zTop - zBot - Math.max(0, band);
    const f = band > 1000 ? ((room * scale - fixed) / band) * 0.97 : 1;
    if (f < 0.03) continue;
    const v: SectionView = { carFloor: V.floors.length - 1, lo: -Infinity, hi: zTop, zmap: f >= 1 ? null : { z0, z1, f } };
    const { entities, bounds } = sectionEntities(L, v);
    if (fitView(bounds, [...entities, ...sectionDims(L, S, 'full', v.carFloor, v.zmap)], area, [scale])) return { v, scale };
  }
  throw new Error('section A-A does not fit on the sheet');
}

/** The heights a detail shows: the headroom with the car at the top floor, the car at a floor, the pit. */
function detailWindow(L: Layout, kind: SectionKind, floor: number): SectionView {
  const S = section(L), V = L.inputs.vertical, r = L.inputs.room, zf = S.levels[floor] ?? 0, low = S.levels[0] ?? 0;
  if (kind === 'top') return { carFloor: floor, lo: zf - V.frameBelow - 400, hi: r ? S.ceiling + r.slab + 500 : S.ceiling + SLAB, zmap: null };
  if (kind === 'pit') return { carFloor: floor, lo: S.pitFloor - SLAB, hi: low + S.highest + 500, zmap: null };
  const nearPit = zf - low <= 2600;
  return { carFloor: floor, lo: nearPit ? S.pitFloor - SLAB : zf - V.frameBelow - 700, hi: zf + S.highest + 600, zmap: null };
}

/** Section A-A: whole (`full`, car at the top floor) or a detail with the car at `floor`. */
export function sectionView(L: Layout, kind: SectionKind, floor: number, area: Box): View {
  const { v, scale } = kind === 'full' ? fullSection(L, area) : { v: detailWindow(L, kind, floor), scale: 0 };
  const { entities, bounds, S } = sectionEntities(L, v), ents = [...entities, ...sectionDims(L, S, kind, v.carFloor, v.zmap)];
  const place = placeIn(bounds, ents, area, scale ? [scale] : DETAIL_SCALES);
  return { r: renderView(ents, place), place };
}

/** The machine as the calculation and the data of the installation describe it. */
export function machineOf(a: Analysis, plant: Plant): MachineSpec {
  const { I, N } = a.ctx;
  return { D: N.D, Dp: I.layout === 'topDefl' ? I.Dp : 0, n: N.n, d: N.d, mass: plant.massMachine ?? N.mass, label: plant.machine ?? '' };
}

/** The machine room in plan or in section B-B; null when the design has no machine room. */
export function roomView(L: Layout, M: MachineSpec, kind: 'plan' | 'section', area: Box): (View & { G: RoomGeo }) | null {
  const G = roomGeo(L, M);
  if (!G) return null;
  const { entities, bounds } = kind === 'plan' ? roomPlanEntities(L, M, G) : roomSectionEntities(L, M, G);
  const place = placeIn(bounds, entities, area, DETAIL_SCALES);
  return { r: renderView(entities, place), place, G };
}

/** A view cropped to its extent with a margin, for the screens: shapes in a box w × h [mm] and the scale. */
export function cropped(v: View, pad = 3): { shapes: Shape[]; w: number; h: number; scale: number } {
  const e = v.r.extent;
  return { shapes: moveShapes(v.r.shapes, pad - e.x0, pad - e.y0), w: e.x1 - e.x0 + 2 * pad, h: e.y1 - e.y0 + 2 * pad, scale: v.place.scale };
}

/** Section A-A whole for the screens; null when it does not fit even at 1:200 (the plan is shown alone). */
function sectionPreview(L: Layout): ReturnType<typeof cropped> | null {
  try {
    return cropped(sectionView(L, 'full', L.inputs.vertical.floors.length - 1, { x0: 0, y0: 0, x1: 130, y1: 260 }));
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
