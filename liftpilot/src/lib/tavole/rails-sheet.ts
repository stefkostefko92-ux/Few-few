// The sheet of the rails developed with their brackets (round 36): the elevation of src/shaft/rails-dev.ts at the
// largest standard scale that fits, and under it what the installer needs to build them as checked — for each rail its
// profile, how many lengths and joints, how many brackets and the longest interval between them (the l of the car rails'
// check on sheet 1), the brackets' type with their anchors and how far the wall stands from each rail's foot, and what a
// car rail's bracket brings to the wall for the check of its anchors. Italian, like the drawings. Pure.
import { boxH, fitView, moveShapes, paragraph, renderView, type Box, type Shape } from '@/drawing';
import { bracketHeights, maxBracketSpan, railPieces, railSpan } from '@/shaft/brackets';
import { railLabel } from '@/shaft/rails';
import { railsDev } from '@/shaft/rails-dev';
import { section } from '@/shaft/section';
import { cwBracketsOf } from '@/shaft/staffe';
import { bracketReach, carBracketType, twoPieces } from '@/shaft/staffe-cabina';
import { cwPlanCode } from '@/shaft/plan-staffe';
import type { Layout } from '@/shaft/types';
import type { Fmt } from '../present/tr';

const WALL: Readonly<Record<string, string>> = { left: 'SX', right: 'DX', front: 'FRONTE', rear: 'RETRO' };

/** The notes under the elevation: one paragraph a rail, one on the heights; `kept`: the rails stay as they are. */
export function railsNotes(L: Layout, x: { fx: string; fy: string; kept: boolean }, fmt: Fmt): string[] {
  const I = L.inputs, [z0, z1] = railSpan(section(L)), { pieces, joints } = railPieces(z0, z1);
  const lengths = `${pieces.length} spezzoni (${pieces.map((p) => fmt(p, 0)).join(' + ')} mm), ${joints.length} giunzioni con piastra`;
  const reaches = (kind: 'car' | 'cw'): string => [...new Set(L.rails.filter((r) => r.kind === kind).map((r) => {
    const b = bracketReach(L, r);
    return `${WALL[b.wall] ?? b.wall} ${fmt(b.reach, 0)} mm ${b.to === 'foot' ? 'al piede' : 'all’asse'}${kind === 'car' && twoPieces(b.reach) ? ' (in due pezzi, 4 bulloni M12 in asola)' : ''}`;
  }))].join(', ');
  const n = (kind: 'car' | 'cw'): number => bracketHeights(z0, z1, kind === 'car' ? I.carRail : I.cwRail, kind === 'car' ? L.carBracketPitch : L.cwBracketPitch).length;
  const span = (kind: 'car' | 'cw'): string => fmt(maxBracketSpan(z0, z1, kind === 'car' ? I.carRail : I.cwRail, kind === 'car' ? L.carBracketPitch : L.cwBracketPitch), 0);
  const cwRail = L.rails.find((r) => r.kind === 'cw'), panev = cwBracketsOf(I) === 'panev' && cwRail ? cwPlanCode(L, cwRail) : null;
  return [
    ...(x.kept ? ['GUIDE ESISTENTI: le quote sono quelle della regola di montaggio, da confrontare con le staffe in opera prima della verifica delle guide.'] : []),
    `GUIDE DI CABINA ${railLabel(I.carRail)}: ${lengths}; ${n('car')} staffe per guida, interasse massimo ${span('car')} mm (la l della verifica delle guide, foglio 1); `
      + `staffa ${carBracketType(L)}; dal muro alla guida: ${reaches('car')}; ogni staffa porta alla parete fino a Fx ${x.fx} e Fy ${x.fy} daN `
      + '(verifica degli ancoraggi).',
    `GUIDE DEL CONTRAPPESO ${railLabel(I.cwRail)}: ${lengths}; ${n('cw')} staffe per guida, interasse massimo ${span('cw')} mm; `
      + `${panev ? `staffe Panev ${panev.replace(/^\d+× /, '')}` : `staffa ${carBracketType(L).replace(/, 2 GRAFFE M\d+$/, '')} (da dimensionare a parte)`}; dal muro alla guida: ${reaches('cw')}.`,
    'Quote dal fondo della fossa al lato inferiore di ogni staffa (alta 150 mm); guide in spezzoni da 5 m dal fondo della fossa, le staffe fuori dalle piastre di giunzione. Quote calcolate dalla regola di montaggio: non si cambiano qui.',
  ];
}

/** The elevation in `area` with the notes under it, at the largest of the scales that fits. */
export function railsSheet(L: Layout, area: Box, notes: readonly string[]): { shapes: Shape[]; scale: number } {
  // the notes from the foot of the area up, the elevation over them
  const width = area.x1 - area.x0, size = 2.1, out: Shape[] = [];
  let y = area.y0, blocks: Shape[][] = [];
  for (const t of [...notes].reverse()) {
    const p = paragraph(area.x0, 0, width, t, size, 1.25), h = -p.bottom;
    blocks = [moveShapes(p.shapes, 0, y + h), ...blocks];
    y += h + 1.6;
  }
  for (const b of blocks) out.push(...b);
  const dev = railsDev(L), view: Box = { ...area, y0: y + 3 };
  const place = fitView(dev.bounds, dev.entities, view, [50, 100, 200, 500]);
  if (!place || boxH(view) <= 0) throw new Error('rails do not fit on the sheet');
  return { shapes: [...renderView(dev.entities, place).shapes, ...out], scale: place.scale };
}
