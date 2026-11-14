import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { scopeFor } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { datiDi, validaFino } from '../preventivi/dati.js';
import { listPreventivi } from '../preventivi/elenco.js';
import {
  clienteIdCambiato,
  formValuesDalBody,
  formValuesDaPreventivo,
  parsePreventivo,
  type ErroriPreventivo,
} from '../preventivi/form.js';
import {
  euro,
  imponibileRiga,
  quantitaTesto,
  riepilogo,
  scontoTesto,
} from '../preventivi/importi.js';
import {
  isStato,
  MODIFICABILI,
  passaggiDa,
  STATI,
  updatePreventivo,
} from '../preventivi/service.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import { aziendaFilterOf, aziendeOf, notFound } from './schede-shared.js';
import {
  aziendeInArchivio,
  loadPreventivo,
  puoOperare,
  puoScrivere,
  puoTogliere,
  renderPreventivoForm,
} from './preventivi-vista.js';

/**
 * Офертите (C1): списък (търсене, състояние, фирма), страница, редакция. Новата — preventivi-nuovo.ts;
 * PDF-ът, писмото, състоянието и изтриването — preventivi-azioni.ts; ценоразписът — preventivi-listino.ts.
 * Офертите съществуват само във фирма, в която MASTER ги е включил.
 */
export const preventiviRouter: Router = Router();

const read = requireCapability('preventivi:read');
const write = requireCapability('preventivi:write');

preventiviRouter.get('/preventivi', read, async (req, res) => {
  const readScope = scopeFor(principalOf(req).user, 'preventivi:read');
  const azienda = aziendaFilterOf(req, readScope);
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const stato = isStato(req.query.stato) ? req.query.stato : null;
  const [page, aziende] = await Promise.all([
    listPreventivi({ scope: readScope, azienda, stato, page: req.query.p, query }),
    aziendeOf(req, readScope),
  ]);
  res.render('preventivi/list', {
    titleKey: 'preventivi.list',
    page,
    aziende,
    aziendaFilter: azienda ?? '',
    query,
    stato: stato ?? '',
    stati: STATI,
    euro,
    archivio: aziendeInArchivio(req),
  });
});

preventiviRouter.get('/preventivi/:id', read, async (req, res) => {
  const row = await loadPreventivo(req);
  if (!row) return notFound(req, res);
  const dati = datiDi(row);
  const scrive = puoScrivere(req, row);
  const opera = puoOperare(req, row);
  res.render('preventivi/show', {
    titleKey: 'preventivi.titolo',
    preventivo: row,
    dati,
    importi: dati.righe.map((r) => imponibileRiga(r)),
    riepilogo: riepilogo(dati.righe),
    validoFino: validaFino(dati.data, dati.validitaGiorni),
    modifica: scrive && MODIFICABILI.includes(row.stato),
    scrive,
    opera,
    elimina: puoTogliere(req, row),
    passaggi: opera ? passaggiDa(row.stato) : [],
    euro,
    quantitaTesto,
    scontoTesto,
  });
});

preventiviRouter.get('/preventivi/:id/modifica', write, async (req, res) => {
  const row = await loadPreventivo(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  if (!MODIFICABILI.includes(row.stato)) {
    setFlash(res, 'info', 'preventivi.flash.bloccato');
    res.redirect(303, `/preventivi/${row.id}`);
    return;
  }
  renderPreventivoForm(res, 200, {
    preventivo: row,
    // Профилът от регистъра — и какъв е бил при отварянето (`clienteIdPrima`): несменен, не се пипа.
    values: {
      ...formValuesDaPreventivo(datiDi(row)),
      clienteId: row.clienteId ?? '',
      clienteIdPrima: row.clienteId ?? '',
    },
    errors: {},
    base: row.updatedAt.toISOString(),
    aziende: [],
    azienda: row.aziendaId,
  });
});

preventiviRouter.post('/preventivi/:id', write, requireCsrf, async (req, res) => {
  const row = await loadPreventivo(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parsePreventivo(body);
  const again = (status: number, errors: ErroriPreventivo, conflict = false) =>
    renderPreventivoForm(res, status, {
      preventivo: row,
      values: formValuesDalBody(body),
      errors,
      base: conflict ? row.updatedAt.toISOString() : base,
      aziende: [],
      azienda: row.aziendaId,
      conflict,
    });
  if (!parsed.ok) return again(422, parsed.errors);
  const esito = await updatePreventivo({
    id: row.id,
    aziendaId: row.aziendaId,
    base,
    data: parsed.data,
    actorId: principalOf(req).user.id,
    clienteId: clienteIdCambiato(body),
  });
  if (esito.esito === 'missing') return notFound(req, res);
  if (esito.esito === 'bloccato') {
    setFlash(res, 'error', 'preventivi.flash.bloccato');
    res.redirect(303, `/preventivi/${row.id}`);
    return;
  }
  // Написаното от човека остава във формата; `base` — записаното от другия.
  if (esito.esito !== 'ok') return again(409, {}, true);
  setFlash(res, 'ok', 'preventivi.flash.salvato');
  res.redirect(303, `/preventivi/${row.id}`);
});
