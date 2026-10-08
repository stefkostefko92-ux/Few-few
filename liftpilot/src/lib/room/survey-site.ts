// What a replacement's survey finds in the machine room besides the room, the shaft and the drops (survey.ts, round 36;
// registry locale.fori, limitatore.posto): the existing governor on the floor — the checks take its footprint as they take
// a whole design's (m_free, m_route, m_quadro, m_gov, m_govfree), the plan draws it with its load P4 —, the slab's
// existing openings, drawn dashed with their size, and whether the new support bears on one of them (m_holes). Room axes
// [mm]; pure.
import { path, rect, type Box as DrawBox, type Entity, type Pt } from '@/drawing';
import { check } from '@/shaft/checks';
import type { HebLayout } from '@/shaft/heb';
import type { MachineSpec, RoomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import type { Box } from '@/shaft/room-floor';
import { reactionPoints } from '@/shaft/room-reactions';
import type { ShaftCheck } from '@/shaft/types';
import type { Survey } from './survey';

/** The surveyed governor's footprint; null: none surveyed. */
export function surveyGovernor(s: Pick<Survey, 'governor'>): Box | null {
  const g = s.governor;
  return g ? [g.x - g.W / 2, g.y - g.D / 2, g.x + g.W / 2, g.y + g.D / 2] : null;
}

/** The slab's existing openings surveyed (with the governor's ropes' under its footprint when they go through the slab). */
export function surveyOpenings(s: Pick<Survey, 'openings' | 'governor'>): Box[] {
  const own = (s.openings ?? []).map((o): Box => [o.x - o.W / 2, o.y - o.D / 2, o.x + o.W / 2, o.y + o.D / 2]);
  const g = s.governor, ropes: Box[] = g?.ropes ? [[g.x - 60, g.y - g.D / 2 + 20, g.x + 60, g.y + g.D / 2 - 20]] : [];
  return [...own, ...ropes];
}

/** The plan's entities of what the survey found: the governor's footprint with its name and P4, each existing opening
 *  dashed with «FORO ESISTENTE L×P»; and the boxes their lettering takes. */
export function surveyFound(s: Pick<Survey, 'openings' | 'governor'>): { entities: Entity[]; box: DrawBox | null; marks: DrawBox[] } {
  const out: Entity[] = [], marks: DrawBox[] = [], gov = surveyGovernor(s);
  if (gov) {
    const [x0, y0, x1, y1] = gov, c: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
    out.push(rect(x0, y0, x1, y1, 'outline', 'paper'), { e: 'text', at: [c[0], y1 + 60], text: 'Limitatore esistente', size: 1.6, align: 'c', halo: true });
    out.push({ e: 'tag', at: [x1 + 160, y1 + 160], text: 'P4', to: [x1, y1] });
  }
  for (const [x0, y0, x1, y1] of (s.openings ?? []).map((o): Box => [o.x - o.W / 2, o.y - o.D / 2, o.x + o.W / 2, o.y + o.D / 2])) {
    out.push(path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, 'hidden'), path([[x0, y0], [x1, y1]], false, 'hidden'));
    out.push({ e: 'text', at: [(x0 + x1) / 2, y0 - 70], text: `FORO ESISTENTE ${Math.round(x1 - x0)}×${Math.round(y1 - y0)}`, size: 1.4, align: 'c', halo: true });
    marks.push({ x0, y0: y0 - 110, x1, y1 });
  }
  return { entities: out, box: gov ? { x0: gov[0], y0: gov[1], x1: gov[2], y1: gov[3] + 120 } : null, marks };
}

/** How far a point is from the rectangle's edge, negative inside it [mm]. */
function edgeGap(p: Pt, [x0, y0, x1, y1]: Box): number {
  const dx = Math.max(x0 - p[0], 0, p[0] - x1), dy = Math.max(y0 - p[1], 0, p[1] - y1);
  return dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]);
}

/** m_holes (soft: the opening can be closed): the new support's bearings at least KV_VERT.holeBearing from the edge of
 *  every existing opening of the slab; none surveyed: no check. */
export function holesCheck(G: RoomGeo, M: MachineSpec, openings: readonly Box[], heb: HebLayout | null = null): ShaftCheck[] {
  if (!openings.length) return [];
  const gap = Math.min(...reactionPoints(G, M, heb).flatMap((p) => openings.map((o) => edgeGap(p, o))));
  return [check('m_holes', gap >= KV_VERT.holeBearing, Math.round(gap), KV_VERT.holeBearing, 0, 'mm', true)];
}
