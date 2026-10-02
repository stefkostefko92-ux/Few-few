// The views of the drawing set without the paper around them: a plan of the shaft at a level, section A-A whole or in
// a detail, the machine room in plan or in section B-B, each laid out at the largest standard scale that fits an area
// with its dimensions. The sheets add titles, legends and marks; the screens show the views alone.
import { shapeOf } from '@/lib/catalog/shapes';
import { boxH, fitView, moveHits, moveShapes, renderView, type Box, type Entity, type Hit, type Place, type Shape, type ViewResult } from '@/drawing';
import { roomGeo, type MachineSpec, type RoomGeo } from '@/shaft/machine-room';
import { planDims } from '@/shaft/plan-dims';
import { planEntities, wallsAt, type PlanLevel } from '@/shaft/plan-view';
import { roomPlanEntities, roomSectionEntities } from '@/shaft/room-view';
import { section } from '@/shaft/section';
import { sectionDims, type SectionKind } from '@/shaft/section-dims';
import { sectionEntities, type SectionView } from '@/shaft/section-view';
import type { Layout } from '@/shaft/types';
import { machineSpec } from '../lift/machine';
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
  const T = L.inputs.wall, B = wallsAt(L, level), ents = [...planEntities(L, level, floor), ...planDims(L, level, floor, { level: total })];
  const place = placeIn({ x0: Math.min(0, B.x0) - T, y0: Math.min(0, B.y0) - T, x1: Math.max(L.inputs.W, B.x1) + T, y1: Math.max(L.inputs.D, B.y1) + T }, ents, area, PLAN_SCALES);
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

/** Section A-A whole at its real height (no travel drawn shorter), from under the pit to the machine room's stub. */
export function realSection(L: Layout): SectionView {
  const S = section(L), r = L.inputs.room;
  return { carFloor: L.inputs.vertical.floors.length - 1, lo: -Infinity, hi: r ? S.ceiling + r.slab + 600 : S.ceiling + SLAB, zmap: null };
}

/** The heights a detail shows: the headroom with the car at the top floor, the car at a floor, the pit. */
export function detailWindow(L: Layout, kind: SectionKind, floor: number): SectionView {
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

/** The machine as the calculation and the data of the installation describe it, on the room's support: the maker's as
 *  it is when the proposal took one from a catalogue (`catalog` of the marks; its bedplate with the diverting pulley),
 *  else the generic machine. */
export function machineOf(a: Analysis, plant: Plant, L: Layout, catalog: { brand: string; model: string } | null = null): MachineSpec {
  return machineSpec(a.ctx, plant.massMachine ?? a.ctx.N.mass, plant.machine ?? '', L.inputs.room, catalog ? shapeOf(catalog.brand, catalog.model) : null, catalog);
}

/** The machine room in plan or in section B-B; null when the design has no machine room. */
export function roomView(L: Layout, M: MachineSpec, kind: 'plan' | 'section', area: Box): (View & { G: RoomGeo }) | null {
  const G = roomGeo(L, M);
  if (!G) return null;
  const { entities, bounds } = kind === 'plan' ? roomPlanEntities(L, M, G) : roomSectionEntities(L, M, G);
  const place = placeIn(bounds, entities, area, DETAIL_SCALES);
  return { r: renderView(entities, place), place, G };
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

export type ScreenView = 'plan' | 'head' | 'pit-plan' | SectionKind | 'room-plan' | 'room-section';

/** One view for the screens that change the design: the plan at the main floor, at the top floor and in the headroom
 *  (its walls where they stand there) or at the lowest floor and in the pit (the buffers and the refuge space), section
 *  A-A whole or a detail (the headroom, the car at the main floor, the pit), the machine room in plan or in section B-B
 *  (with a machine); null when it cannot be drawn. */
export function screenView(L: Layout, v: ScreenView, M: MachineSpec | null): ReturnType<typeof cropped> | null {
  const V = L.inputs.vertical, top = V.floors.length - 1, main = Math.min(V.main, top), area: Box = { x0: 0, y0: 0, x1: 190, y1: 190 };
  try {
    if (v === 'plan') return cropped(planView(L, 'main', main, `piano "${V.floors[main]?.label ?? ''}"`, area));
    if (v === 'head') return cropped(planView(L, 'top', top, 'in Testata', area));
    if (v === 'pit-plan') return cropped(planView(L, 'pit', 0, `piano "${V.floors[0]?.label ?? ''}" e in Fossa`, area));
    if (v === 'room-plan' || v === 'room-section') {
      const r = M ? roomView(L, M, v === 'room-plan' ? 'plan' : 'section', area) : null;
      return r ? cropped(r) : null;
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
