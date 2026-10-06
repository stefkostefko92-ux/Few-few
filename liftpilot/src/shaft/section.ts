// Section A-A of the shaft in numbers: floor levels, pit floor and ceiling, where the car and the counterweight are
// at each floor, the runbys and the moves onto the compressed buffers; and the checks in height (spaces in the
// headroom and in the pit, buffer strokes). Heights in millimetres from the lowest floor, up. Pure.
import { bufferStroke, bufferType, maxSpeed, strokeNeeded } from './buffers';
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import { topPairStops } from './staffe-porte';
import { levels, type VerticalInputs } from './vertical';
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
  /** strokes the section takes and the least the rated speed needs, car and counterweight buffers [mm] (buffers.ts) */
  carStroke: number;
  cwStroke: number;
  strokeNeeded: { car: number; cw: number };
}

export function section(L: Layout): Section {
  const V = L.inputs.vertical, lv = levels(V.floors), top = lv[lv.length - 1] ?? 0, pitFloor = -V.pit;
  const carBufferTop = pitFloor + V.carBufferBase + V.carBufferH, cwBufferTop = pitFloor + V.cwBufferBase + V.cwBufferH;
  const carRunby = -V.frameBelow - carBufferTop, cwLow = V.cwBufferBase + V.cwBufferH + V.cwRunby;
  const jump = KV_VERT.jumpK * V.v * V.v * 1000, carStroke = bufferStroke(V, 'car'), cwStroke = bufferStroke(V, 'cw');
  return {
    levels: lv, top, pitFloor, ceiling: top + V.headroom, carBufferTop, cwBufferTop, carRunby, cwLow, jump,
    moveUp: V.cwRunby + cwStroke + jump, moveDown: Math.max(0, carRunby) + carStroke,
    highest: Math.max(V.frameTop, V.opTop, V.carOutH + V.parapet), carStroke, cwStroke,
    strokeNeeded: { car: strokeNeeded(V, bufferType(V, 'car')), cw: strokeNeeded(V, bufferType(V, 'cw')) },
  };
}

/** The place to stand on the car roof, across and along the car [mm]: as set, else as drawn by default. */
export const standOf = (V: VerticalInputs): readonly [number, number] => [V.standW ?? KV_VERT.standDrawn[0], V.standD ?? KV_VERT.standDrawn[1]];

/** Top of the counterweight's screen over the pit floor [mm]: as set, else the least the standard asks. */
export const screenOf = (V: VerticalInputs): number => V.cwScreen ?? KV_VERT.cwScreen;

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
  const pitFree = V.carBufferBase + V.carBufferH - S.carStroke;
  // the apron: its vertical part, then the bevel's drop (5.4.5.1: ≥ 60° with a horizontal projection ≥ 20 mm)
  const apronFree = V.pit - S.moveDown - (K.apron + K.apronBevel * Math.tan((K.apronBevelAngle * Math.PI) / 180));
  // a balustrade when the roof's edge is over 300 mm from the wall; its height by the handrail's inner edge to the wall
  const gap = roofGap(L), railGap = gap + K.parapetEdge + K.parapetBar;
  const needed = gap > K.parapetGap1 ? (railGap > K.parapetGap2 ? K.parapetH2 : K.parapetH1) : 0;
  // the buffers' types for the rated speed: the lowest limit of the two (hydraulic ones have none)
  const limits = (['car', 'cw'] as const).map((sd) => maxSpeed(bufferType(V, sd))).filter((x): x is number => x !== null);
  const vmax = limits.length ? Math.min(...limits) : null, need = S.strokeNeeded;
  // the place to stand on the car roof and the counterweight's screen in the pit, as drawn
  const [sw, sd] = standOf(V), standArea = (sw * sd) / 1e6, screen = screenOf(V);
  // the counterweight with the car on its compressed buffers: what its rails still guide past its top
  const guided = S.ceiling - K.railTopGap - (cwPlateAt(S, -S.moveDown) + V.cwH), guide = (K.cwGuided + K.cwGuidedV2 * V.v * V.v) * 1000;
  // the car at its highest point (the jump included): what its rails still guide past the top of its sling, where the
  // upper shoes are taken to be — a warning, the shoes' own height is the supplier's (audit 2026-10-06)
  const carGuided = S.ceiling - K.railTopGap - (top + V.frameTop);
  // the wall the pairs over the landing doors need, at the tightest stop (staffe-porte.ts): a warning, the mounting is
  // the software's
  const tops = topPairStops(L, S.levels), room = tops.length ? Math.min(...tops.map((t) => t.room)) : null;
  return [
    check('h_refuge', S.ceiling - roof >= refugeTop, S.ceiling - roof, refugeTop, 0, 'mm'),
    check('h_clear', clear.v >= clear.lim, clear.v, clear.lim, 0, 'mm'),
    check('h_parapet', V.parapet >= needed, V.parapet, needed, 0, 'mm'),
    check('h_stand', standArea >= K.roofFreeArea - 1e-9 && Math.min(sw, sd) > K.roofFreeSide, standArea, K.roofFreeArea, 2, 'm²'),
    check('h_door', L.inputs.doorHeight >= K.entranceH, L.inputs.doorHeight, K.entranceH, 0, 'mm'),
    ...(room !== null ? [check('h_staffe', room >= 0, room, 0, 0, 'mm', true)] : []),
    check('h_car', V.carH >= K.carInnerH, V.carH, K.carInnerH, 0, 'mm'),
    check('h_cw', guided >= guide - 1e-9, guided, Math.ceil(guide), 0, 'mm'),
    check('h_guide', carGuided >= K.carGuided * 1000 - 1e-9, carGuided, K.carGuided * 1000, 0, 'mm', true),
    check('p_refuge', pitFree >= refugePit, pitFree, refugePit, 0, 'mm'),
    check('p_apron', apronFree >= K.apronClear, apronFree, K.apronClear, 0, 'mm', true),
    check('p_screen', screen >= K.cwScreen, screen, K.cwScreen, 0, 'mm'),
    check('b_runby', S.carRunby >= 0 && V.cwRunby >= 0, Math.min(S.carRunby, V.cwRunby), 0, 0, 'mm'),
    check('b_type', vmax === null || V.v <= vmax + 1e-9, V.v, vmax, 2, 'm/s'),
    check('b_car', S.carStroke >= need.car - 1e-9, S.carStroke, need.car > 0 ? Math.ceil(need.car) : null, 0, 'mm'),
    check('b_cw', S.cwStroke >= need.cw - 1e-9, S.cwStroke, need.cw > 0 ? Math.ceil(need.cw) : null, 0, 'mm'),
  ];
}
