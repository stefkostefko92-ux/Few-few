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
 * - по време на пробата или на друг план — от края им (`coda`): нивото се сменя тогава, пробата пази хората си;
 * - изтекла фирма — веднага (`subito`);
 * - по-високо ниво по време на платен план — веднага (`superiore`): платените и неизползвани дни на сегашния план
 *   (веригата от плащания през Revolut до края му) се превръщат в дни на новото ниво със същата стойност;
 * - един купен план в опашка наведнъж (`inCoda`); период, даден на ръка, не се превръща онлайн (`manuale`).
 */

/** Завършено плащане, което покрива период: стойността е цената без ДДС плюс превърнатия кредит. */
export interface Segmento {
  inizio: Date;
  fine: Date;
  valoreCent: number;
}

export interface Credito {
  /** Цели дни от сега до края на сегашния план. */
  giorni: number;
  /** Стойността им без ДДС, в центове. */
  valoreCent: number;
  /** Колко дни на новото ниво струват толкова. */
  giorniExtra: number;
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

/** Веригата от плащания, която стига до края на абонамента: всяко започва там, където свършва предишното. */
function catena(segmenti: readonly Segmento[], fino: Date, now: Date): Segmento[] {
  const vivi = segmenti.filter((s) => s.fine.getTime() > now.getTime());
  const out: Segmento[] = [];
  let fine = fino.getTime();
  for (;;) {
    const s = vivi.find((x) => x.fine.getTime() === fine && !out.includes(x));
    if (!s) return out;
    out.push(s);
    if (s.inizio.getTime() <= now.getTime()) return out;
    fine = s.inizio.getTime();
  }
}

export function periodoDi(
  a: CampiAbbonamento,
  segmenti: readonly Segmento[],
  piano: Piano,
  now: Date,
): Periodo {
  if (a.abbonamentoFino === null) return { ok: false, errore: 'senzaScadenza' };
  const stato = statoAbbonamento(a, now);
  if (stato.poi) return { ok: false, errore: 'inCoda' };
  if (stato.solaLettura)
    return {
      ok: true,
      modo: 'subito',
      inizio: now,
      fine: scadenzaDopoMesi(null, piano.mesi, now),
      credito: null,
    };
  const fino = a.abbonamentoFino;
  const { livello, prova } = abbonamentoAdesso(a, now);
  const superiore = !prova && livello !== null && isLivello(livello) && piano.livello > livello;
  if (!superiore)
    return {
      ok: true,
      modo: 'coda',
      inizio: fino,
      fine: scadenzaDopoMesi(fino, piano.mesi, now),
      credito: null,
    };
  const pagati = catena(segmenti, fino, now);
  const primo = pagati[pagati.length - 1];
  // Без плащания до края или с дни, дадени на ръка, преди тях — не се смята онлайн.
  if (!primo || primo.inizio.getTime() > now.getTime()) return { ok: false, errore: 'manuale' };
  const valoreCent = pagati.reduce((somma, s) => {
    const resta = s.fine.getTime() - Math.max(now.getTime(), s.inizio.getTime());
    const durata = s.fine.getTime() - s.inizio.getTime();
    return somma + Math.floor((s.valoreCent * resta) / durata);
  }, 0);
  const finePiano = scadenzaDopoMesi(null, piano.mesi, now);
  const giorniPiano = (finePiano.getTime() - now.getTime()) / DAY;
  const giorniExtra = Math.floor((valoreCent * giorniPiano) / piano.prezzoCent);
  return {
    ok: true,
    modo: 'superiore',
    inizio: now,
    fine: giorniExtra > 0 ? mezzanotteRoma(businessDay(finePiano), giorniExtra) : finePiano,
    credito: {
      giorni: Math.floor((fino.getTime() - now.getTime()) / DAY),
      valoreCent,
      giorniExtra,
    },
  };
}
