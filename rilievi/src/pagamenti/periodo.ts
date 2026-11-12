import {
  abbonamentoAdesso,
  isLivello,
  scadenzaDopoMesi,
  statoAbbonamento,
  type CampiAbbonamento,
} from '../abbonamenti/regole.js';
import { mezzanotteRoma } from '../master/tempo.js';
import { businessDay, DAY } from '../time.js';

/**
 * Кога започва купеният план и какво дава (#31; условията 2026-11-12, чл. 12.3 и 12.4) — без база:
 * - по време на пробата или на друг план — от края им (`coda`): нивото се сменя тогава, пробата пази функциите си;
 * - изтекла фирма — веднага (`subito`);
 * - по-високо ниво по време на платен план — веднага (`superiore`): платените и неизползвани дни (веригата от
 *   плащания през Revolut до края на абонамента, вкл. план в опашка) се превръщат в дни на новото ниво със същата
 *   стойност;
 * - вече има купен план в опашка: същото или по-ниско ниво чака (`inCoda`); по-високо го замества — по време на
 *   пробата пак от края ѝ (`coda`, цялата стойност на плана в опашка става дни), при платен план — веднага;
 * - период, даден на ръка (без плащания зад него), не се превръща онлайн (`manuale`).
 * Кредитът се смята от началото на днешния ден по Рим: офертата е една и съща през целия ден (отпечатъкът ѝ не се
 * сменя, докато човекът я чете).
 */

/** Завършено плащане, което покрива период: стойността е цената без ДДС плюс превърнатия кредит. */
export interface Segmento {
  /** Плащането зад периода — за следата на кредита (кои фактури се превръщат). */
  id?: string;
  inizio: Date;
  fine: Date;
  valoreCent: number;
}

export interface Credito {
  /** Цели дни от началото на новия план до края на платеното досега. */
  giorni: number;
  /** Стойността им без ДДС, в центове. */
  valoreCent: number;
  /** Колко дни на новото ниво струват толкова. */
  giorniExtra: number;
  /** Плащанията, от които идва кредитът (от края към началото). */
  da: string[];
}

export type Periodo =
  | {
      ok: true;
      modo: 'coda' | 'subito' | 'superiore';
      inizio: Date;
      fine: Date;
      credito: Credito | null;
    }
  | { ok: false; errore: 'senzaScadenza' | 'inCoda' | 'manuale' };

interface Piano {
  livello: number;
  mesi: number;
  prezzoCent: number;
}

/** Веригата от плащания от края на абонамента назад до `da`: всяко започва там, където свършва предишното. */
function catena(segmenti: readonly Segmento[], fino: Date, da: Date): Segmento[] {
  const vivi = segmenti.filter((s) => s.fine.getTime() > da.getTime());
  const out: Segmento[] = [];
  let fine = fino.getTime();
  for (;;) {
    const s = vivi.find((x) => x.fine.getTime() === fine && !out.includes(x));
    if (!s) return out;
    out.push(s);
    if (s.inizio.getTime() <= da.getTime()) return out;
    fine = s.inizio.getTime();
  }
}

/**
 * По-високото ниво: платеното от `da` нататък става дни на новия план. `da` е началото му — сега (смята се от
 * началото на днешния ден) или краят на пробата; null — зад периода няма плащания до `da` (даден е на ръка).
 */
function conCredito(
  segmenti: readonly Segmento[],
  fino: Date,
  piano: Piano,
  da: Date,
  conto: Date,
): { fine: Date; credito: Credito } | null {
  const pagati = catena(segmenti, fino, da);
  const primo = pagati[pagati.length - 1];
  if (!primo || primo.inizio.getTime() > da.getTime()) return null;
  const valoreCent = pagati.reduce((somma, s) => {
    const resta = s.fine.getTime() - Math.max(conto.getTime(), s.inizio.getTime());
    const durata = s.fine.getTime() - s.inizio.getTime();
    return somma + Math.floor((s.valoreCent * resta) / durata);
  }, 0);
  const finePiano = scadenzaDopoMesi(da, piano.mesi, da);
  const giorniPiano = (finePiano.getTime() - conto.getTime()) / DAY;
  const giorniExtra = Math.floor((valoreCent * giorniPiano) / piano.prezzoCent);
  return {
    fine: giorniExtra > 0 ? mezzanotteRoma(businessDay(finePiano), giorniExtra) : finePiano,
    credito: {
      giorni: Math.floor((fino.getTime() - conto.getTime()) / DAY),
      valoreCent,
      giorniExtra,
      da: pagati.flatMap((s) => (s.id ? [s.id] : [])),
    },
  };
}

export function periodoDi(
  a: CampiAbbonamento,
  segmenti: readonly Segmento[],
  piano: Piano,
  now: Date,
): Periodo {
  if (a.abbonamentoFino === null) return { ok: false, errore: 'senzaScadenza' };
  const stato = statoAbbonamento(a, now);
  if (stato.solaLettura)
    return {
      ok: true,
      modo: 'subito',
      inizio: now,
      fine: scadenzaDopoMesi(null, piano.mesi, now),
      credito: null,
    };
  const fino = a.abbonamentoFino;
  const { livello, prova, coda } = abbonamentoAdesso(a, now);
  const pagato = !prova && livello !== null && isLivello(livello) ? livello : 0;
  // Същото или по-ниско ниво: чака края на платеното; с план в опашка — не (един наведнъж).
  if (piano.livello <= Math.max(pagato, coda?.livello ?? 0)) {
    if (coda) return { ok: false, errore: 'inCoda' };
    return {
      ok: true,
      modo: 'coda',
      inizio: fino,
      fine: scadenzaDopoMesi(fino, piano.mesi, now),
      credito: null,
    };
  }
  // Проба без купен план: първият план чака края ѝ.
  if (prova && !coda)
    return {
      ok: true,
      modo: 'coda',
      inizio: fino,
      fine: scadenzaDopoMesi(fino, piano.mesi, now),
      credito: null,
    };
  // По-високо ниво. В пробата замества плана в опашка от края ѝ; при платен план започва сега.
  const inProva = prova && coda !== null;
  const da = inProva ? coda.dal : now;
  const conto = inProva ? coda.dal : mezzanotteRoma(businessDay(now));
  const esito = conCredito(segmenti, fino, piano, da, conto);
  if (!esito) return { ok: false, errore: 'manuale' };
  return {
    ok: true,
    modo: inProva ? 'coda' : 'superiore',
    inizio: da,
    fine: esito.fine,
    credito: esito.credito,
  };
}
