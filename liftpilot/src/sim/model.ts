// What the simulation needs of an installation: the calculation (plant, machine, results) and the section of the
// shaft (floor levels, buffers, runbys), with heights in metres from the lowest floor. Built once per design; the
// scenarios read it. Pure.
import type { Machine, Plant, Results } from '../calc/types';
import type { Section } from '../shaft/section';
import type { BufferType, VerticalInputs } from '../shaft/vertical';
import { bufferType } from '../shaft/buffers';
import { KV_VERT } from '../shaft/norme-vert';
import { physics, type Physics } from './physics';
import type { Series, SimEvent } from './series';

export interface SimModel {
  I: Plant;
  M: Machine;
  res: Results;
  phys: Physics;
  /** floor levels above the lowest floor [m] and their labels */
  levels: readonly number[];
  labels: readonly string[];
  /** travel [m] */
  H: number;
  /** counterweight buffer plate with the car floor at s: cw0 − s [m] */
  cw0: number;
  /** car floor where the car's buffer plate touches its buffers (below the lowest floor), where the counterweight
   *  plate touches its buffer (above the top floor) [m] */
  carContact: number;
  cwContact: number;
  /** buffer strokes [m] (a polyurethane pad's 90 % of its height), their types and the number of car buffers */
  carStroke: number;
  cwStroke: number;
  carType: BufferType;
  cwType: BufferType;
  carBuffers: number;
  /** linear buffers: full stroke at this many times the static load (registry sim.ammortizzatori) */
  bufferFactor: number;
}

export function simModel(I: Plant, M: Machine, res: Results, S: Section, V: VerticalInputs): SimModel {
  const mm = (x: number): number => x / 1000;
  return {
    I, M, res, phys: physics(I, M),
    levels: S.levels.map(mm), labels: V.floors.map((f) => f.label), H: I.H,
    cw0: mm(S.pitFloor + S.cwLow + S.top),
    carContact: mm(S.carBufferTop + V.frameBelow),
    cwContact: mm(S.top + V.cwRunby),
    carStroke: mm(S.carStroke), cwStroke: mm(S.cwStroke), carType: bufferType(V, 'car'), cwType: bufferType(V, 'cw'), carBuffers: V.carBuffers,
    bufferFactor: KV_VERT.bufferFactor,
  };
}

/** The car floor kept between its buffers fully compressed (below) and the counterweight's (above); how much each
 *  buffer is compressed there [m]. */
export function travelLimits(m: SimModel, s: number): { s: number; bufCar: number; bufCw: number } {
  const c = Math.min(Math.max(s, m.carContact - m.carStroke), m.cwContact + m.cwStroke);
  return { s: c, bufCar: Math.max(0, m.carContact - c), bufCw: Math.max(0, c - m.cwContact) };
}

export type ScenarioId = 'ride' | 'brake' | 'loading' | 'stall' | 'buffer';

export interface RideParams { from: number; to: number; load: number }
/** pos: the end position of the verification's case (default: the governing one for this load and direction); load
 *  'q125': the acceptance test's 1,25·Q, moving down with the real brake only (UNI EN 81-20:2020, 6.3.3 b)) */
export interface BrakeParams { load: 'q' | 'e' | 'q125'; dir: 'dn' | 'up'; decel: 'real' | 'norm'; pos?: 'b' | 't' }

/** The braking case as the verification has it: the test's 1,25·Q exists only moving down with the real brake; asked
 *  otherwise, the rated load. */
export const brakeParams = (p: BrakeParams): BrakeParams => (p.load === 'q125' && (p.dir !== 'dn' || p.decel !== 'real') ? { ...p, load: 'q' } : p);
export interface BufferParams { side: 'car' | 'cw' }

export type ScenarioParams =
  | { id: 'ride'; p: RideParams }
  | { id: 'brake'; p: BrakeParams }
  | { id: 'loading' }
  | { id: 'stall' }
  | { id: 'buffer'; p: BufferParams };

export interface SimSummary {
  /** worst T1/T2 against e^(f·α) (utilisation), the ratio and the limit at that moment */
  util: number;
  ratio: number;
  efa: number;
  /** largest motor or brake torque [N·m], largest acceleration or deceleration [m/s²] */
  torque: number;
  accel: number;
  /** emergency stop: distances without and with the slip [m] */
  stopDistance?: number;
  slipDistance?: number;
  /** emergency stop with the brake's own deceleration: what the brake alone gives [m/s²] (≤ 0: it cannot hold the car) */
  brakeOwn?: number;
  /** buffers: largest compression and the stroke [m] */
  compression?: number;
  stroke?: number;
  slip: boolean;
}

export interface SimRun {
  scenario: ScenarioParams;
  series: Series;
  events: readonly SimEvent[];
  summary: SimSummary;
  verdict: 'ok' | 'warn' | 'fail';
}
