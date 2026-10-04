// Every view of a lift's project for its CAD files: the drawing set's views in its order and with its titles (the plans
// of the shaft at its levels, section A-A and its details, the machine room in plan and in section B-B), each with the
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
import { specs } from '../tavole/build';
import { detailWindow, planView, realSection, roomView, sectionView } from '../tavole/views';
import type { CadView } from './export';

/** The scale section A-A whole is lettered for. */
const FULL_SCALE = 50;

/** `machine`: the machine of the calculation, for the machine room's views; `room`: the design has a room above. */
export function projectViews(L: Layout, M: MachineSpec, room: boolean): CadView[] {
  const S = section(L), G = roomGeo(L, M);
  return specs(L, room && G !== null).flatMap((s): CadView[] => {
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
    if (!G) return [];
    const plan = s.k === 'room-plan', v = roomView(L, M, plan ? 'plan' : 'section', area);
    return [{ title: s.title, scale: v?.place.scale ?? FULL_SCALE, entities: (plan ? roomPlanEntities : roomSectionEntities)(L, M, G).entities }];
  });
}
