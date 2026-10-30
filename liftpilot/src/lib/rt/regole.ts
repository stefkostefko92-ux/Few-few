// «Regole della norma» of the relazione tecnica di modifica (RT plan §4.3, §5.1, 5): the rules of UNI 10411 already
// computed by the calculation's test — the change of the loads (prospetti 1 and 2, decrease, ratio: modifica.ts
// variazioneCarico), of the rated speed (15.1, 15.16; -11 15) and of the travel (16) against the documents, the CE marking
// that picks the part of UNI 10411 — with the values they compare, the cases they bring (obblighi.ts casiVariazione) and
// whether they trigger. No new physics, no rule of a third party's template. Pure.
import { NORMA_SIGLA } from '../lift/collaudo';
import { caricoVariato, carichiOf, corsaOf, variazioneCarico, variazioneCorsa, variazioneVelocita, velocitaOf } from '../lift/modifica';
import type { CasoVariazione } from '../lift/obblighi-variazioni';
import { casiOf } from './sezioni';
import type { RegolaRt, RtBase } from './types';

const CARICO: readonly CasoVariazione[] = ['loadP1', 'loadP2', 'loadCalo', 'loadRapporto', 'loadDocumentati', 'loadCabinaNuova', 'loadCabinaArcata'];
const VELOCITA: readonly CasoVariazione[] = ['speedUp', 'speedDown', 'speedUcm', 'speedWithin', 'speedWithin50', 'speedDocumentati'];
const CORSA: readonly CasoVariazione[] = ['travelUp', 'travelOver8', 'travelDown', 'travelDocumentati'];

export function regoleOf(base: Pick<RtBase, 'norma' | 'collaudo' | 'values'>): RegolaRt[] {
  const n = base.norma, C = base.collaudo, sigla = NORMA_SIGLA[n], casi = casiOf(base), di = (xs: readonly CasoVariazione[]) => casi.filter((c) => xs.includes(c));
  const doc = C.documentato, ora = carichiOf(base.values), lib = C.libretto, v = velocitaOf(base.values), H = corsaOf(base.values);
  const vc = doc && ora ? variazioneCarico(n, doc, ora) : null;
  const carico: RegolaRt = {
    regola: 'carico', clausola: n === '10411-1' ? `${sigla}, 6.1 (prospetti 1 e 2)` : `${sigla}, 6.1`, casi: di(CARICO),
    valori: [
      { grandezza: 'Q', prima: doc?.Q ?? null, dopo: ora?.Q ?? null, unit: 'kg', dec: 0 },
      { grandezza: 'Tstar', prima: doc ? doc.P + doc.Q : null, dopo: ora ? ora.P + ora.Q : null, unit: 'kg', dec: 0 },
      { grandezza: 'Mcw', prima: doc?.Mcw ?? null, dopo: ora?.Mcw ?? null, unit: 'kg', dec: 0 },
    ],
    esito: !vc ? 'dati_mancanti' : caricoVariato(vc) ? 'scatta' : 'non_scatta',
  };
  const xv = v !== null ? variazioneVelocita(n, lib, v) : null;
  const velocita: RegolaRt = {
    regola: 'velocita', clausola: n === '10411-1' ? `${sigla}, 15.1 e 15.16` : `${sigla}, 15`, casi: di(VELOCITA),
    valori: [
      { grandezza: 'velocita', prima: lib?.v ?? null, dopo: v, unit: 'm/s', dec: 2 },
      ...(n === '10411-1' ? [{ grandezza: 'velocita50', prima: lib?.v50 ?? null, dopo: v, unit: 'm/s', dec: 2 }] : []),
    ],
    esito: !xv ? 'dati_mancanti' : xv.variata ? 'scatta' : 'non_scatta',
  };
  const xh = lib?.H && H !== null ? variazioneCorsa(n, lib, H) : null;
  const corsa: RegolaRt = {
    regola: 'corsa', clausola: `${sigla}, 16`, casi: di(CORSA), valori: [{ grandezza: 'corsa', prima: lib?.H ?? null, dopo: H, unit: 'm', dec: 2 }],
    esito: !xh ? 'dati_mancanti' : xh.variata ? 'scatta' : 'non_scatta',
  };
  // the CE marking: «scatta» — the lift is CE-marked, UNI 10411-11 —, «non_scatta» — not marked, UNI 10411-1 —, or the
  // answer not certain (the part derived from the day of service, to confirm on the logbook)
  const marcatura: RegolaRt = {
    regola: 'marcatura', clausola: 'DPR 162/1999, art. 7 c.2 e art. 16 c.1', casi: [], valori: [],
    esito: C.marcatura === 'si' ? 'scatta' : C.marcatura === 'no' ? 'non_scatta' : 'dati_mancanti',
  };
  return [marcatura, carico, velocita, corsa];
}
