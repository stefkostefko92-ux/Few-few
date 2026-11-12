import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { datiDi } from '../buoni/dati.js';
import { firmeVista, improntaFinale, type FirmaVista } from '../buoni/documento.js';
import { formValuesDaBuono, formValuesDalBody, indiciRighe } from '../buoni/form-valori.js';
import { parseBuono, type ErroriBuono } from '../buoni/form.js';
import { postoControllo, postoFinale, postoRiga } from '../buoni/posti.js';
import { chiuso, getBuono, listBuoni, type BuonoFull } from '../buoni/elenco.js';
import { updateBuono } from '../buoni/service.js';
import { CONTROLLI, FIRME_FINALI, MAX, MAX_SEQUENZE, RIGHE_VUOTE } from '../buoni/voci.js';
import { setFlash } from '../http/flash.js';
import type { FormValues } from '../schede/field-parsers.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import type { Ricerca, SchedaScelta } from './cartelli-nuovo.js';
import { informativaDi } from './firma-copia.js';
import { scope } from './interventi.js';
import { aziendaFilterOf, aziendeOf, notFound } from './schede-shared.js';

/**
 * „Buono di lavoro“: списък (с търсене), страница, редакция. Новият — buoni-nuovo.ts; подписите долу,
 * PDF-ът, писмото и изтриването — buoni-firme.ts. Правата — на асистенцията (`interventi:read` /
 * `interventi:write`); обхватът е по фирма, чужд лист — 404. Докато има подпис долу, листът не се пише
 * (подписите долу се махат първо, на страницата му).
 */
export const buoniRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');

export const loadBuono = (req: Request) =>
  getBuono(scope(req, 'interventi:read'), String(req.params.id));

export const puoScrivere = (req: Request, row: BuonoFull): boolean =>
  canIn(principalOf(req).user, 'interventi:write', row.aziendaId);

export interface BuonoFormView {
  buono: BuonoFull | null;
  values: FormValues;
  errors: ErroriBuono;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
  scheda?: SchedaScelta | null;
  ricerca?: Ricerca | null;
  puoCercare?: boolean;
}

/** Местата на редовете във формата: пратените/записаните и още няколко празни (до 30 общо). */
function righeForm(values: FormValues): number[] {
  const piene = indiciRighe(values);
  const prossimo = piene.length ? piene.at(-1)! + 1 : 0;
  const vuote = Math.max(0, Math.min(RIGHE_VUOTE, MAX_SEQUENZE - piene.length));
  return [...piene, ...Array.from({ length: vuote }, (_, i) => prossimo + i)];
}

export function renderBuonoForm(res: Response, status: number, view: BuonoFormView): void {
  const firme = view.buono ? firmeVista(view.buono) : new Map<string, FirmaVista>();
  const righe = righeForm(view.values);
  res.status(status).render('buoni/form', {
    titleKey: view.buono ? 'buoni.modifica' : 'buoni.new',
    controlli: CONTROLLI,
    righe,
    prossimo: righe.length ? righe.at(-1)! + 1 : 0,
    max: MAX,
    maxSequenze: MAX_SEQUENZE,
    firme,
    postoRiga,
    postoControllo,
    scheda: null,
    ricerca: null,
    puoCercare: false,
    scripts: ['firma', 'buoni'],
    ...view,
  });
}

/** Каквото листът като на хартия (`_foglio.ejs`) иска — на страницата и при подписите долу. */
export function vistaFoglio(row: BuonoFull) {
  return {
    buono: row,
    dati: datiDi(row),
    controlli: CONTROLLI,
    finali: FIRME_FINALI,
    firme: firmeVista(row),
    postoRiga,
    postoControllo,
    postoFinale,
  };
}

buoniRouter.get('/buoni', read, async (req, res) => {
  const readScope = scope(req, 'interventi:read');
  const azienda = aziendaFilterOf(req, readScope);
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const [page, aziende] = await Promise.all([
    listBuoni({ scope: readScope, azienda, page: req.query.p, query }),
    aziendeOf(req, readScope),
  ]);
  res.render('buoni/list', {
    titleKey: 'buoni.list',
    page,
    aziende,
    aziendaFilter: azienda ?? '',
    query,
  });
});

buoniRouter.get('/buoni/:id', read, async (req, res) => {
  const row = await loadBuono(req);
  if (!row) return notFound(req, res);
  const modifica = puoScrivere(req, row);
  res.render('buoni/show', {
    titleKey: 'buoni.titolo',
    ...vistaFoglio(row),
    modifica,
    informativa: modifica ? await informativaDi(row.aziendaId) : null,
    chiuso: chiuso(row),
    impronta: improntaFinale(row),
    base: row.updatedAt.toISOString(),
    values: {},
    errors: {},
    scripts: ['firma'],
  });
});

buoniRouter.get('/buoni/:id/modifica', write, async (req, res) => {
  const row = await loadBuono(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  if (chiuso(row)) {
    setFlash(res, 'info', 'buoni.flash.chiuso');
    res.redirect(303, `/buoni/${row.id}#firme`);
    return;
  }
  renderBuonoForm(res, 200, {
    buono: row,
    values: formValuesDaBuono(datiDi(row)),
    errors: {},
    base: row.updatedAt.toISOString(),
    aziende: [],
    azienda: row.aziendaId,
  });
});

/** Грешките на подписите (по място) — до реда си във формата; махнатият подписан ред — общо. */
export function erroriFirme(
  errori: Record<string, string>,
  campi: ReadonlyMap<string, string>,
): ErroriBuono {
  const out: ErroriBuono = {};
  for (const [posto, codice] of Object.entries(errori)) {
    const campo = campi.get(posto) ?? 'firme';
    out[campo] = codice as ErroriBuono[string];
  }
  return out;
}

buoniRouter.post('/buoni/:id', write, requireCsrf, async (req, res) => {
  const row = await loadBuono(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const again = (status: number, errors: ErroriBuono, conflict = false) =>
    renderBuonoForm(res, status, {
      buono: row,
      values: formValuesDalBody(body),
      errors,
      base: conflict ? row.updatedAt.toISOString() : base,
      aziende: [],
      azienda: row.aziendaId,
      conflict,
    });
  const parsed = parseBuono(body);
  if (!parsed.ok) return again(422, parsed.errors);
  const esito = await updateBuono({
    scope: scope(req, 'interventi:write'),
    id: row.id,
    base,
    data: parsed.data,
    firme: parsed.firme,
    actorId: principalOf(req).user.id,
  });
  if (esito.esito === 'missing') return notFound(req, res);
  if (esito.esito === 'chiuso') {
    setFlash(res, 'error', 'buoni.flash.chiuso');
    res.redirect(303, `/buoni/${row.id}#firme`);
    return;
  }
  // Написаното от човека остава във формата; `base` — записаното от другия.
  if (esito.esito === 'conflict') return again(409, {}, true);
  if (esito.esito === 'firme') return again(422, erroriFirme(esito.errori, parsed.campi));
  // „Togli la firma“ връща на формата, на реда — за да се пипне веднага.
  if (parsed.firme.togli.size > 0) {
    const posto = [...parsed.firme.togli][0]!;
    setFlash(res, 'ok', 'buoni.flash.firmaTolta');
    const anchor = posto.startsWith('s-')
      ? `riga-${posto.slice(2)}`
      : `controllo-${posto.slice(2)}`;
    res.redirect(303, `/buoni/${row.id}/modifica#${anchor}`);
    return;
  }
  setFlash(res, 'ok', 'buoni.flash.salvato');
  res.redirect(303, `/buoni/${row.id}`);
});
