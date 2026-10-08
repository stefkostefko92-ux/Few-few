// A whole project from what the installation already has (src/server/lift-start.ts reads it): its latest shaft design
// (the shaft as it was entered), else the survey of a replacement's machine room (the shaft under it, its walls and
// the room as measured); its latest calculation (the speed, the rated load, the roping, the machine's place, the
// machines and the standards of its test, entered as they were) — a direct pull with the car and the counterweight
// under the drops the survey measured (drops.ts). Everything else of the project is still to enter: the floors (their
// rises give the travel), the doors, the pit and headroom… Pure: the server reads the records, this composes them.
import { readInputs } from '@/calc/index';
import type { FormValues } from '@/calc/types';
import type { Survey } from '@/lib/room/survey';
import type { ShaftInputs } from '@/shaft';
import { ROOM_FIELDS, SHAFT_FIELDS, blankLift, type BlankKey, type LiftDraft } from './blank';
import type { Collaudo } from './collaudo';
import { AUTO_ALL } from './defaults';
import { atSurveyDrops } from './drops';

export interface CarriedFrom {
  /** the latest shaft design's inputs */
  shaft: ShaftInputs | null;
  /** the latest calculation's values, with the standards chosen for its test (null: none chosen) */
  calc: { values: FormValues; collaudo: Collaudo | null } | null;
  /** the latest survey of the machine room (taken only without a shaft design) */
  survey: Survey | null;
}

const roomKeys = (): BlankKey[] => ROOM_FIELDS.map((k): BlankKey => `room.${k}`);

export function carriedOver({ shaft, calc, survey }: CarriedFrom): LiftDraft {
  const start = blankLift(), base = start.inputs, blank = new Set<BlankKey>(start.blank);
  const entered = (...keys: BlankKey[]): void => keys.forEach((k) => blank.delete(k));
  if (!shaft && !calc) return start;
  // a shaft design: the whole shaft as it was entered
  if (shaft) entered(...SHAFT_FIELDS, 'v', 'pit', 'headroom', 'floors', ...roomKeys());
  const values = calc ? calc.values : base.calc;
  const q = Number(values.Q), v = Number(values.v);
  let S = shaft ?? base.shaft;
  // a replacement's survey: the shaft under the machine room (inner size, walls) and the room as measured
  const R = shaft ? null : survey;
  if (R) {
    S = { ...S, W: R.shaft.W, D: R.shaft.D, wall: R.shaft.wall, room: R.room };
    entered('W', 'D', 'wall', ...roomKeys());
  }
  if (calc && Number.isFinite(v) && v > 0) {
    S = { ...S, vertical: { ...S.vertical, v } };
    entered('v');
  }
  // the calculation's roping and machine place are entered; its travel is the floors' to enter (their rises give it)
  if (calc) entered('r', 'layout');
  // the rated load of the calculation is the one the installation has: the shaft takes it as given
  if (calc && Number.isFinite(q) && q > 0) {
    S = { ...S, Q: Math.round(q) };
    entered('Q', 'Qkg');
  }
  // a direct pull hangs the falls from the sheave's two sides: the plan's car and counterweight where the survey has
  // the ropes (the counterweight's side with them), not where the example puts them
  const atDrops = R && calc && readInputs(calc.values).I.layout === 'top' ? atSurveyDrops(S, R) : null;
  if (atDrops) {
    S = atDrops;
    entered('cw');
  }
  return {
    inputs: {
      shaft: S,
      calc: values,
      // what was entered stays entered; the rope beyond the travel and a machine below's Hv are the shaft design's (the
      // replacement's calculator had no shaft: its values, often the example's, would contradict the drawing — registry
      // impianto.L0, impianto.Hv)
      auto: calc ? { P: false, machine: false, L0: true, dx: false, Hv: true } : AUTO_ALL,
      // the standards chosen for the replacement's test
      ...(calc?.collaudo ? { collaudo: calc.collaudo } : {}),
    },
    blank: start.blank.filter((k) => blank.has(k)),
  };
}
