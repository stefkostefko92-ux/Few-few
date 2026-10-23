// Section 4 of the relazione tecnica di modifica (RT plan §5.1): the technical data before the modification — as the
// documents give them, with where each was read — and after it — the calculation's and the design's —, with the change:
// «invariato» within the documents' roundings (modifica.ts ROUNDING_*), the increase or decrease with its percentage,
// «non documentato ⚠» when the documents do not give it (never a value of the software in its place). Pure.
import { ROUNDING_H, ROUNDING_KG, ROUNDING_V } from '../../lift/modifica';
import type { RigaPrimaDopo } from '../../rt/types';
import type { BlockStatus, ReportBlock } from '../model';
import type { Ctx } from './contesto';
import { DOC, fill } from './testi';

const G: Readonly<Record<string, string>> = DOC.grandezze, F: Readonly<Record<string, string>> = DOC.primaDopo.fonti;

/** A value with its unit, «—» when not known. */
export const conUnita = (x: Ctx, v: number | null, dec: number, unit: string): string => (v === null ? '—' : `${x.fmt(v, dec)}${unit ? ` ${unit}` : ''}`);

/** The change in words: unchanged, not documented, or the difference with its sign and percentage. */
export function variazioneText(x: Ctx, r: RigaPrimaDopo): string {
  if (r.variazione === 'invariato') return DOC.primaDopo.invariato;
  if (r.variazione === 'non_documentato' || r.prima === null || r.dopo === null) return DOC.primaDopo.nonDocumentato;
  const d = r.dopo - r.prima, s = d > 0 ? '+' : '−', pct = r.prima !== 0 ? ` (${s}${x.fmt(Math.abs(d / r.prima) * 100, 1)} %)` : '';
  return `${s}${conUnita(x, Math.abs(d), r.dec, r.unit)}${pct}`;
}

/** The quantities whose «before» the installation's registry gives, with its own source. */
const ANAGRAFICA: ReadonlySet<string> = new Set(['persone', 'fermate', 'superficie']);
/** Where «before» was read: the calculation's documented loads and logbook, or the registry's source. */
const fonteRiga = (r: RigaPrimaDopo): string => (!r.fonte ? '—' : ANAGRAFICA.has(r.grandezza)
  ? fill(DOC.primaDopo.anagrafica, { fonte: (DOC.primaDopo.fonti as Readonly<Record<string, string>>)[r.fonte === 'libretto' ? 'librettoAnagrafica' : r.fonte] ?? r.fonte })
  : F[r.fonte] ?? r.fonte);

export function primaDopoBlocks(x: Ctx): ReportBlock[] {
  const rows = x.d.primaDopo, P = DOC.primaDopo, { fmt } = x;
  const tolleranze = `${fmt(ROUNDING_KG, 1)} kg; ${fmt(ROUNDING_V, 3)} m/s; ${fmt(ROUNDING_H, 2)} m; ${P.tolleranzaSuperficie}`;
  return [
    x.h2(x.titolo('primaDopo')),
    { t: 'grid', head: P.head, widths: [0.27, 0.16, 0.16, 0.19, 0.22], align: ['l', 'r', 'r', 'l', 'l'], statusCol: 3,
      rows: rows.map((r) => [G[r.grandezza] ?? r.grandezza, conUnita(x, r.prima, r.dec, r.unit), conUnita(x, r.dopo, r.dec, r.unit), variazioneText(x, r),
        fonteRiga(r)]),
      status: rows.map((r): BlockStatus => (r.variazione === 'non_documentato' ? 'warn' : '')) },
    { t: 'p', style: 'note', text: fill(P.nota, { progetto: x.base.path === 'vano' ? P.progetto : '', tolleranze }) },
  ];
}
