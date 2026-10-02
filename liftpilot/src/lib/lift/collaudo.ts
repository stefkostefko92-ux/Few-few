// The reference standard of the lift's acceptance test (collaudo) and what the intervention replaces or changes. A new
// lift is tested to UNI EN 81-20:2020 and UNI EN 81-50:2020: every check applies. A modification of an existing lift is
// tested to UNI 10411-1:2024 (a lift not built to the directives) or UNI 10411-11:2024 (built to 95/16/CE or
// 2014/33/UE): a check applies only when the intervention touches what it checks — a part replaced, a change of speed,
// load or travel —; the others concern what stays as it is ("esistente": shown with their value, not counted in the
// verdict). Which parts each check concerns is the software's reading (registry impianto.collaudo), to be confirmed by
// the engineer on the standard in force. Pure.
import type { CheckId, FormValues } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';

export const NORME_COLLAUDO = ['en81', '10411-1', '10411-11'] as const;
export type NormaCollaudo = (typeof NORME_COLLAUDO)[number];

/** The standard as the documents name it. */
export const NORMA_SIGLA: Readonly<Record<NormaCollaudo, string>> = {
  en81: 'UNI EN 81-20:2020 e UNI EN 81-50:2020', '10411-1': 'UNI 10411-1:2024', '10411-11': 'UNI 10411-11:2024',
};

/** The standard in a few characters (the verdict's badge). */
export const NORMA_BREVE: Readonly<Record<NormaCollaudo, string>> = { en81: 'EN 81-20/50', '10411-1': 'UNI 10411-1', '10411-11': 'UNI 10411-11' };

/** What an intervention can replace (the parts) or change (speed, rated load, travel). */
export const PARTI = ['machine', 'ropes', 'car', 'sling', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor', 'controller', 'speed', 'load', 'travel'] as const;
export type Parte = (typeof PARTI)[number];

export interface Collaudo {
  norma: NormaCollaudo;
  /** replaced or changed by the intervention (a new lift: everything) */
  parti: readonly Parte[];
}

/** The check of a result: applies to the acceptance test, or concerns a part that stays as it is. */
export type Ambito = 'applies' | 'existing';

const TRACTION: readonly Parte[] = ['machine', 'ropes', 'car', 'cw', 'load', 'travel'];
const ROPES: readonly Parte[] = ['machine', 'ropes', 'load'];
const DRIVE: readonly Parte[] = ['machine', 'speed', 'load', 'car', 'cw', 'travel'];
const HEAD: readonly Parte[] = ['car', 'sling', 'cw', 'buffers', 'speed', 'rails'];
const PIT: readonly Parte[] = ['car', 'sling', 'buffers', 'speed'];
const BUFFERS: readonly Parte[] = ['buffers', 'speed', 'car', 'cw', 'load'];
const DOORS: readonly Parte[] = ['landingDoors', 'carDoors'];

/** The parts each check concerns: replacing or changing any of them brings the check into the acceptance test. */
export const AMBITO_VERIFICHE: Readonly<Record<CheckId | ShaftCheckId, readonly Parte[]>> = {
  // the machine's checks: traction (UNI EN 81-50, 5.11), ropes and grooves, drive, shaft, brake, rescue
  tr_load: TRACTION, tr_dn: TRACTION, tr_up: TRACTION, tr_real: TRACTION, tr_stall: TRACTION,
  r_dd: ['machine', 'ropes'], r_ddp: ['machine', 'ropes'], r_nd: ROPES, g_geom: ['machine', 'ropes'], r_sfa: [...ROPES, 'car', 'cw'],
  d_pst: DRIVE, d_ratio: DRIVE, d_mp: DRIVE, s_shaft: ['machine', 'ropes', 'car', 'cw', 'load', 'travel'],
  b_sets: ['machine'], b_all: DRIVE, b_one: DRIVE, b_up: DRIVE, b_amax: DRIVE,
  s_force: ['machine', 'car', 'cw', 'load'], s_uplift: ['machine', 'car', 'cw', 'load'],
  // the shaft in plan: the car and its rated load, the doors, the counterweight and the rails
  v_fit: ['car'], v_area: ['car', 'load'], v_acc_car: ['car'], v_acc_door: DOORS, v_acc_side: ['car', ...DOORS],
  v_door: ['landingDoors'], v_door2: ['landingDoors'], v_op: ['carDoors'], v_wall: ['car', ...DOORS], v_sill: ['car', ...DOORS],
  v_cw: ['car', 'cw', 'rails'], v_cwlen: ['cw'], v_place: ['car', 'cw', 'rails', ...DOORS], v_doorcar: ['car', ...DOORS],
  v_buffer: ['buffers'], v_niche: ['cw'], v_staffa: ['cw', 'rails'], v_head: ['car', 'cw', 'rails'],
  // the headroom and the pit: their spaces follow the car, its frame, the buffers and the speed
  h_refuge: HEAD, h_clear: HEAD, h_parapet: ['car'], h_stand: ['car'],
  p_refuge: PIT, p_apron: [...PIT, 'carDoors'], p_screen: ['cw'],
  b_runby: BUFFERS, b_type: ['buffers', 'speed'], b_car: ['buffers', 'speed'], b_cw: ['buffers', 'speed'],
  // the machine room is the building's; the panel's space follows a new controller; the beams under a new machine
  m_height: [], m_panel: ['controller'], m_door: [], m_beam: ['machine'], m_beamf: ['machine'],
};

const isNorma = (x: unknown): x is NormaCollaudo => NORME_COLLAUDO.some((n) => n === x);

/** The acceptance standard of the one form: a new lift is tested to EN 81-20/50 whatever was chosen; a replacement as
 *  chosen, by default UNI 10411-1 with the machine replaced (the intervention the software is made for). */
export function collaudoOf(calc: FormValues, chosen?: Collaudo): Collaudo {
  if (calc.context === 'new') return { norma: 'en81', parti: PARTI };
  if (chosen && isNorma(chosen.norma)) return chosen.norma === 'en81' ? { norma: 'en81', parti: PARTI } : { norma: chosen.norma, parti: PARTI.filter((p) => chosen.parti.includes(p)) };
  return { norma: '10411-1', parti: ['machine'] };
}

/** Whether a check applies to the acceptance test of this intervention. */
export const ambitoOf = (C: Collaudo, id: CheckId | ShaftCheckId): Ambito =>
  C.norma === 'en81' || AMBITO_VERIFICHE[id].some((p) => C.parti.includes(p)) ? 'applies' : 'existing';

/** The adaptations a machine replaced under UNI 10411-1 brings (registry sostituzione.adeguamenti); none otherwise. */
export const adeguamentiDovuti = (C: Collaudo): boolean => C.norma === '10411-1' && C.parti.includes('machine');

/** The lift's verdict for its acceptance test: the worst status of the checks that apply, and how many fail or warn. */
export function collaudoVerdict(C: Collaudo, checks: readonly { id: CheckId | ShaftCheckId; status: string }[]): { verdict: 'ok' | 'warn' | 'fail'; fails: number; warns: number } {
  const on = checks.filter((c) => ambitoOf(C, c.id) === 'applies'), fails = on.filter((c) => c.status === 'fail').length, warns = on.filter((c) => c.status === 'warn').length;
  return { verdict: fails ? 'fail' : warns ? 'warn' : 'ok', fails, warns };
}
