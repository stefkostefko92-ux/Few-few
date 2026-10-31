import type { Request, Response } from 'express';
import { calcolaArgano } from '../argano/calcolo.js';
import type { ValoriForm } from '../argano/da-scheda.js';
import { limiteDi, type DatiArgano, type ErroriArgano } from '../argano/dati.js';
import type { ErroriImpianto, ValoriImpianto } from '../argano/impianto.js';
import { renderCalcoloArgano } from '../argano/pdf.js';
import { righeRisultato } from '../argano/righe.js';
import { aziendaDelCalcolo, type CalcoloSalvato } from '../argano/service.js';
import { CATENE, FUNI, FUNI_COMPENSAZIONE } from '../argano/tabelle.js';
import { testataDi } from '../aziende/intestazione.js';
import { config } from '../config.js';

/**
 * Общото на изчислението за аргано на карта (calcolo-argano.ts) и без карта (calcolo-argano-libero.ts):
 * страницата с формата и резултатите (`argano/calcolo.ejs`), редът с уредбата в заглавието и PDF-ът.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

export interface Impianto {
  indirizzo: string | null;
  matricola: string | null;
  numeroImpianto: string | null;
}

/** Адресите на страницата: запис, PDF, назад, отказ, изтриване (само без карта и с право). */
export interface Percorso {
  azione: string;
  pdf: string | null;
  indietro: { href: string; testo: string };
  annulla: string;
  elimina: string | null;
}

/** Уредбата на изчислението без карта във формата; изборът на фирма — само при новото и няколко фирми. */
export interface Identita {
  values: ValoriImpianto;
  errori: ErroriImpianto;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  aziendaErrore: boolean;
}

export interface VistaCalcolo {
  percorso: Percorso;
  impianto: Impianto | null;
  identita: Identita | null;
  salvato: CalcoloSalvato | null;
  values: ValoriForm;
  errori: ErroriArgano;
  base: string;
  puoScrivere: boolean;
  conflitto?: boolean;
  proposto?: boolean;
}

/** Твърд интервал: надписът и стойността му не се разделят на два реда („N° impianto“ / „12“). */
const nonSpezzare = (testo: string) => testo.replace(/ /g, ' ');

/** Уредбата в заглавието: адресът, матрикулата и номерът — каквото има. */
export const rigaImpianto = (impianto: Impianto, t: T) =>
  [
    impianto.indirizzo,
    impianto.matricola && nonSpezzare(`${t('argano.matricola')} ${impianto.matricola}`),
    impianto.numeroImpianto && nonSpezzare(`${t('argano.nImpianto')} ${impianto.numeroImpianto}`),
  ]
    .filter(Boolean)
    .join(' · ');

/** Формите, които се пращат обратно: само текстовите полета (без CSRF). */
export const valoriDalBody = (body: Record<string, unknown>): ValoriForm =>
  Object.fromEntries(
    Object.entries(body).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[0] !== '_csrf',
    ),
  );

export function renderCalcolo(res: Response, status: number, vista: VistaCalcolo): void {
  const t = res.locals.t as T;
  const dati = vista.salvato?.dati ?? null;
  const senzaErrori =
    Object.keys(vista.errori).length === 0 &&
    Object.keys(vista.identita?.errori ?? {}).length === 0 &&
    !vista.identita?.aziendaErrore;
  res.status(status).render('argano/calcolo', {
    title: t('argano.titolo'),
    conflitto: false,
    proposto: false,
    ...vista,
    impianto: vista.impianto ? rigaImpianto(vista.impianto, t) : '',
    // При грешки или конфликт записаните резултати не отговарят на формата — не се показват.
    sezioni:
      dati && senzaErrori && !vista.conflitto ? righeRisultato(calcolaArgano(dati), dati, t) : [],
    funi: FUNI,
    catene: CATENE,
    funiCompensazione: FUNI_COMPENSAZIONE,
    limiteDi,
  });
}

/** PDF-ът на записаното изчисление: A4, главата на фирмата на изчислението. */
export async function inviaPdf(
  req: Request,
  res: Response,
  opts: {
    dati: DatiArgano;
    salvato: CalcoloSalvato;
    impianto: Impianto;
    aziendaId: string;
    nome: string;
  },
): Promise<void> {
  const t = res.locals.t as T;
  const pdf = await renderCalcoloArgano({
    dati: opts.dati,
    sezioni: righeRisultato(calcolaArgano(opts.dati), opts.dati, t),
    t,
    impianto: {
      indirizzo: opts.impianto.indirizzo ?? '',
      matricola: opts.impianto.matricola ?? '',
      numeroImpianto: opts.impianto.numeroImpianto ?? '',
    },
    salvato: {
      quando: res.locals.fmt.dateTime(opts.salvato.updatedAt),
      autore: opts.salvato.autore ?? '',
    },
    testata: await testataDi(await aziendaDelCalcolo(opts.aziendaId)),
    fontDir: config().PDF_FONT_DIR,
  });
  const name = `calcolo-argano-${opts.nome}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${name}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    })
    .end(pdf);
}
