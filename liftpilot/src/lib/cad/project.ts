// Every view of a lift's project for its CAD files: the drawing set's views in its order and with its titles (the plans
// of the shaft at its levels, section A-A and its details, the machine room in plan and in section B-B, or the room of
// the machine below in plan and in section C-C), each with the
// lettering sized for the scale the drawing set prints it at; section A-A whole at its real height (the drawing set
// draws the travel shorter to fit the sheet). Pure.
import { drawingArea } from '@/drawing';
import { roomGeo, type MachineSpec } from '@/shaft/machine-room';
import { planDims } from '@/shaft/plan-dims';
import { planEntities } from '@/shaft/plan-view';
import { roomPlanEntities, roomSectionEntities } from '@/shaft/room-view';
import { section } from '@/shaft/section';
import { sectionDims } from '@/shaft/section-dims';
import { sectionEntities } from '@/shaft/section-view';
import type { Layout } from '@/shaft/types';
import type { BottomGeo } from '../lift/bottom';
import { inset, specs } from '../tavole/build';
import { railsNotes, railsSheet } from '../tavole/rails-sheet';
import { railsDev } from '@/shaft/rails-dev';
import { makeFmt } from '../present/tr';
import { belowView, detailWindow, planView, realSection, roomView, sectionView } from '../tavole/views';
import type { CadView } from './export';

/** The scale section A-A whole is lettered for. */
const FULL_SCALE = 50;

/** `machine`: the machine of the calculation, for the machine room's views; `room`: the design has a room above;
 *  `below`: the geometry of the machine below (its room's views). */
export function projectViews(L: Layout, M: MachineSpec, room: boolean, below: BottomGeo | null = null): CadView[] {
  const S = section(L), G = roomGeo(L, M);
  return specs(L, room && G !== null, below?.scheme ?? null).flatMap((s): CadView[] => {
    const area = drawingArea(s.subtitle !== undefined);
    if (s.k === 'plan') {
      const entities = [...planEntities(L, s.level, s.floor), ...planDims(L, s.level, s.floor, { level: s.total })];
      return [{ title: s.title, scale: planView(L, s.level, s.floor, s.total, area).place.scale, entities }];
    }
    if (s.k === 'section') {
      const v = s.kind === 'full' ? realSection(L) : detailWindow(L, s.kind, s.floor);
      const entities = [...sectionEntities(L, v).entities, ...sectionDims(L, S, s.kind, v.carFloor, null)];
      return [{ title: s.title, scale: s.kind === 'full' ? FULL_SCALE : sectionView(L, s.kind, s.floor, area).place.scale, entities }];
    }
    if (s.k === 'rails') {
      // the rails developed, at the scale the set prints them (its notes under it as the sheet has them)
      const notes = railsNotes(L, { fx: '—', fy: '—', kept: false }, makeFmt('it-IT'));
      return [{ title: s.title, scale: railsSheet(L, area, notes).scale, entities: railsDev(L).entities }];
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
