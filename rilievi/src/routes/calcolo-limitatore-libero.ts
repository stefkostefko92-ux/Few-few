import { Router, type Request, type Response } from 'express';
import {
  CAMPI_IMPIANTO,
  impiantoDaRicerca,
  parseImpianto,
  valoriImpianto,
  type ValoriImpianto,
} from '../argano/impianto.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { formDaDati, parseDatiLimitatore } from '../limitatore/dati.js';
import {
  creaLibero,
  eliminaLibero,
  leggiLibero,
  salvaLibero,
  type CalcoloLibero,
} from '../limitatore/service.js';
import { valoriDalBody, type Percorso } from './calcolo-argano-vista.js';
import { inviaPdfLimitatore, renderLimitatore } from './calcolo-limitatore-vista.js';
import { notFound, scope, writableAziende } from './schede-shared.js';

/**
 * Изчислението за ограничителя без карта — като „calcolo libero“ за аргано: уредба без карта, с адреса,
 * матрикулата и номера на ръка. Новото (`/calcolo-limitatore/nuovo`, POST `/calcolo-limitatore`) — във
 * фирма, в която човекът пише карти; записаното — същата страница като на картата, плюс уредбата горе.
 * Чете, който вижда картите на фирмата; пише, който ги пише; трие окончателно, който трие карти
 * (`schede:delete`). Чуждото — 404.
 */
export const limitatoreLiberoRouter: Router = Router();

const BASE = '/calcolo-limitatore';
const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const remove = requireCapability('schede:delete');

function percorso(req: Request, res: Response, calcolo: CalcoloLibero | null): Percorso {
  const t = res.locals.t as (key: string) => string;
  const indietro = { href: BASE, testo: t('limitatore.libero.indietro') };
  if (!calcolo) return { azione: BASE, pdf: null, indietro, annulla: BASE, elimina: null };
  const puoEliminare = canIn(principalOf(req).user, 'schede:delete', calcolo.aziendaId);
  return {
    azione: `${BASE}/${calcolo.id}`,
    pdf: `${BASE}/${calcolo.id}/pdf`,
    indietro,
    annulla: BASE,
    elimina: puoEliminare ? `${BASE}/${calcolo.id}/elimina` : null,
  };
}

const puoScrivere = (req: Request, calcolo: CalcoloLibero) =>
  canIn(principalOf(req).user, 'schede:write', calcolo.aziendaId);

/** Полетата на уредбата, както са пратени — за върнатата форма. */
const impiantoDalBody = (body: Record<string, unknown>): ValoriImpianto =>
  Object.fromEntries(
    CAMPI_IMPIANTO.flatMap((k) => (typeof body[k] === 'string' ? [[k, body[k]]] : [])),
  );

const salvatoDi = (calcolo: CalcoloLibero) => ({
  dati: calcolo.dati,
  updatedAt: calcolo.updatedAt,
  autore: calcolo.autore,
});

function renderLibero(
  req: Request,
  res: Response,
  status: number,
  calcolo: CalcoloLibero,
  extra: { values?: Record<string, string>; impianto?: ValoriImpianto; conflitto?: boolean } = {},
): void {
  renderLimitatore(res, status, {
    percorso: percorso(req, res, calcolo),
    impianto: calcolo.impianto,
    identita: {
      values: extra.impianto ?? valoriImpianto(calcolo.impianto),
      errori: {},
      aziende: [],
      azienda: calcolo.aziendaId,
      aziendaErrore: false,
    },
    salvato: salvatoDi(calcolo),
    values: extra.values ?? (calcolo.dati ? formDaDati(calcolo.dati) : {}),
    errori: {},
    base: calcolo.updatedAt.toISOString(),
    puoScrivere: puoScrivere(req, calcolo),
    conflitto: extra.conflitto ?? false,
  });
}

limitatoreLiberoRouter.get(`${BASE}/nuovo`, write, async (req, res) => {
  const aziende = await writableAziende(req);
  if (aziende.length === 0) return notFound(req, res);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const da = typeof req.query.da === 'string' ? req.query.da : '';
  renderLimitatore(res, 200, {
    percorso: percorso(req, res, null),
    impianto: null,
    identita: {
      values: impiantoDaRicerca(da),
      errori: {},
      aziende: aziende.length > 1 ? aziende : [],
      azienda:
        aziende.length === 1 ? aziende[0]!.id : aziende.some((a) => a.id === preset) ? preset : '',
      aziendaErrore: false,
    },
    salvato: null,
    values: {},
    errori: {},
    base: '',
    puoScrivere: true,
  });
});

limitatoreLiberoRouter.post(BASE, write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const aziende = await writableAziende(req);
  const azienda =
    aziende.length === 1 ? aziende[0]! : (aziende.find((a) => a.id === body.azienda) ?? null);
  const { impianto, errori: erroriImpianto } = parseImpianto(body);
  const { dati, errori } = parseDatiLimitatore(body);
  if (!azienda || !impianto || !dati) {
    return renderLimitatore(res, 422, {
      percorso: percorso(req, res, null),
      impianto: null,
      identita: {
        values: impiantoDalBody(body),
        errori: erroriImpianto,
        aziende: aziende.length > 1 ? aziende : [],
        azienda: typeof body.azienda === 'string' ? body.azienda : '',
        aziendaErrore: !azienda,
      },
      salvato: null,
      values: valoriDalBody(body),
      errori,
      base: '',
      puoScrivere: true,
    });
  }
  const id = await creaLibero(azienda.id, impianto, dati, principalOf(req).user.id);
  setFlash(res, 'ok', 'limitatore.flash.salvato');
  res.redirect(303, `${BASE}/${id}#risultati`);
});

limitatoreLiberoRouter.get(`${BASE}/:id`, read, async (req, res) => {
  const calcolo = await leggiLibero(scope(req, 'schede:read'), req.params.id);
  if (!calcolo) return notFound(req, res);
  renderLibero(req, res, 200, calcolo);
});

limitatoreLiberoRouter.post(`${BASE}/:id`, write, requireCsrf, async (req, res) => {
  const calcolo = await leggiLibero(scope(req, 'schede:read'), req.params.id);
  if (!calcolo || !puoScrivere(req, calcolo)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const { impianto, errori: erroriImpianto } = parseImpianto(body);
  const { dati, errori } = parseDatiLimitatore(body);
  if (!impianto || !dati) {
    return renderLimitatore(res, 422, {
      percorso: percorso(req, res, calcolo),
      impianto: calcolo.impianto,
      identita: {
        values: impiantoDalBody(body),
        errori: erroriImpianto,
        aziende: [],
        azienda: calcolo.aziendaId,
        aziendaErrore: false,
      },
      salvato: salvatoDi(calcolo),
      values: valoriDalBody(body),
      errori,
      base,
      puoScrivere: true,
    });
  }
  const esito = await salvaLibero(calcolo, base, impianto, dati, principalOf(req).user.id);
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'conflict') {
    const attuale = await leggiLibero(scope(req, 'schede:read'), calcolo.id);
    if (!attuale) return notFound(req, res);
    return renderLibero(req, res, 409, attuale, {
      values: valoriDalBody(body),
      impianto: impiantoDalBody(body),
      conflitto: true,
    });
  }
  setFlash(res, 'ok', 'limitatore.flash.salvato');
  res.redirect(303, `${BASE}/${calcolo.id}#risultati`);
});

limitatoreLiberoRouter.get(`${BASE}/:id/pdf`, read, pdfLimiter, async (req, res) => {
  const calcolo = await leggiLibero(scope(req, 'schede:read'), req.params.id);
  if (!calcolo?.dati) return notFound(req, res);
  await inviaPdfLimitatore(req, res, {
    dati: calcolo.dati,
    salvato: salvatoDi(calcolo),
    impianto: calcolo.impianto,
    aziendaId: calcolo.aziendaId,
    nome: calcolo.impianto.numeroImpianto ?? calcolo.impianto.matricola ?? calcolo.id.slice(-8),
  });
});

limitatoreLiberoRouter.post(`${BASE}/:id/elimina`, remove, requireCsrf, async (req, res) => {
  const calcolo = await leggiLibero(scope(req, 'schede:delete'), req.params.id);
  if (!calcolo || !(await eliminaLibero(calcolo, principalOf(req).user.id)))
    return notFound(req, res);
  setFlash(res, 'ok', 'limitatore.flash.eliminato');
  res.redirect(303, BASE);
});
