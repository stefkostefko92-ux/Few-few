// The steps of «Calcolo argano» and of «Progetto» (round 52): their sections in the order of the screen, with which of the
// values still to enter each holds (the ids calcMissing and missingOf give). A section the screen does not show is no step.
// The ids are the sections' own (`passo-<step>`); the labels are the sections' titles, given by the caller.
import { FUNI_10411, LAYOUT, MACHINE, PLANT, ROPES, SERVICE } from '@/components/calc/fields';
import { REGOLAZIONE_ID } from './calc-blank';
import { SHAFT_FIELDS, isBlankKey } from './lift/blank';
import { passiDa, type Passo, type PassoDef } from './passi';

export type PassoCalcolo = 'tipo' | 'collaudo' | 'impianto' | 'disposizione' | 'esistente' | 'nuovo' | 'funi' | 'funi10411' | 'servizio' | 'esito';
export type PassoProgetto = 'base' | 'vano' | 'piani' | 'locale' | 'funi' | 'verifiche';

const ids = (...groups: readonly (readonly { id: string }[])[]): ReadonlySet<string> => new Set(groups.flat().map((f) => f.id));
const IN = {
  impianto: ids(PLANT),
  disposizione: ids(LAYOUT),
  esistente: ids(MACHINE('o_'), ROPES('o_')),
  nuovo: ids(MACHINE('n_')),
  funi: ids(ROPES('n_')),
  funi10411: ids(FUNI_10411),
  servizio: ids(SERVICE),
};

export const passoId = (k: string): string => `passo-${k}`;

/** Each step's number by its key, for the sections' titles. */
export const numeriDi = <K extends string>(passi: readonly Passo[]): Partial<Record<K, number>> =>
  Object.fromEntries(passi.map((p) => [p.id.slice('passo-'.length), p.n])) as Partial<Record<K, number>>;

/** What «Calcolo argano» shows: the type's card always; the test once a type is chosen; the existing machine's group for a
 *  modification that replaces the machine (or before a type is chosen); the rope sheet of UNI 10411 likewise; the
 *  service's group in «Esperto» or while a value of it is missing. */
export interface VistaCalcolo {
  tipo: boolean;
  esistente: boolean;
  resta: boolean;
  servizio: boolean;
}

export function passiCalcolo(missing: readonly string[], v: VistaCalcolo, label: (k: PassoCalcolo) => string): Passo[] {
  const step = (k: PassoCalcolo, di?: (id: string) => boolean): PassoDef => ({ id: passoId(k), label: label(k), ...(di ? { di } : {}) });
  const set = (k: keyof typeof IN) => (id: string): boolean => IN[k].has(id);
  const defs: (PassoDef | null)[] = [
    step('tipo', (id) => id === 'intervento' || id.startsWith('parte-') || id === REGOLAZIONE_ID),
    v.tipo ? step('collaudo') : null,
    step('impianto', set('impianto')),
    step('disposizione', set('disposizione')),
    v.esistente && !v.resta ? step('esistente', set('esistente')) : null,
    step('nuovo', set('nuovo')),
    step('funi', set('funi')),
    v.esistente ? step('funi10411', set('funi10411')) : null,
    v.servizio ? step('servizio', set('servizio')) : null,
    step('esito'),
  ];
  return passiDa(defs.filter((d): d is PassoDef => d !== null), missing);
}

const VANO: ReadonlySet<string> = new Set(SHAFT_FIELDS);
const PIANI = /^(?:v|pit|headroom|floors|main|rise\.\d+|fdoor\.\d+)$/;

/** «Progetto»: the calculation it draws on (what is missing there is entered in «Calcolo argano»), the shaft, the floors,
 *  the machine or pulley room when the drawing has one, the ropes in the drawing, then what the software works out. A
 *  value's key is not its field's id (the form's `fieldId`): `campo` gives the id a step's link goes to. */
export function passiProgetto(missing: readonly string[], v: { locale: boolean }, label: (k: PassoProgetto) => string,
  campo: (id: string) => string = (id) => id): Passo[] {
  const step = (k: PassoProgetto, di?: (id: string) => boolean): PassoDef => ({ id: passoId(k), label: label(k), ...(di ? { di } : {}) });
  const defs: (PassoDef | null)[] = [
    step('base', (id) => !isBlankKey(id) || id === 'r' || id === 'layout'),
    step('vano', (id) => VANO.has(id)),
    step('piani', (id) => PIANI.test(id)),
    v.locale ? step('locale', (id) => id.startsWith('room.')) : null,
    step('funi', (id) => id === 'bottom'),
    step('verifiche'),
  ];
  return passiDa(defs.filter((d): d is PassoDef => d !== null), missing).map((p) => (p.primo ? { ...p, primo: campo(p.primo) } : p));
}
