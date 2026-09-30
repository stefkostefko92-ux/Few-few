// Dimensions of section A-A by view: the whole shaft (pit, travel, headroom, total height), the headroom with the
// car at the top floor, the car at a floor with its heights, the pit with buffers and the counterweight's spaces.
// Values are the real ones even where the travel is drawn compressed; the overtravels of the car are shown as
// dashed lines with their symbols.
import { chain, line, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { mapZ, type ZMap } from './section-view';
import type { Section } from './section';
import type { Layout } from './types';

export type SectionKind = 'full' | 'top' | 'floor' | 'pit';

export function sectionDims(L: Layout, S: Section, kind: SectionKind, carFloor: number, zmap: ZMap | null): Entity[] {
  const I = L.inputs, V = I.vertical, out: Entity[] = [], Z = (z: number): number => mapZ(zmap, z);
  const P = (x: number, z: number): Pt => [x, Z(z)];
  const row = { left: 0, right: 0 };
  const side = (s: 'left' | 'right', pts: number[], text?: (string | null)[]): void => {
    out.push(chain({ dir: 'y', pts: pts.map(Z), side: s, row: row[s]++, text }));
  };
  const at = (x: number, pts: number[], text?: (string | null)[]): void => {
    out.push(chain({ dir: 'y', pts: pts.map(Z), at: x, text }));
  };
  const zf = S.levels[carFloor] ?? 0, roof = zf + V.carOutH, c = L.car;

  if (kind === 'full') {
    side('left', [S.pitFloor, 0, S.top, S.ceiling], [`Fossa ${V.pit}`, `Corsa ${S.top}`, `Testata ${V.headroom}`]);
    side('left', [S.pitFloor, S.ceiling], [`${V.pit + S.top + V.headroom} Altezza Totale Vano`]);
  }
  if (kind === 'top' || kind === 'floor') {
    side('left', [zf, zf + V.opTop], ['{v} H. Ingombro Max Operatore']);
    side('left', [zf, zf + I.doorHeight], ['{v} H. Luce Porta di piano']);
    if (kind === 'top') side('left', [zf, S.ceiling], ['Testata {v}']);
    side('right', [zf, roof], ['{v} H. Esterno Cabina']);
    side('right', [zf, zf + V.frameTop], ['{v} Ingombro Arcata']);
    at(c.y + c.h / 2 + 40, [zf, zf + V.carH], ['{v} H. Interno Cabina']);
    at(c.y + 200, [zf, zf + I.doorHeight], ['{v} H. Luce Porta']);
  }
  if (kind === 'top') {
    if (V.parapet > 0) side('right', [roof, roof + V.parapet], ['{v} H. Parapetto']);
    side('right', [roof, S.ceiling]);
    // car past the top floor with the counterweight on its compressed buffer
    const up = roof + S.moveUp;
    out.push(line(P(c.y - 60, up), P(c.y + c.h + 60, up), 'hidden'), { e: 'mark', at: P(c.y + c.h + 150, up), sym: 'overUp' });
    at(c.y + c.h - 120, [roof, up], ['{v}']);
    at(c.y + 90, [roof, roof + KV_VERT.refugeH[V.topRefuge]]);
  }
  if (kind === 'pit' || kind === 'full') {
    const plateCar = -V.frameBelow, low = plateCar - S.moveDown, x = c.y + c.h / 2;
    side('left', [S.pitFloor, S.pitFloor + V.carBufferBase, S.carBufferTop, ...(kind === 'pit' ? [plateCar, 0] : [])],
      ['{v} Base Ammort.', '{v} Ammort.', ...(kind === 'pit' ? ['{v}', '{v}'] : [])]);
    if (kind === 'pit') {
      side('left', [S.pitFloor, 0], ['Fossa {v}']);
      out.push(line(P(c.y - 60, low), P(c.y + c.h + 60, low), 'hidden'), { e: 'mark', at: P(c.y - 170, low), sym: 'overDown' });
      out.push({ e: 'text', at: P(x + 130, S.carBufferTop - V.carBufferH / 2), text: `Freccia ${V.carBufferStroke}`, size: 1.9 });
      at(x + 330, [S.pitFloor, S.pitFloor + KV_VERT.refugeH[V.pitRefuge]]);
    }
    const w = L.cw, cx = w.y + w.h / 2;
    side('right', [S.pitFloor, S.pitFloor + V.cwBufferBase, S.cwBufferTop], ['{v} Base Ammort.', '{v} Ammort.']);
    side('right', [S.pitFloor, S.pitFloor + KV_VERT.cwScreen], ['{v} H. Protezione Contrappeso in Fossa']);
    out.push({ e: 'text', at: P(cx + 130, S.cwBufferTop - V.cwBufferH / 2), text: `Freccia ${V.cwBufferStroke}`, size: 1.9 });
  }
  if (kind === 'full') {
    const plate = S.pitFloor + S.cwLow + (S.top - zf);
    side('right', [plate, plate + V.cwH], ['{v} H. Ingombro Totale Contrappeso']);
  }
  return out;
}
