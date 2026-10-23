// The car and its loads in the relazione tecnica di modifica (RT plan §4.5): a new car's available area within
// prospetto 6 for the rated load (v_area: the design's on the shaft path, the RT's datum on the room path), a kept car
// whose rated load changes against its documented area (rt_area_kept: an attention only, the software's reading —
// registry cabina.superficie.esistente), the existing sling under new loads (arcata.ts slingCheck); the passengers of
// the area and the rated load (prospetto 8). Pure.
import { maxArea, passengers } from '@/shaft/area';
import { slingCheck } from '../../lift/arcata';
import { ROUNDING_KG } from '../../lift/modifica';
import type { RtCheck } from '../types';
import { ambito, conId, daVano, dato, fonteDi, mancante, mancantiDi, nuova, rtCheck, type RtCtx } from './comune';
import type { Esito, EsitoSezione } from './esito';
import { SITO_RT, sito } from './punti';

/** rt_area_kept: the kept car's documented area against the largest prospetto 6 allows for the new rated load — within
 *  it, an information (UNI 10411 does not ask the check: never «met»); over it, an attention (never a failure). */
export const areaEsistente = (area: number, Q: number): Esito => ({ status: area <= maxArea(Q) + 1e-9 ? 'info' : 'warn', value: area, limit: maxArea(Q) });

/** The car's available area after the modification [m²]: the design's (v_area's value), a new car's datum, else the
 *  documented one. */
export function areaDopo(x: RtCtx): number | null {
  if (x.base.path === 'vano') return x.base.lift?.checks.find((c) => c.id === 'v_area')?.value ?? null;
  return (nuova(x, 'car') ? x.inputs.componenti?.cabina?.superficie : x.anagrafica.prima?.superficie) ?? null;
}

export function cabina(x: RtCtx): EsitoSezione {
  const c = x.inputs.componenti?.cabina, nuovaCab = nuova(x, 'car'), Q = x.I.Q, checks: RtCheck[] = [];
  const o = { sezione: 'cabina' as const, ambito: ambito(nuovaCab), upper: true };
  if (x.base.path === 'vano') checks.push(...conId(x.base.lift?.checks ?? [], ['v_area']).map((k) => daVano(x, k, 'cabina')));
  else if (nuovaCab) {
    const s = c?.superficie;
    checks.push(s === undefined ? mancante(x, 'v_area', ['componenti.cabina.superficie'], maxArea(Q), 2, 'm²', o)
      : rtCheck(x, 'v_area', s <= maxArea(Q) + 1e-9, s, maxArea(Q), 2, 'm²', o));
  }
  // the car that stays, its rated load changed: its documented area against the new load's maximum
  const doc = x.base.collaudo.documentato;
  if (!nuovaCab && doc && Math.abs(Q - doc.Q) > ROUNDING_KG) {
    const area = x.anagrafica.prima?.superficie, k = { ...o, ambito: 'richiesta' as const, soft: true };
    if (area === undefined) checks.push(mancante(x, 'rt_area_kept', ['anagrafica.prima.superficie'], maxArea(Q), 2, 'm²', k));
    else { const e = areaEsistente(area, Q); checks.push({ ...rtCheck(x, 'rt_area_kept', false, e.value, e.limit, 2, 'm²', k), status: e.status }); }
  }
  const sl = slingCheck(x.base.collaudo, x.carichi);
  if (sl) checks.push(daVano(x, sl, 'cabina'));
  const area = areaDopo(x), stato = nuovaCab ? (nuova(x, 'sling') ? 'nuovo' : 'misto') : nuova(x, 'sling') ? 'misto' : 'esistente';
  const srcArea = x.base.path === 'vano' ? 'progetto' : nuovaCab ? fonteDi(c?.fonte, x.allegati) : 'anagrafica';
  const dati = [
    dato('portata', Q, 'kg', 0, nuova(x, 'load') ? 'nuovo' : 'esistente', 'calcolo'),
    dato('massaCabina', x.I.P, 'kg', 0, stato === 'esistente' ? 'esistente' : 'nuovo', 'calcolo'),
    dato('tStar', x.I.P + Q, 'kg', 0, stato === 'esistente' ? 'esistente' : 'nuovo', 'calcolo'),
    dato('superficie', area, 'm²', 2, nuovaCab ? 'nuovo' : 'esistente', srcArea),
    dato('persone', area === null ? null : passengers(Q, area), '', 0, nuovaCab || nuova(x, 'load') ? 'nuovo' : 'esistente', 'calcolo'),
  ];
  const punti = nuovaCab ? [sito('cabina', SITO_RT.materialiCabina)] : [];
  return { componente: { sezione: 'cabina', stato, dati }, checks, punti, mancanti: mancantiDi('cabina', checks) };
}
