// Dimensions of section A-A by view: the whole shaft (pit, travel, headroom, total height), the headroom with the
// car at the top floor, the car at a floor with its heights, the pit with buffers and the counterweight's spaces.
// Values are the real ones even where the travel is drawn compressed; the overtravels of the car are shown as
// dashed lines with their symbols. Each height says which input its new value changes (edit.ts): a height of the
// section (v.*), of the doors or of the call stations.
import { chain, edit as E, line, type Edit, type Entity, type Pt } from '../drawing';
import { callStationOf } from './callstation';
import { KV_VERT } from './norme-vert';
import { mapZ, type ZMap } from './section-view';
import type { Section } from './section';
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
  const zf = S.levels[carFloor] ?? 0, roof = zf + V.carOutH, c = L.car;

  if (kind === 'full') {
    side('left', [S.pitFloor, 0, S.top, S.ceiling], [`Fossa ${V.pit}`, `Corsa ${S.top}`, `Testata ${V.headroom}`], [E('v.pit'), null, E('v.headroom')]);
    side('left', [S.pitFloor, S.ceiling], [`${V.pit + S.top + V.headroom} Altezza Totale Vano`]);
  }
  if (kind === 'top' || kind === 'floor') {
    side('left', [zf, zf + V.opTop], ['{v} H. Ingombro Max Operatore'], [E('v.opTop')]);
    side('left', [zf, zf + I.doorHeight], ['{v} H. Luce Porta di piano'], [E('doorHeight')]);
    side('left', [zf, zf + callStationOf(I).height], ['{v} H. Bottoniera'], [E('cs.height')]);
    if (kind === 'top') side('left', [zf, S.ceiling], ['Testata {v}'], [E('v.headroom')]);
    side('right', [zf, roof], ['{v} H. Esterno Cabina'], [E('v.carOutH')]);
    side('right', [zf, zf + V.frameTop], ['{v} Ingombro Arcata'], [E('v.frameTop')]);
    at(c.y + c.h / 2 + 40, [zf, zf + V.carH], ['{v} H. Interno Cabina'], [E('v.carH')]);
    at(c.y + 200, [zf, zf + I.doorHeight], ['{v} H. Luce Porta'], [E('doorHeight')]);
  }
  if (kind === 'top') {
    if (V.parapet > 0) side('right', [roof, roof + V.parapet], ['{v} H. Parapetto'], [E('v.parapet')]);
    side('right', [roof, S.ceiling], undefined, [E('v.headroom', V.carOutH)]);
    // car past the top floor with the counterweight on its compressed buffer
    const up = roof + S.moveUp;
    out.push(line(P(c.y - 60, up), P(c.y + c.h + 60, up), 'hidden'), { e: 'mark', at: P(c.y + c.h + 150, up), sym: 'overUp' });
    at(c.y + c.h - 120, [roof, up], ['{v}']);
    at(c.y + 90, [roof, roof + KV_VERT.refugeH[V.topRefuge]]);
  }
  if (kind === 'pit' || kind === 'full') {
    const plateCar = -V.frameBelow, low = plateCar - S.moveDown, x = c.y + c.h / 2;
    // the run-by of the car is set by the height of the buffers' plinths
    side('left', [S.pitFloor, S.pitFloor + V.carBufferBase, S.carBufferTop, ...(kind === 'pit' ? [plateCar, 0] : [])],
      ['{v} Base Ammort.', '{v} Ammort.', ...(kind === 'pit' ? ['{v}', '{v}'] : [])],
      [E('v.carBufferBase'), E('v.carBufferH'), ...(kind === 'pit' ? [E('v.carBufferBase', V.pit - V.frameBelow - V.carBufferH, -1), E('v.frameBelow')] : [])]);
    if (kind === 'pit') {
      side('left', [S.pitFloor, 0], ['Fossa {v}'], [E('v.pit')]);
      out.push(line(P(c.y - 60, low), P(c.y + c.h + 60, low), 'hidden'), { e: 'mark', at: P(c.y - 170, low), sym: 'overDown' });
      out.push({ e: 'text', at: P(x + 130, S.carBufferTop - V.carBufferH / 2), text: `Freccia ${V.carBufferStroke}`, size: 1.9 });
      at(x + 330, [S.pitFloor, S.pitFloor + KV_VERT.refugeH[V.pitRefuge]]);
    }
    const w = L.cw, cx = w.y + w.h / 2;
    side('right', [S.pitFloor, S.pitFloor + V.cwBufferBase, S.cwBufferTop], ['{v} Base Ammort.', '{v} Ammort.'], [E('v.cwBufferBase'), E('v.cwBufferH')]);
    side('right', [S.pitFloor, S.pitFloor + KV_VERT.cwScreen], ['{v} H. Protezione Contrappeso in Fossa']);
    out.push({ e: 'text', at: P(cx + 130, S.cwBufferTop - V.cwBufferH / 2), text: `Freccia ${V.cwBufferStroke}`, size: 1.9 });
  }
  if (kind === 'full') {
    const plate = S.pitFloor + S.cwLow + (S.top - zf);
    side('right', [plate, plate + V.cwH], ['{v} H. Ingombro Totale Contrappeso'], [E('v.cwH')]);
  }
  return out;
}
