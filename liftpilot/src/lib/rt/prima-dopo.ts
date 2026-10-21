// «Dati tecnici prima e dopo la modifica» of the relazione tecnica di modifica (RT plan §5.1, 4): each quantity as the
// documents give it (the documented loads of the calculation's test, the logbook's speed and travel, the registry's
// persons, stops and car area with their source) and as the design gives it (the calculation, the lift design, the RT's
// data), and its change — «invariato» within the documents' roundings (modifica.ts ROUNDING_*), never a silent zero:
// what is not documented says so. Pure.
import { passengers } from '@/shaft/area';
import { ROUNDING_H, ROUNDING_KG, ROUNDING_V, carichiOf } from '../lift/modifica';
import type { Anagrafica } from './anagrafica';
import type { GrandezzaRt, RigaPrimaDopo, RtBase } from './types';

/** The car area's rounding: two decimals of m². */
const ROUNDING_M2 = 0.005;

const riga = (grandezza: GrandezzaRt, prima: number | null, dopo: number | null, unit: string, dec: number, tol: number, fonte: string): RigaPrimaDopo => ({
  grandezza, prima, dopo, unit, dec, fonte: prima === null ? '' : fonte,
  variazione: prima === null || dopo === null ? 'non_documentato' : Math.abs(dopo - prima) <= tol + 1e-9 ? 'invariato' : dopo > prima ? 'aumento' : 'diminuzione',
});

/** The rows, with the car's area after the modification `area` [m²] (cabina.ts areaDopo). The stops after: the lift
 *  design's floors; on the room path the documented ones, the travel unchanged. */
export function primaDopoOf(base: Pick<RtBase, 'norma' | 'collaudo' | 'values' | 'analysis' | 'lift'>, a: Anagrafica, area: number | null): RigaPrimaDopo[] {
  const { I } = base.analysis.ctx, C = base.collaudo, d = C.documentato, l = C.libretto, p = a.prima, src = p?.fonte ?? '', ora = carichiOf(base.values);
  const fermate = base.lift ? base.lift.layout.inputs.vertical.floors.length : C.parti.includes('travel') ? null : p?.fermate ?? null;
  return [
    riga('Q', d?.Q ?? null, I.Q, 'kg', 0, ROUNDING_KG, 'documentato'),
    riga('persone', p?.persone ?? null, area === null ? null : passengers(I.Q, area), '', 0, 0, src),
    riga('fermate', p?.fermate ?? null, fermate, '', 0, 0, src),
    riga('corsa', l?.H ?? null, I.H, 'm', 2, ROUNDING_H, 'libretto'),
    riga('velocita', l?.v ?? null, I.v, 'm/s', 2, ROUNDING_V, 'libretto'),
    ...(base.norma === '10411-1' ? [riga('velocita50', l?.v50 ?? null, I.v, 'm/s', 2, ROUNDING_V, 'libretto')] : []),
    riga('superficie', p?.superficie ?? null, area, 'm²', 2, ROUNDING_M2, src),
    riga('P', d?.P ?? null, I.P, 'kg', 0, ROUNDING_KG, 'documentato'),
    riga('Mcw', d?.Mcw ?? null, ora?.Mcw ?? null, 'kg', 0, ROUNDING_KG, 'documentato'),
    riga('Tstar', d ? d.P + d.Q : null, I.P + I.Q, 'kg', 0, 2 * ROUNDING_KG, 'documentato'),
  ];
}
