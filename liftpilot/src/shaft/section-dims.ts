// Dimensions of section A-A by view: the whole shaft (pit, travel and the floors' rises, headroom, total height, the
// counterweight and its run-by), the headroom with the car at the top floor, the car at a floor with its heights (and
// the linings over the landing doors), the pit with buffers, their strokes, where they stand and the counterweight's
// screen. Values are
// the real ones even where the travel is drawn compressed; the overtravels of the car are shown as dashed lines with
// their symbols. Each height says which input its new value changes (edit.ts): a height of the section (v.*), a floor's
// rise, of the doors, of the linings or of the call stations; a refuge space's height by choosing its type.
import { chain, edit as E, line, type Edit, type Entity, type Pt } from '../drawing';
import { bufferType } from './buffers';
import { cwNiche } from './niche';
import { bufferPlan } from './pit';
import { callStationOf } from './callstation';
import { portalOf } from './frame';
import { hasImbotti, marbleHeight } from './imbotti';
import { KV_VERT } from './norme-vert';
import { refugePick } from './plan-picks';
import { mapZ, type ZMap } from './section-view';
import { screenOf, type Section } from './section';
import type { Layout } from './types';

export type SectionKind = 'full' | 'top' | 'floor' | 'pit';

const fmt = (v: number): string => String(Math.round(v));

export function sectionDims(L: Layout, S: Section, kind: SectionKind, carFloor: number, zmap: ZMap | null): Entity[] {
  const I = L.inputs, V = I.vertical, out: Entity[] = [], Z = (z: number): number => mapZ(zmap, z);
  const P = (x: number, z: number): Pt => [x, Z(z)];
  const row = { left: 0, right: 0 };
  // the lettering and the edits say the real heights, measured before the travel is drawn shorter
  const real = (pts: number[], text?: (string | null)[], edit?: (Edit | null)[]) => {
    const len = pts.slice(1).map((z, i) => Math.abs(z - pts[i]));
    return {
      pts: pts.map(Z),
      text: len.map((v, i) => { const t = text?.[i]; return t == null ? fmt(v) : t.replace('{v}', fmt(v)); }),
      edit: edit?.map((e, i) => (e ? { ...e, value: len[i] } : null)),
    };
  };
  const side = (s: 'left' | 'right', pts: number[], text?: (string | null)[], edit?: (Edit | null)[]): void => {
    out.push(chain({ dir: 'y', side: s, row: row[s]++, ...real(pts, text, edit) }));
  };
  const at = (x: number, pts: number[], text?: (string | null)[], edit?: (Edit | null)[]): void => {
    out.push(chain({ dir: 'y', at: x, ...real(pts, text, edit) }));
  };
  // along the section (the plan's y, never drawn shorter), under it
  let below = 0;
  const under = (pts: number[], text: (string | null)[], edit: Edit[]): void => {
    out.push(chain({ dir: 'x', side: 'bottom', row: below++, pts, text, edit }));
  };
  const zf = S.levels[carFloor] ?? 0, roof = zf + V.carOutH, c = L.car, n = V.floors.length;
  // a buffer's stroke: entered, or for a polyurethane pad 90 % of its height (the height takes the change)
  const strokeEdit = (sd: 'car' | 'cw'): Edit => (bufferType(V, sd) === 'pu' ? E(`v.${sd}BufferH`, 0, 1 / KV_VERT.puStroke) : E(`v.${sd}BufferStroke`));

  if (kind === 'full') {
    // the travel's last rise takes a new travel; the headroom a new total height
    const last = n - 2, before = S.top - (V.floors[last]?.rise ?? 0);
    side('left', [S.pitFloor, 0, S.top, S.ceiling], [`Fossa ${V.pit}`, `Corsa ${S.top}`, `Testata ${V.headroom}`], [E('v.pit'), E(`f.${last}.rise`, -before), E('v.headroom')]);
    side('left', [S.pitFloor, S.ceiling], [`${V.pit + S.top + V.headroom} Altezza Totale Vano`], [E('v.headroom', -(V.pit + S.top))]);
    // each floor's rise, from the lowest floor up
    side('right', S.levels, S.levels.slice(1).map(() => 'Interpiano {v}'), S.levels.slice(1).map((_, i) => E(`f.${i}.rise`)));
  }
  if (kind === 'top' || kind === 'floor') {
    side('left', [zf, zf + V.opTop], ['{v} H. Ingombro Max Operatore'], [E('v.opTop')]);
    side('left', [zf, zf + I.doorHeight], ['{v} H. Luce Porta di piano'], [E('doorHeight')]);
    side('left', [zf, zf + callStationOf(I).height], ['{v} H. Bottoniera'], [E('cs.height')]);
    const fr = portalOf(I);
    if (hasImbotti(I)) {
      // over the landing door: the portal's head (or its own frame's) and the top lining up to the marble
      const h = marbleHeight(I);
      side('left', [zf, zf + I.doorHeight + fr.head, zf + h], ['{v}', 'Imb. sup. {v}'], [E('doorHeight', -fr.head), E('imb.top')]);
      side('left', [zf, zf + h], ['{v} H. sotto il marmo'], [E('imb.height')]);
    } else if (fr.depth !== null) {
      // the door's own frame: its header over the clear opening, the opening in the wall
      side('left', [zf + I.doorHeight, zf + I.doorHeight + fr.head], ['Tel. {v}'], [E('frame.head')]);
      side('left', [zf, zf + I.doorHeight + fr.head], ['{v} H. vano telaio'], [E('doorHeight', -fr.head)]);
    }
    if (kind === 'top') side('left', [zf, S.ceiling], ['Testata {v}'], [E('v.headroom', -(S.top - zf))]);
    side('right', [zf, roof], ['{v} H. Esterno Cabina'], [E('v.carOutH')]);
    side('right', [zf, zf + V.frameTop], ['{v} Ingombro Arcata'], [E('v.frameTop')]);
    at(c.y + c.h / 2 + 40, [zf, zf + V.carH], ['{v} H. Interno Cabina'], [E('v.carH')]);
    at(c.y + 200, [zf, zf + I.doorHeight], ['{v} H. Luce Porta'], [E('doorHeight')]);
    at(c.y + c.h - 60, [zf - V.platform, zf], ['{v}'], [E('v.platform')]);
  }
  if (kind === 'top') {
    if (V.parapet > 0) side('right', [roof, roof + V.parapet], ['{v} H. Parapetto'], [E('v.parapet')]);
    side('right', [roof, S.ceiling], undefined, [E('v.headroom', V.carOutH)]);
    // car past the top floor with the counterweight on its compressed buffer: its run-by takes the change
    const up = roof + S.moveUp;
    out.push(line(P(c.y - 60, up), P(c.y + c.h + 60, up), 'hidden'), { e: 'mark', at: P(c.y + c.h + 150, up), sym: 'overUp' });
    at(c.y + c.h - 120, [roof, up], ['{v}'], [E('v.cwRunby', -(S.cwStroke + S.jump))]);
    at(c.y + 90, [roof, roof + KV_VERT.refugeH[V.topRefuge]], undefined, [refugePick('v.topRefuge', V.topRefuge)]);
  }
  if (kind === 'pit' || kind === 'full') {
    const bp = bufferPlan(L), plateCar = -V.frameBelow, low = plateCar - S.moveDown, x = bp.rows[0] ?? c.y + c.h / 2;
    const cwAt = bp.spots.find((b) => b.kind === 'cw')?.c[1] ?? L.cw.y + L.cw.h / 2;
    // the run-by of the car is set by the height of the buffers' plinths
    side('left', [S.pitFloor, S.pitFloor + V.carBufferBase, S.carBufferTop, ...(kind === 'pit' ? [plateCar, 0] : [])],
      ['{v} Base Ammort.', '{v} Ammort.', ...(kind === 'pit' ? ['{v}', '{v}'] : [])],
      [E('v.carBufferBase'), E('v.carBufferH'), ...(kind === 'pit' ? [E('v.carBufferBase', V.pit - V.frameBelow - V.carBufferH, -1), E('v.frameBelow')] : [])]);
    if (kind === 'pit') {
      side('left', [S.pitFloor, 0], ['Fossa {v}'], [E('v.pit')]);
      out.push(line(P(c.y - 60, low), P(c.y + c.h + 60, low), 'hidden'), { e: 'mark', at: P(c.y - 170, low), sym: 'overDown' });
      at(x + 130, [S.carBufferTop - S.carStroke, S.carBufferTop], ['Corsa {v}'], [strokeEdit('car')]);
      at(x + 330, [S.pitFloor, S.pitFloor + KV_VERT.refugeH[V.pitRefuge]], undefined, [refugePick('v.pitRefuge', V.pitRefuge)]);
      // where the buffers stand from the front wall: the car's row(s) (pit.ts); the counterweight's under its middle at the
      // back (its wall gap moves it, the car keeps its depth), along its wall on a side
      const D = I.D, q = c.h / 4, [r0, r1] = bp.rows, keep = [{ key: 'plan.B', value: L.B }] as const;
      if (r1 === undefined) under([0, bp.y, D], ['{v} Ammort. cabina', null], [E('plan.bufY'), E('plan.bufY', D, -1)]);
      else under([0, r0 ?? bp.y, r1, D], ['{v} Ammort. cabina', null, null], [E('plan.bufY', q), E('plan.B', -2 * I.carWall, 2), E('plan.bufY', D - q, -1)]);
      const nd = cwNiche(I, L.cwSide)?.depth ?? 0;
      under([0, cwAt, D], ['{v} Ammort. contrappeso', null], L.cwSide === 'rear'
        ? [E('cwWallGap', D + nd - I.cwDepth / 2, -1, keep), E('cwWallGap', nd - I.cwDepth / 2, 1, keep)]
        : [E('plan.cwBufPos'), E('plan.cwBufPos', D, -1)]);
    }
    const cx = cwAt;
    // the counterweight's buffer; with the car at the top floor (whole section) the counterweight's run-by over it
    const plate = S.pitFloor + S.cwLow + (S.top - zf);
    side('right', [S.pitFloor, S.pitFloor + V.cwBufferBase, S.cwBufferTop, ...(kind === 'full' ? [plate] : [])], ['{v} Base Ammort.', '{v} Ammort.', ...(kind === 'full' ? ['{v} Extracorsa'] : [])],
      [E('v.cwBufferBase'), E('v.cwBufferH'), ...(kind === 'full' ? [E('v.cwRunby')] : [])]);
    side('right', [S.pitFloor, S.pitFloor + screenOf(V)], ['{v} H. Protezione Contrappeso in Fossa'], [E('v.cwScreen')]);
    at(cx + 130, [S.cwBufferTop - S.cwStroke, S.cwBufferTop], ['Corsa {v}'], [strokeEdit('cw')]);
  }
  if (kind === 'full') {
    const plate = S.pitFloor + S.cwLow + (S.top - zf);
    side('right', [plate, plate + V.cwH], ['{v} H. Ingombro Totale Contrappeso'], [E('v.cwH')]);
  }
  return out;
}
