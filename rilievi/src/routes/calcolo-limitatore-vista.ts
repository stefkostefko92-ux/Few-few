import type { Request, Response } from 'express';
import { testataDi } from '../aziende/intestazione.js';
import { config } from '../config.js';
import { calcolaLimitatore, TIPI_PARACADUTE, type DatiLimitatore } from '../limitatore/calcolo.js';
import { limiteDi, type ErroriLimitatore, type ValoriForm } from '../limitatore/dati.js';
import { renderCalcoloLimitatore } from '../limitatore/pdf.js';
import { RIFERIMENTI, righeLimitatore } from '../limitatore/righe.js';
import { aziendaDelCalcolo } from '../argano/service.js';
import type { CalcoloSalvato } from '../limitatore/service.js';
import {
  rigaImpianto,
  type Identita,
  type Impianto,
  type Percorso,
} from './calcolo-argano-vista.js';

/**
 * Общото на изчислението за ограничителя на карта (calcolo-limitatore.ts) и без карта
 * (calcolo-limitatore-libero.ts): страницата с формата и резултатите (`limitatore/calcolo.ejs`) и PDF-ът.
 * Уредбата в заглавието, пътищата на страницата и фирмата на изчислението — като при аргано.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

export interface VistaLimitatore {
  percorso: Percorso;
  impianto: Impianto | null;
  identita: Identita | null;
  salvato: CalcoloSalvato | null;
  values: ValoriForm;
  errori: ErroriLimitatore;
  base: string;
  puoScrivere: boolean;
  conflitto?: boolean;
  proposto?: boolean;
}

export function renderLimitatore(res: Response, status: number, vista: VistaLimitatore): void {
  const t = res.locals.t as T;
  const dati = vista.salvato?.dati ?? null;
  const senzaErrori =
    Object.keys(vista.errori).length === 0 &&
    Object.keys(vista.identita?.errori ?? {}).length === 0 &&
    !vista.identita?.aziendaErrore;
  res.status(status).render('limitatore/calcolo', {
    title: t('limitatore.titolo'),
    conflitto: false,
    proposto: false,
    ...vista,
    impianto: vista.impianto ? rigaImpianto(vista.impianto, t) : '',
    // При грешки или конфликт записаните резултати не отговарят на формата — не се показват.
    sezioni:
      dati && senzaErrori && !vista.conflitto
        ? righeLimitatore(dati, calcolaLimitatore(dati), t)
        : [],
    tipi: TIPI_PARACADUTE,
    riferimenti: RIFERIMENTI,
    limiteDi,
  });
}

/** PDF-ът на записаното изчисление: A4, главата на фирмата на изчислението. */
export async function inviaPdfLimitatore(
  req: Request,
  res: Response,
  opts: {
    dati: DatiLimitatore;
    salvato: CalcoloSalvato;
    impianto: Impianto;
    aziendaId: string;
    nome: string;
  },
): Promise<void> {
  const t = res.locals.t as T;
  const pdf = await renderCalcoloLimitatore({
    sezioni: righeLimitatore(opts.dati, calcolaLimitatore(opts.dati), t),
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
  const name = `calcolo-limitatore-${opts.nome}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
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
