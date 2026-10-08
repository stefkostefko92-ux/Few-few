// The rails developed in elevation (registries guide.staffe, guide.staffe.cabina, ingombri.staffe.contrappeso): a car
// rail and a counterweight rail side by side, each from the pit floor to just under the slab in its 5 m lengths with the
// fishplates at the joints, every bracket where brackets.ts puts it (the same heights the 3D, the list of articles and the
// rails' check take) on the side of its wall; the floors as reference lines. Dimensioned from the pit floor: the brackets'
// lower edges with every interval (car rails on the left, the counterweight's on the right) and the lengths of the rails.
// The heights are the rule's, worked out: references, no input changes them here. Pure.
import { chain, line, path, type Box, type Entity, type Pt } from '../drawing';
import { bracketHeights, railPieces, railSpan } from './brackets';
import { FISHPLATES, railLabel } from './rails';
import { section } from './section';
import type { Layout } from './types';

/** Where the two rails stand in the elevation, and how far the floors' lines and the slabs run past them [mm]. */
export const DEV = { car: 0, cw: 2600, past: 1300, rail: 45, arm: 260, bracketH: 150 } as const;

export interface RailsDev {
  entities: Entity[];
  bounds: Box;
}

export function railsDev(L: Layout): RailsDev {
  const I = L.inputs, V = I.vertical, S = section(L), [z0, z1] = railSpan(S), out: Entity[] = [];
  const x0 = DEV.car - DEV.past, x1 = DEV.cw + DEV.past, slab = 220;
  const box = (a: number, b: number, c: number, d: number, st: 'outline' | 'thin' | 'wall', fill?: 'steel' | 'zinc' | 'concrete' | 'paper'): Entity =>
    path([[a, b], [c, b], [c, d], [a, d]], true, st, fill);
  // the pit floor and the slab over the shaft
  out.push(box(x0, S.pitFloor - slab, x1, S.pitFloor, 'wall', 'concrete'), box(x0, S.ceiling, x1, S.ceiling + slab, 'wall', 'concrete'));
  // the floors, with their names and heights over the lowest
  V.floors.forEach((f, i) => {
    const z = S.levels[i] ?? 0;
    out.push(line([x0, z], [x1, z], 'axis'), { e: 'text', at: [x0 + 40, z + 60], text: `PIANO ${f.label}  ${z >= 0 ? '+' : ''}${Math.round(z)}`, size: 1.8, halo: true });
  });
  const rail = (x: number, kind: 'car' | 'cw', s: 1 | -1): void => {
    const type = kind === 'car' ? I.carRail : I.cwRail, { pieces, joints } = railPieces(z0, z1), fp = FISHPLATES[type];
    let z = z0;
    for (const p of pieces) {
      out.push(box(x - DEV.rail, z + (z > z0 ? 5 : 0), x + DEV.rail, z + p, 'outline', 'steel'));
      z += p;
    }
    for (const j of joints) out.push(box(x - DEV.rail - 30, j - fp.l / 2, x + DEV.rail + 30, j + fp.l / 2, 'thin', 'zinc'));
    // each bracket out from the rail toward its wall (left for the car's, right for the counterweight's), its wall plate
    const hs = bracketHeights(z0, z1, type, kind === 'car' ? L.carBracketPitch : L.cwBracketPitch), arm = x - s * (DEV.rail + DEV.arm);
    for (const h of hs) {
      out.push(box(Math.min(x - s * DEV.rail, arm), h, Math.max(x - s * DEV.rail, arm), h + DEV.bracketH, 'thin', 'zinc'));
      out.push(box(Math.min(arm, arm - s * 14), h - 25, Math.max(arm, arm - s * 14), h + DEV.bracketH + 25, 'thin', 'zinc'));
    }
    // the brackets from the pit floor: the first, each interval, the last to the rail's top; the rail's lengths
    const side = s > 0 ? 'left' : 'right', reach = arm - s * 14;
    out.push(chain({ dir: 'y', side, row: 0, pts: [S.pitFloor, ...hs, z1], from: [x - s * DEV.rail, ...hs.map(() => reach), x - s * DEV.rail] }));
    out.push(chain({ dir: 'y', side, row: 1, pts: [z0, ...joints, z1], text: [...pieces.map(() => 'Guida {v}')], from: x - s * DEV.rail }));
  };
  rail(DEV.car, 'car', 1);
  rail(DEV.cw, 'cw', -1);
  const top = S.ceiling + slab;
  out.push({ e: 'text', at: [DEV.car, top + 160], text: `GUIDA DI CABINA ${railLabel(I.carRail)}`, size: 2.2, align: 'r', bold: true },
    { e: 'text', at: [DEV.cw, top + 160], text: `GUIDA DEL CONTRAPPESO ${railLabel(I.cwRail)}`, size: 2.2, align: 'l', bold: true });
  const pt: Pt = [x0, S.pitFloor - slab];
  return { entities: out, bounds: { x0: pt[0], y0: pt[1], x1, y1: top + 420 } };
}
