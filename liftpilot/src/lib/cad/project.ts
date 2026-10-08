// Every view of a lift's project for its CAD files: the drawing set's views in its order and with its titles (the plans
// of the shaft at its levels, section A-A and its details, the machine room in plan and in section B-B, or the room of
// the machine below in plan and in section C-C), each with the
// lettering sized for the scale the drawing set prints it at; section A-A whole at its real height (the drawing set
// draws the travel shorter to fit the sheet). The machine room of a replacement in plan and section B-B too. Pure.
import { drawingArea, type Entity } from '@/drawing';
import { withPitches } from '@/shaft/brackets';
import { roomGeo, type MachineSpec } from '@/shaft/machine-room';
import { planDims } from '@/shaft/plan-dims';
import { planEntities } from '@/shaft/plan-view';
import { roomPlanEntities, roomPlanOn, roomSectionEntities, roomSectionOn } from '@/shaft/room-view';
import { section } from '@/shaft/section';
import { sectionDims } from '@/shaft/section-dims';
import { sectionEntities } from '@/shaft/section-view';
import type { Layout } from '@/shaft/types';
import type { BottomGeo } from '../lift/bottom';
import type { Plant } from '../plant';
import { analyse } from '../present/analysis';
import type { RoomDerived } from '../room/derive';
import { inset, specs } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';
import { belowGeoOf, belowView, detailWindow, headLoadsOf, machineName, machineOf, planView, realSection, roomView, sectionView, surveyView } from '../tavole/views';
import type { CadView } from './export';

/** The scale section A-A whole is lettered for. */
const FULL_SCALE = 50;

/** `machine`: the machine of the calculation, for the machine room's views; `room`: the design has a room above;
 *  `below`: the geometry of the machine below (its room's views) and `head` the loads on the head of the shaft it puts
 *  on the plan at the top floor (views.ts headLoadsOf). */
export function projectViews(L: Layout, M: MachineSpec, room: boolean, below: BottomGeo | null = null, head: readonly Entity[] = []): CadView[] {
  const S = section(L), G = roomGeo(L, M);
  return specs(L, room && G !== null, below?.scheme ?? null).flatMap((s): CadView[] => {
    const area = drawingArea(s.subtitle !== undefined);
    if (s.k === 'plan') {
      const extra = s.level === 'top' ? head : [], entities = [...planEntities(L, s.level, s.floor), ...extra, ...planDims(L, s.level, s.floor, { level: s.total })];
      return [{ title: s.title, scale: planView(L, s.level, s.floor, s.total, area, extra).place.scale, entities }];
    }
    if (s.k === 'section') {
      const v = s.kind === 'full' ? realSection(L) : detailWindow(L, s.kind, s.floor);
      const entities = [...sectionEntities(L, v).entities, ...sectionDims(L, S, s.kind, v.carFloor, null)];
      return [{ title: s.title, scale: s.kind === 'full' ? FULL_SCALE : sectionView(L, s.kind, s.floor, area).place.scale, entities }];
    }
    if (s.k === 'below-plan' || s.k === 'below-section') {
      if (!below) return [];
      // at the set's scale (its sheet insets the view as build.ts belowSheet does), the plan's names placed for it
      const v = belowView(L, M, below, s.k === 'below-plan' ? 'plan' : 'section', inset(area, 8, 8, 8, 8));
      return [{ title: s.title, scale: v.place.scale, entities: v.entities }];
    }
    if (!G) return [];
    // (as the view lays it out for its scale: the door shut, the section's heights in one row, as the sheet has them)
    const plan = s.k === 'room-plan', v = roomView(L, M, plan ? 'plan' : 'section', area);
    return [{ title: s.title, scale: v?.place.scale ?? FULL_SCALE, entities: v?.entities ?? (plan ? roomPlanEntities : roomSectionEntities)(L, M, G).entities }];
  });
}

/** Every view of the set drawn from `x`, as its sheets have them: the brackets at the pitches its data declare, the
 *  machine named as the catalogue names it, the room of the machine below for its scheme. */
export function inputViews(x: Pick<TavoleInput, 'values' | 'layout' | 'plant' | 'marks'>): CadView[] {
  const L = withPitches(x.layout, { car: x.plant.carBracketPitch, cw: x.plant.cwBracketPitch }), a = analyse(x.values);
  const M = machineOf(a, x.plant, L, x.marks?.catalog ?? null), bottom = a.ctx.I.layout === 'bottom';
  const g = bottom ? belowGeoOf(a, L, M, x.marks?.bottom ?? 'head') : null;
  return projectViews(L, M, L.inputs.room !== null && !bottom, g, g ? headLoadsOf(a, L, M, g) : []);
}

/** The machine room of a replacement in plan and in section B-B, lettered for the scale its set prints them at (as the
 *  sheets lay them out: surveyView); none without a room over the shaft. */
export function surveyViews(d: RoomDerived, plant: Plant): CadView[] {
  const G = d.G;
  if (!G) return [];
  const M = { ...d.M, label: machineName(plant, d.made) }, area = inset(drawingArea(true), 8, 8, 8, 8);
  const plan = surveyView(d, 'plan', area, M), cut = surveyView(d, 'section', area, M);
  return [
    { title: 'VISTA IN PIANTA DEL LOCALE MACCHINA', scale: plan?.place.scale ?? FULL_SCALE, entities: plan?.entities ?? roomPlanOn(d.site, M, G).entities },
    { title: 'VISTA IN ELEVATO DEL LOCALE MACCHINA - SEZ. B-B', scale: cut?.place.scale ?? FULL_SCALE, entities: cut?.entities ?? roomSectionOn(d.site, M, G).entities },
  ];
}
