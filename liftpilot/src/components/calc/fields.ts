// Form definition of the prototype v12: the same fields, units, steps, hints and "expert only" marks (adv), and
// the same visibility rules (syncVisibility).
import type { FormValues } from '@/calc/types';
import type { CalcKey } from '@/lib/present/tr';
import { CATENE_COMP, FUNI_CATALOGO, FUNI_COMP, nomeFune } from '@/lib/rt2/cataloghi/funi';

interface Base {
  id: string;
  /** label key; the field id when absent */
  key?: CalcKey;
  hint?: CalcKey;
  /** hidden in simple mode */
  adv?: boolean;
}
/** `err`: the text shown under the field while it is flagged (the reason of a bound the engine refuses) */
export interface NumField extends Base { kind: 'num'; unit: string; step: number; err?: CalcKey }
export interface SelectField extends Base { kind: 'select'; options: readonly { value: string; label: CalcKey | string; literal?: boolean }[]; wide?: boolean }
export interface CheckField extends Base { kind: 'check' }
export type Field = NumField | SelectField | CheckField;

const num = (id: string, unit: string, step: number, extra: Partial<NumField> = {}): NumField => ({ id, kind: 'num', unit, step, ...extra });
const opt = (value: string, label: CalcKey) => ({ value, label });
const lit = (value: string, label: string) => ({ value, label, literal: true });

export const PLANT: readonly Field[] = [
  { id: 'context', kind: 'select', options: [opt('repl', 'ctx_repl'), opt('new', 'ctx_new')], wide: true },
  // the standard of a replacement's machine (UNI 10411-1:2024, 14.1 a) or b)): the rescue and the stalled check differ
  { id: 'machineStd', kind: 'select', options: [opt('en81-20', 'std_20'), opt('en81-1', 'std_1')], wide: true, hint: 'hint_machineStd' },
  num('Q', 'kg', 10), num('P', 'kg', 10, { hint: 'hint_P' }), num('k', '', 0.01),
  num('qeq', 'kg', 5, { hint: 'hint_qeq' }), num('v', 'm/s', 0.05, { err: 'err_v' }), num('H', 'm', 0.5),
  num('L0', 'm', 0.5, { adv: true }), { id: 'r', kind: 'select', options: [lit('1', 'Diretto'), lit('2', 'Indiretto 1:2')] },
];

export const ROPES = (p: 'n_' | 'o_'): readonly Field[] => [
  num(p + 'n', '', 1, { key: 'n' }), num(p + 'd', 'mm', 0.5, { key: 'd' }), num(p + 'Fmin', 'kN', 0.1, { key: 'Fmin' }), num(p + 'qf', 'kg/m', 0.001, { key: 'qf' }),
];

export const LAYOUT: readonly Field[] = [
  { id: 'layout', kind: 'select', options: [opt('top', 'lay_top'), opt('topDefl', 'lay_topDefl'), opt('bottom', 'lay_bottom')], wide: true },
  { id: 'alphaMode', kind: 'select', options: [opt('geo', 'am_geo'), opt('manual', 'am_manual')], wide: true, hint: 'hint_geo' },
  num('alphaManual', '°', 0.5), { id: 'dropAlign', kind: 'select', options: [opt('center', 'da_center'), opt('car', 'da_car')], wide: true },
  num('dx', 'm', 0.01), num('h', 'm', 0.01),
  num('Hv', 'm', 0.5), num('Dp', 'mm', 10, { hint: 'hint_Dp' }), num('Jp', 'kg·m²', 0.1, { adv: true }),
  num('nps', '', 1, { adv: true, hint: 'hint_bends' }), num('npr', '', 1, { adv: true }), num('etaShaft', '', 0.01, { adv: true }),
];

export const MACHINE = (p: 'n_' | 'o_'): readonly Field[] => [
  num(p + 'D', 'mm', 10, { key: 'D' }),
  { id: p + 'groove', key: 'groove', kind: 'select', options: [opt('U', 'gr_U'), opt('UU', 'gr_UU'), opt('VH', 'gr_VH'), opt('VN', 'gr_VN')], wide: true },
  num(p + 'beta', '°', 0.5, { key: 'beta' }), num(p + 'gamma', '°', 0.5, { key: 'gamma' }),
  num(p + 'i', '', 0.5, { key: 'i' }), num(p + 'etaD', '', 0.01, { key: 'etaD' }),
  num(p + 'etaI', '', 0.01, { key: 'etaI', hint: 'hint_etaI', adv: true }),
  { id: p + 'poles', key: 'poles', kind: 'select', options: [lit('2', '2'), lit('4', '4'), lit('6', '6'), lit('8', '8')], adv: true },
  num(p + 'fn', 'Hz', 1, { key: 'fn', adv: true }), num(p + 'nm', '1/min', 5, { key: 'nm' }),
  num(p + 'Pn', 'kW', 0.1, { key: 'Pn' }), num(p + 'Jm', 'kg·m²', 0.01, { key: 'Jm', adv: true }),
  num(p + 'Js', 'kg·m²', 0.1, { key: 'Js', adv: true }), num(p + 'brakeSets', '', 1, { key: 'brakeSets' }),
  num(p + 'brakeNm', 'N·m', 1, { key: 'brakeNm' }), num(p + 'shaftMax', 'kg', 50, { key: 'shaftMax', hint: 'hint_shaftMax', adv: p === 'o_' }),
  num(p + 'MpCat', 'N·m', 10, { key: 'MpCat', hint: 'hint_MpCat', adv: p === 'o_' }),
  num(p + 'mass', 'kg', 10, { key: 'mass' }),
];

export const SERVICE: readonly Field[] = [num('aDesign', 'm/s²', 0.05), { id: 'buffers', kind: 'check' }, num('ae', 'm/s²', 0.05, { hint: 'hint_ae' }),
  num('aBrake', 'm/s²', 0.05), num('rh', 'm', 0.01), { id: 'stallDevice', kind: 'check', hint: 'hint_stallDevice' }];

const it = (x: number): string => String(x).replace('.', ',');
/** The rope data of the owner's model for a modification (round 52, the RT's rope pages and the model's rope checks):
 *  the rope from its lists (filling diameter, breaking load and mass), the compensation, the travelling cable, the
 *  reduced deceleration of D.1 (lib/rt2/funi-calc.ts reads them). */
export const FUNI_10411: readonly Field[] = [
  { id: 'n_cat', kind: 'select', options: [opt('', 'cat_mano'), ...FUNI_CATALOGO.map((f) => lit(f.id, nomeFune(f)))], wide: true },
  { id: 'compTipo', kind: 'select', options: [opt('nessuna', 'comp_nessuna'), opt('funi', 'comp_funi'), opt('catene', 'comp_catene')] },
  { id: 'compFune', kind: 'select', options: FUNI_COMP.map((c, i) => lit(String(i + 1), `${it(c.d)} mm · ${it(c.q)} kg/m`)) },
  { id: 'compCatena', kind: 'select', options: CATENE_COMP.map((c, i) => lit(String(i + 1), `${it(c.d)} mm · ${it(c.q)} kg/m`)) },
  num('compN', '', 1), num('compMt', 'kg', 1), num('compDt', 'mm', 10), { id: 'compCwt', kind: 'check' },
  num('caviQ', 'kg/m', 0.1, { adv: true }), { id: 'aRidotta', kind: 'check', adv: true },
];

/** Every id the form can send (the server accepts nothing else). */
export const FIELD_IDS: readonly string[] = [
  ...[PLANT, LAYOUT, MACHINE('n_'), MACHINE('o_'), ROPES('n_'), ROPES('o_'), SERVICE, FUNI_10411].flat().map((f) => f.id),
  'compare', 'keepD', 'keepRopes',
  // the catalogue's maker and model taken from the advice ("SICOR SH160"): two models of equal data stay apart
  'n_model',
];

const numOf = (V: FormValues, id: string): number => {
  const x = parseFloat(String(V[id] ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};

/** Visibility of a row (prototype syncVisibility); rows not listed are always shown. */
export function shown(id: string, V: FormValues): boolean {
  switch (id) {
    // the calculation's context follows the type of intervention chosen above the form (src/lib/lift/intervento.ts
    // contestoDi): never a field of its own, still among the values and in the hash
    case 'context': return false;
    case 'alphaManual': return V.alphaMode === 'manual';
    // the new sheave on the existing drops: the wrap angle from the geometry reads it, and the machine room's sheave and
    // falls whatever the angle (room/derive.ts calcDrops, tavole/survey-data.ts fallSlants; round 46: with the angle entered by hand too)
    case 'dropAlign': return V.context === 'repl' && V.layout === 'top' && !!V.compare;
    case 'dx': case 'h': return V.layout === 'topDefl';
    case 'Hv': return V.layout === 'bottom';
    case 'Dp': return V.layout !== 'top' || V.r === '2' || numOf(V, 'nps') + numOf(V, 'npr') > 0;
    // the diverting pulleys, and the car's and the counterweight's at 2:1
    case 'Jp': return V.layout !== 'top' || V.r === '2';
    case 'ae': return !!V.buffers;
    case 'machineStd': return V.context === 'repl';
    // the alternative of UNI EN 81-20:2020, 5.5.3 c) 2): not with a machine to UNI EN 81-1
    case 'stallDevice': return V.context !== 'repl' || V.machineStd !== 'en81-1';
    // either machine's mass wherever it stands: the new one is the load on the slab and the beams of the machine room
    // (survey, sheet 1, relazione tecnica); the old one the uplift on its anchors below, and above its P9 on the slab, the
    // piece the hook lifts out and the masses lifted in the relazione tecnica (round 46: hidden above, it was read there)
    case 'o_mass': return true;
    case 'n_beta': return V.n_groove === 'UU' || V.n_groove === 'VN';
    case 'o_beta': return V.o_groove === 'UU' || V.o_groove === 'VN';
    case 'keepD': return !!V.compare && V.context === 'repl';
    case 'keepRopes': return V.context === 'repl';
    case 'n_n': case 'n_d': return !(V.context === 'repl' && !!V.keepRopes && !!V.compare);
    // the model's rope data: a modification only; the compensation's by its kind
    case 'n_cat': case 'compTipo': case 'caviQ': case 'aRidotta': return V.context === 'repl';
    case 'compFune': case 'compDt': return V.context === 'repl' && V.compTipo === 'funi';
    case 'compCatena': case 'compCwt': return V.context === 'repl' && V.compTipo === 'catene';
    case 'compN': case 'compMt': return V.context === 'repl' && (V.compTipo === 'funi' || V.compTipo === 'catene');
    default: return true;
  }
}

/** A field of the form in view in this state: its row shown and, for the existing machine's, the machine compared (its
 *  group is hidden otherwise). The one rule of what the form asks for (calc-input.ts visibleBad) and of what a save
 *  keeps as entered (calc-input.ts savedValues). */
export const inForm = (id: string, V: FormValues): boolean => shown(id, V) && (!id.startsWith('o_') || !!V.compare);
