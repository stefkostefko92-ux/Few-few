// The dimensions of the shaft's details in section A-A (round 36), after section-dims.ts's: the car at its extreme
// positions in the headroom's and the pit's details (extremes.ts), the plate under the sill in the detail of the car at a
// floor (toe.ts: its height changes the doors' unlocking zone). The references no input sets — the counterweight's
// screen's lower edge, the control box's heights — the pit's detail draws with the screen and the box (screen.ts,
// pit-kit.ts). Pure.
import { chain, edit as E, type Entity } from '../drawing';
import { extremeDims } from './extremes';
import { KV_VERT } from './norme-vert';
import type { Section } from './section';
import type { SectionKind } from './section-dims';
import { mapZ, type ZMap } from './section-view';
import { toeOf } from './toe';
import type { Layout } from './types';

export function detailDims(L: Layout, S: Section, kind: SectionKind, carFloor: number, zmap: ZMap | null, row: { left: number; right: number }): Entity[] {
  const I = L.inputs, V = I.vertical, out: Entity[] = [], Z = (z: number): number => mapZ(zmap, z), zf = S.levels[carFloor] ?? 0;
  if (kind === 'top' || kind === 'pit') out.push(...extremeDims(L, S, kind, zf));
  if (kind === 'floor') {
    // the plate under the landing sill of the floor, on the side of its entrance cut by the section
    const f = V.floors[carFloor], front = f?.door.includes('A') ?? false, rear = I.entrances === 'opposite' && (f?.door.includes('B') ?? false);
    if (front || rear) {
      const t = toeOf(I), x = front ? I.landingDepth : I.D - I.landingDepth, side = front ? 'left' : 'right';
      out.push(chain({ dir: 'y', side, row: row[side]++, pts: [Z(zf - t.h), Z(zf)], text: ['Sottosoglia {v}'], edit: [{ ...E('v.unlockZone', -KV_VERT.toeOver), value: t.h }], from: [x, x] }));
    }
  }
  return out;
}
