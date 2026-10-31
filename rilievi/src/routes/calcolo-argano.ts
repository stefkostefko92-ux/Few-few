import { Router, type Request, type Response } from 'express';
import { calcolaArgano } from '../argano/calcolo.js';
import { formDaDati, prefillArgano, type ValoriForm } from '../argano/da-scheda.js';
import { limiteDi, parseDatiArgano, type ErroriArgano } from '../argano/dati.js';
import { renderCalcoloArgano } from '../argano/pdf.js';
import { righeRisultato } from '../argano/righe.js';
import {
  aziendaDellaScheda,
  leggiCalcolo,
  salvaCalcolo,
  type CalcoloSalvato,
} from '../argano/service.js';
import { CATENE, FUNI, FUNI_COMPENSAZIONE } from '../argano/tabelle.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { testataDi } from '../aziende/intestazione.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { ARGANI } from '../ordini/moduli.js';
import { storedValori } from '../ordini/valori.js';
import type { SchedaFull } from '../schede/service.js';
import { loadScheda, notFound } from './schede-shared.js';

/**
 * Изчислението за аргано на картата (собственикът, 31 октомври 2026 — от „RT-E MOD 10411-1“, отделна
 * страница и PDF): формата с данните (първия път — от „Modulo rilievi dati argani“ на картата), записът и
 * резултатите. Чете всеки, който вижда картата; пише, който пише карти в нейната фирма — не в кошчето.
 * Записът е върху отворената версия на изчислението (`base`).
 */
export const calcoloArganoRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');

const puoScrivere = (req: Request, scheda: SchedaFull) =>
  !scheda.deletedAt && canIn(principalOf(req).user, 'schede:write', scheda.aziendaId);

const identificativo = (scheda: SchedaFull) =>
  scheda.numeroImpianto ?? scheda.matricola ?? scheda.id.slice(-8);

/** Твърд интервал: надписът и стойността му не се разделят на два реда („N° impianto“ / „12“). */
const nonSpezzare = (testo: string) => testo.replace(/ /g, '\u00a0');

/** Уредбата в заглавието: адресът, матрикулата и номерът — каквото има. */
const impiantoDi = (scheda: SchedaFull, t: (key: string) => string) =>
  [
    scheda.indirizzo,
    scheda.matricola && nonSpezzare(`${t('argano.matricola')} ${scheda.matricola}`),
    scheda.numeroImpianto && nonSpezzare(`${t('argano.nImpianto')} ${scheda.numeroImpianto}`),
  ]
    .filter(Boolean)
    .join(' · ');

function render(
  req: Request,
  res: Response,
  status: number,
  opts: {
    scheda: SchedaFull;
    salvato: CalcoloSalvato | null;
    values: ValoriForm;
    errori: ErroriArgano;
    base: string;
    conflitto?: boolean;
    proposto?: boolean;
  },
): void {
  const t = res.locals.t as (key: string, params?: Record<string, string | number>) => string;
  const dati = opts.salvato?.dati ?? null;
  res.status(status).render('argano/calcolo', {
    title: t('argano.titolo'),
    ...opts,
    impianto: impiantoDi(opts.scheda, t),
    puoScrivere: puoScrivere(req, opts.scheda),
    sezioni:
      dati && Object.keys(opts.errori).length === 0 && !opts.conflitto
        ? righeRisultato(calcolaArgano(dati), dati, t)
        : [],
    funi: FUNI,
    catene: CATENE,
    funiCompensazione: FUNI_COMPENSAZIONE,
    limiteDi,
  });
}

calcoloArganoRouter.get('/schede/:id/calcolo-argano', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  const salvato = await leggiCalcolo(scheda.id);
  const values = salvato?.dati
    ? formDaDati(salvato.dati)
    : prefillArgano(storedValori(ARGANI, scheda.preventivoArgano), scheda.portataKg);
  render(req, res, 200, {
    scheda,
    salvato,
    values,
    errori: {},
    base: salvato ? salvato.updatedAt.toISOString() : '',
    proposto: !salvato?.dati,
  });
});

calcoloArganoRouter.post('/schede/:id/calcolo-argano', write, requireCsrf, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda || !puoScrivere(req, scheda)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const values: ValoriForm = Object.fromEntries(
    Object.entries(body).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[0] !== '_csrf',
    ),
  );
  const base = typeof body.base === 'string' ? body.base : '';
  const { dati, errori } = parseDatiArgano(body);
  if (!dati) {
    return render(req, res, 422, {
      scheda,
      salvato: await leggiCalcolo(scheda.id),
      values,
      errori,
      base,
    });
  }
  const esito = await salvaCalcolo(scheda, base, dati, principalOf(req).user.id);
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'conflict') {
    const salvato = await leggiCalcolo(scheda.id);
    return render(req, res, 409, {
      scheda,
      salvato,
      values,
      errori: {},
      base: salvato ? salvato.updatedAt.toISOString() : '',
      conflitto: true,
    });
  }
  setFlash(res, 'ok', 'argano.flash.salvato');
  res.redirect(303, `/schede/${scheda.id}/calcolo-argano#risultati`);
});

calcoloArganoRouter.get('/schede/:id/calcolo-argano.pdf', read, pdfLimiter, async (req, res) => {
  const scheda = await loadScheda(req);
  const salvato = scheda ? await leggiCalcolo(scheda.id) : null;
  if (!scheda || !salvato?.dati) return notFound(req, res);
  const t = res.locals.t as (key: string, params?: Record<string, string | number>) => string;
  const pdf = await renderCalcoloArgano({
    dati: salvato.dati,
    sezioni: righeRisultato(calcolaArgano(salvato.dati), salvato.dati, t),
    t,
    impianto: {
      indirizzo: scheda.indirizzo ?? '',
      matricola: scheda.matricola ?? '',
      numeroImpianto: scheda.numeroImpianto ?? '',
    },
    salvato: { quando: res.locals.fmt.dateTime(salvato.updatedAt), autore: salvato.autore ?? '' },
    testata: await testataDi(await aziendaDellaScheda(scheda.aziendaId)),
    fontDir: config().PDF_FONT_DIR,
  });
  const name = `calcolo-argano-${identificativo(scheda)}.pdf`.replace(/[^A-Za-z0-9._-]/g, '');
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${name}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    })
    .end(pdf);
});
