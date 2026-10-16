// The names of the parts of «Calcolo argano» — in their list and in the list of what is missing, the same words (out of
// PartiSiNo.tsx in round 47, to be read by the tests): and, for a change of speed, load or travel still to answer, what
// is needed (owner's decision D1). Pure: the texts come in as functions.
import type { Parte } from '@/lib/lift';
import type { EsitoDoc } from '@/lib/lift/modifica';

const VARIATA: Partial<Record<Parte, string>> = { machine: 'parte_argano', speed: 'parte_speed_var', load: 'parte_load_var', travel: 'parte_travel_var' };

/** A part's name in «Calcolo argano» — in its list and in the list of what is missing, the same words. */
export function etichettaParte(t: (k: string) => string, tl: (k: string) => string, tipo: string | null, p: Parte): string {
  return tipo === 'SOLO_ARGANO' && p === 'ropes' ? t('funi') : VARIATA[p] ? t(VARIATA[p]) : tl(`parte_${p}`);
}

/** A text by its key, with values. */
export type Tv = (k: string, v?: Record<string, string>) => string;

/** A part in the list of what is missing (round 47, D1): a change of speed, load or travel says what is needed — with
 *  nothing documented, the document's value or «Sì»/«No»; documented but not decided by it, «Sì» or «No»; any other part
 *  its name. `e`: what the documents say (risposte.ts esitoParte), `norma`: the test's part of UNI 10411. */
export function mancaParte(t: Tv, tl: (k: string) => string, tipo: string | null, p: Parte, e: EsitoDoc, norma: string): string {
  const nome = etichettaParte(t, tl, tipo, p);
  if (tipo !== 'AMMODERNAMENTO' || !VARIATA[p] || p === 'machine') return nome;
  if (e === 'aperta') return t('manca_aperta', { parte: nome });
  return e === null ? t(p === 'travel' && norma === '10411-11' ? 'manca_travel11' : `manca_${p}`) : nome;
}

