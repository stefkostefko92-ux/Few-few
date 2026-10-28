// The bar of an installation (round 53): the same tabs on every page of it, in the order of the work — Panoramica, then
// 1 Rilievo, 2 Calcolo argano, 3 Progetto, 4 Simulazione, 5 Relazione tecnica, 6 Tavole e documenti — each with its state,
// so where the installation stands is read without opening anything; and the one next step the overview offers. The
// first three and the documents keep the states of the way from the survey to the documents (src/lib/collega/passi.ts);
// the Progetto says its checks not met; the simulation is there once a lift design is saved (or its draft is kept); the
// relazione tecnica is no step of a «Trasformazione completa» (UNI EN 81-20/50: no modification report). Pure.
import type { Passi, StatoPasso } from '@/lib/collega/passi';
import type { TipoIntervento } from '@/lib/lift/intervento';

export const SCHEDE = ['panoramica', 'rilievo', 'calcolo', 'progetto', 'simulazione', 'relazione', 'documenti'] as const;
export type SchedaKey = (typeof SCHEDE)[number];

/** How a state reads: done, to update, failing, still to do, not (yet) a step of this installation. */
export type Tono = 'ok' | 'warn' | 'fail' | 'todo' | 'off';

export type StatoKey = 'fatto' | 'daFare' | 'daAggiornare' | 'differenze' | 'nonSuperate' | 'pronta' | 'bozza' | 'emessa' | 'nonServe'
  | 'dopoCalcolo' | 'dopoProgetto' | 'soloVano';

export interface StatoScheda {
  tono: Tono;
  /** the state's words (messages: impianto.stato.<key>) */
  key: StatoKey;
  /** the count the words carry (the checks not met) */
  n?: number;
}

export interface Scheda {
  key: SchedaKey;
  /** the step's number on the way (none for the overview) */
  n: number | null;
  /** its page; null: not one this user may open */
  href: string | null;
  /** none for the overview */
  stato: StatoScheda | null;
}

export interface SchedeInput {
  passi: Passi;
  tipo: TipoIntervento | null;
  /** what the installation's Progetto is: the machine room surveyed, or the shaft drawn (null: no calculation yet) */
  disegno: 'locale' | 'vano' | null;
  /** the Progetto's record: its checks not met (none saved: null) */
  progetto: { fails: number } | null;
  /** the latest lift design saved (old: the running engines no longer reproduce it) and whether the drawing's draft is kept */
  simulazione: { salvato: { old: boolean } | null; bozza: boolean };
  /** the latest relazione tecnica issued (old: to make again in a new revision) and whether its draft is kept */
  relazione: { emessa: { old: boolean } | null; bozza: boolean };
  href: Record<SchedaKey, string | null>;
}

const DAL_PASSO: Record<StatoPasso, StatoScheda> = {
  fatto: { tono: 'ok', key: 'fatto' },
  daFare: { tono: 'todo', key: 'daFare' },
  daAggiornare: { tono: 'warn', key: 'daAggiornare' },
  superato: { tono: 'warn', key: 'daAggiornare' },
  differenze: { tono: 'fail', key: 'differenze' },
};

function progettoDi(x: SchedeInput): StatoScheda {
  if (x.passi.calcolo === 'daFare' && x.passi.progetto === 'daFare') return { tono: 'off', key: 'dopoCalcolo' };
  const s = DAL_PASSO[x.passi.progetto];
  return s.key === 'fatto' && x.progetto && x.progetto.fails > 0 ? { tono: 'fail', key: 'nonSuperate', n: x.progetto.fails } : s;
}

function simulazioneDi(x: SchedeInput): StatoScheda {
  const s = x.simulazione;
  if (s.salvato) return s.salvato.old ? { tono: 'warn', key: 'daAggiornare' } : { tono: 'ok', key: 'pronta' };
  if (s.bozza) return { tono: 'todo', key: 'bozza' };
  return { tono: 'off', key: x.disegno === 'locale' ? 'soloVano' : 'dopoProgetto' };
}

function relazioneDi(x: SchedeInput): StatoScheda {
  if (x.tipo === null) return { tono: 'off', key: 'dopoCalcolo' };
  if (x.tipo === 'TRASFORMAZIONE_COMPLETA') return { tono: 'off', key: 'nonServe' };
  const r = x.relazione;
  if (r.emessa) return r.emessa.old ? { tono: 'warn', key: 'daAggiornare' } : { tono: 'ok', key: 'emessa' };
  return r.bozza ? { tono: 'todo', key: 'bozza' } : { tono: 'todo', key: 'daFare' };
}

function documentiDi(x: SchedeInput): StatoScheda {
  return x.progetto ? DAL_PASSO[x.passi.documenti] : { tono: 'off', key: 'dopoProgetto' };
}

export function schedeDi(x: SchedeInput): Scheda[] {
  const stati: Record<SchedaKey, StatoScheda | null> = {
    panoramica: null,
    rilievo: DAL_PASSO[x.passi.rilievo],
    calcolo: DAL_PASSO[x.passi.calcolo],
    progetto: progettoDi(x),
    simulazione: simulazioneDi(x),
    relazione: relazioneDi(x),
    documenti: documentiDi(x),
  };
  return SCHEDE.map((key, i) => ({ key, n: i === 0 ? null : i, href: x.href[key], stato: stati[key] }));
}

/** The one next step of an installation (the overview's «Prossimo passo»): the calculation, the Progetto (to draw, to
 *  update, its checks not met), the relazione tecnica, the drawing sets; with everything done, its documents. */
export type ProssimoKey = 'calcola' | 'calcoloAggiorna' | 'progettoFai' | 'progettoFaiLocale' | 'progettoAggiorna' | 'progettoNonSupera'
  | 'relazione' | 'relazioneAggiorna' | 'tavole' | 'tavoleAggiorna' | 'pronto';

export interface Prossimo {
  key: ProssimoKey;
  /** the tab whose page it opens */
  scheda: SchedaKey;
  n?: number;
}

export function prossimoDi(x: SchedeInput, tavole: number): Prossimo {
  const s = schedeDi(x), of = (k: SchedaKey): StatoScheda | null => s.find((q) => q.key === k)?.stato ?? null;
  const calc = of('calcolo'), prog = of('progetto'), rel = of('relazione'), doc = of('documenti');
  if (calc?.key === 'daFare') return { key: 'calcola', scheda: 'calcolo' };
  if (calc && (calc.tono === 'warn' || calc.tono === 'fail')) return { key: 'calcoloAggiorna', scheda: 'calcolo' };
  if (prog?.key === 'daFare') return { key: x.disegno === 'locale' ? 'progettoFaiLocale' : 'progettoFai', scheda: 'progetto' };
  if (prog && (prog.key === 'daAggiornare' || prog.key === 'differenze')) return { key: 'progettoAggiorna', scheda: 'progetto' };
  if (prog?.key === 'nonSuperate') return { key: 'progettoNonSupera', scheda: 'progetto', n: prog.n };
  if (rel && rel.tono === 'todo') return { key: 'relazione', scheda: 'relazione' };
  if (rel?.key === 'daAggiornare') return { key: 'relazioneAggiorna', scheda: 'relazione' };
  if (doc?.key === 'daAggiornare') return { key: 'tavoleAggiorna', scheda: 'documenti' };
  if (tavole === 0) return { key: 'tavole', scheda: 'documenti' };
  return { key: 'pronto', scheda: 'documenti' };
}
