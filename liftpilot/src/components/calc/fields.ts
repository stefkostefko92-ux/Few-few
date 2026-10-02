// Form definition of the prototype v12: the same fields, units, steps, hints and "expert only" marks (adv), and
// the same visibility rules (syncVisibility).
import type { FormValues } from '@/calc/types';
import type { CalcKey } from '@/lib/present/tr';

interface Base {
  id: string;
  /** label key; the field id when absent */
  key?: CalcKey;
  hint?: CalcKey;
  /** hidden in simple mode */
  adv?: boolean;
}
export interface NumField extends Base { kind: 'num'; unit: string; step: number }
export interface SelectField extends Base { kind: 'select'; options: readonly { value: string; label: CalcKey | string; literal?: boolean }[]; wide?: boolean }
export interface CheckField extends Base { kind: 'check' }
export type Field = NumField | SelectField | CheckField;

const num = (id: string, unit: string, step: number, extra: Partial<NumField> = {}): NumField => ({ id, kind: 'num', unit, step, ...extra });
const opt = (value: string, label: CalcKey) => ({ value, label });
const lit = (value: string, label: string) => ({ value, label, literal: true });

export const PLANT: readonly Field[] = [
  { id: 'context', kind: 'select', options: [opt('repl', 'ctx_repl'), opt('new', 'ctx_new')], wide: true },
  num('Q', 'kg', 10), num('P', 'kg', 10, { hint: 'hint_P' }), num('k', '', 0.01),
  num('qeq', 'kg', 5, { hint: 'hint_qeq' }), num('v', 'm/s', 0.05), num('H', 'm', 0.5),
  num('L0', 'm', 0.5, { adv: true }), { id: 'r', kind: 'select', options: [lit('1', '1:1'), lit('2', '2:1')] },
];

export const ROPES = (p: 'n_' | 'o_'): readonly Field[] => [
  num(p + 'n', '', 1, { key: 'n' }), num(p + 'd', 'mm', 0.5, { key: 'd' }), num(p + 'Fmin', 'kN', 0.1, { key: 'Fmin' }), num(p + 'qf', 'kg/m', 0.001, { key: 'qf' }),
];

export const LAYOUT: readonly Field[] = [
  { id: 'layout', kind: 'select', options: [opt('top', 'lay_top'), opt('topDefl', 'lay_topDefl'), opt('bottom', 'lay_bottom')], wide: true },
  { id: 'alphaMode', kind: 'select', options: [opt('geo', 'am_geo'), opt('manual', 'am_manual')], wide: true, hint: 'hint_geo' },
  num('alphaManual', '°', 0.5), { id: 'dropAlign', kind: 'select', options: [opt('center', 'da_center'), opt('car', 'da_car')], wide: true },
  num('dx', 'm', 0.01), num('h', 'm', 0.01),
  num('Hv', 'm', 0.5), num('Dp', 'mm', 10), num('Jp', 'kg·m²', 0.1, { adv: true }),
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

export const SERVICE: readonly Field[] = [num('aDesign', 'm/s²', 0.05), { id: 'buffers', kind: 'check' }, num('aBrake', 'm/s²', 0.05), num('rh', 'm', 0.01)];

/** Every id the form can send (the server accepts nothing else). */
export const FIELD_IDS: readonly string[] = [
  ...[PLANT, LAYOUT, MACHINE('n_'), MACHINE('o_'), ROPES('n_'), ROPES('o_'), SERVICE].flat().map((f) => f.id),
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
    case 'alphaManual': return V.alphaMode === 'manual';
    case 'dropAlign': return V.context === 'repl' && V.layout === 'top' && V.alphaMode !== 'manual' && !!V.compare;
    case 'dx': case 'h': return V.layout === 'topDefl';
    case 'Hv': return V.layout === 'bottom';
    case 'Dp': return V.layout !== 'top' || V.r === '2' || numOf(V, 'nps') + numOf(V, 'npr') > 0;
    case 'Jp': return V.layout !== 'top';
    case 'n_mass': case 'o_mass': return V.layout === 'bottom';
    case 'n_beta': return V.n_groove === 'UU' || V.n_groove === 'VN';
    case 'o_beta': return V.o_groove === 'UU' || V.o_groove === 'VN';
    case 'keepD': return !!V.compare && V.context === 'repl';
    case 'keepRopes': return V.context === 'repl';
    case 'n_n': case 'n_d': return !(V.context === 'repl' && !!V.keepRopes && !!V.compare);
    default: return true;
  }
}
