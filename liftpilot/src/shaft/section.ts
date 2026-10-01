// Section A-A of the shaft in numbers: floor levels, pit floor and ceiling, where the car and the counterweight are
// at each floor, the runbys and the moves onto the compressed buffers; and the checks in height (spaces in the
// headroom and in the pit, buffer strokes). Heights in millimetres from the lowest floor, up. Pure.
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import { levels } from './vertical';
import type { Layout, ShaftCheck } from './types';

export interface Section {
  /** floor levels, from 0 at the lowest floor */
  levels: number[];
  top: number;
  pitFloor: number;
  /** underside of the slab over the shaft */
  ceiling: number;
  carBufferTop: number;
  cwBufferTop: number;
  /** car buffer plate above its buffer, car at the lowest floor */
  carRunby: number;
  /** counterweight buffer plate above the floor of the pit, car at the top floor */
  cwLow: number;
  /** jump of the car when the counterweight lands [mm] */
  jump: number;
  /** car rise past the top floor with the counterweight on its compressed buffer, jump included */
  moveUp: number;
  /** car drop below the lowest floor with the car on its compressed buffers */
  moveDown: number;
  /** highest point of the car above its floor: frame, operator, balustrade */
  highest: number;
  /** stroke a buffer needs at this speed */
  strokeNeeded: number;
}

export function section(L: Layout): Section {
  const V = L.inputs.vertical, lv = levels(V.floors), top = lv[lv.length - 1] ?? 0, pitFloor = -V.pit;
  const carBufferTop = pitFloor + V.carBufferBase + V.carBufferH, cwBufferTop = pitFloor + V.cwBufferBase + V.cwBufferH;
  const carRunby = -V.frameBelow - carBufferTop, cwLow = V.cwBufferBase + V.cwBufferH + V.cwRunby;
  const jump = KV_VERT.jumpK * V.v * V.v * 1000;
  const strokeNeeded = Math.max(KV_VERT.strokeMin, KV_VERT.strokeK * V.v * V.v * 1000);
  return {
    levels: lv, top, pitFloor, ceiling: top + V.headroom, carBufferTop, cwBufferTop, carRunby, cwLow, jump,
    moveUp: V.cwRunby + V.cwBufferStroke + jump, moveDown: Math.max(0, carRunby) + V.carBufferStroke,
    highest: Math.max(V.frameTop, V.opTop, V.carOutH + V.parapet), strokeNeeded,
  };
}

/** Counterweight buffer plate above the pit floor with the car floor at `zf` (1:1 and 2:1 alike: same travel). */
export const cwPlateAt = (S: Section, zf: number): number => S.pitFloor + S.cwLow + (S.top - zf);

/** Largest free distance from the car roof to a wall without a door: the balustrade needs it. */
export function roofGap(L: Layout): number {
  const { W, D } = L.inputs, c = L.car, walls = L.doors.map((d) => d.wall);
  const gaps = [
    walls.includes('left') ? 0 : c.x, walls.includes('right') ? 0 : W - (c.x + c.w),
    walls.includes('rear') ? 0 : D - (c.y + c.h),
  ];
  return Math.max(...gaps);
}

export function sectionChecks(L: Layout): ShaftCheck[] {
  const V = L.inputs.vertical, S = section(L), K = KV_VERT;
  const top = S.top + S.moveUp, roof = top + V.carOutH, refugeTop = K.refugeH[V.topRefuge], refugePit = Math.max(K.pitClear, K.refugeH[V.pitRefuge]);
  // the tightest of the clearances from the ceiling with the car at its highest position
  const clear = [
    { v: S.ceiling - (top + V.opTop), lim: K.headEquip },
    { v: S.ceiling - (top + V.frameTop), lim: K.headShoe },
    ...(V.parapet > 0 ? [{ v: S.ceiling - (roof + V.parapet), lim: K.headBalustrade }] : []),
  ].sort((a, b) => a.v - a.lim - (b.v - b.lim))[0];
  const pitFree = V.carBufferBase + V.carBufferH - V.carBufferStroke;
  const apronFree = V.pit - S.moveDown - K.apron;
  const gap = roofGap(L), needed = gap > K.parapetGap2 ? K.parapetH2 : gap > K.parapetGap1 ? K.parapetH1 : 0;
  const springs = V.v <= K.springMaxV + 1e-9;
  return [
    check('h_refuge', S.ceiling - roof >= refugeTop, S.ceiling - roof, refugeTop, 0, 'mm'),
    check('h_clear', clear.v >= clear.lim, clear.v, clear.lim, 0, 'mm'),
    check('h_parapet', V.parapet >= needed, V.parapet, needed, 0, 'mm'),
    check('p_refuge', pitFree >= refugePit, pitFree, refugePit, 0, 'mm'),
    check('p_apron', apronFree >= K.apronClear, apronFree, K.apronClear, 0, 'mm', true),
    check('b_runby', S.carRunby >= 0 && V.cwRunby >= 0, Math.min(S.carRunby, V.cwRunby), 0, 0, 'mm'),
    check('b_car', springs && V.carBufferStroke >= S.strokeNeeded, V.carBufferStroke, Math.ceil(S.strokeNeeded), 0, 'mm'),
    check('b_cw', springs && V.cwBufferStroke >= S.strokeNeeded, V.cwBufferStroke, Math.ceil(S.strokeNeeded), 0, 'mm'),
  ];
}
