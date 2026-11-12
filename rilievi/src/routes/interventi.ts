import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import type { Capability } from '../auth/roles.js';
import { canIn, scopeFor, type Scope } from '../auth/scope.js';
import { activeAziende } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { sigilloIntatto } from '../interventi/conferma.js';
import { firmaSalvata, pathFirma } from '../interventi/firma.js';
import {
  formValuesDalBody,
  formValuesFromIntervento,
  parseIntervento,
  TURNI,
} from '../interventi/form.js';
import {
  createIntervento,
  getIntervento,
  listInterventi,
  numeroModulo,
  updateIntervento,
  type InterventoFull,
} from '../interventi/service.js';
import { improntaLeggibile } from '../interventi/sigillo.js';
import { codiceVoce, GRUPPI_VOCI, MAX_CAMPO, valoriVoci } from '../interventi/voci.js';
import type { FieldErrors, FormValues } from '../schede/field-parsers.js';
import { businessDay } from '../time.js';
import { aziendaFilterOf, aziendeOf, notFound } from './schede-shared.js';

/**
 * Листовете за интервенция („Servizio assistenza elevatori“): списък, нов, страница, редакция на
 * черновата. Подписът и потвърждението — interventi-firma.ts; PDF и имейл — interventi-invio.ts. Обхватът
 * е по фирма; чужд лист — 404. Потвърденият лист не се пише по никой път — само PDF и имейл.
 */
export const interventiRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');
export const scope = (req: Request, capability: Capability): Scope =>
  scopeFor(principalOf(req).user, capability);

/** Фирмите, в които човекът може да създаде лист: всички активни за MASTER, иначе тези с право на запис. */
async function aziendePerNuovo(req: Request) {
  const user = principalOf(req).user;
  const writable = scope(req, 'interventi:write');
  const choices = writable.all
    ? await activeAziende()
    : user.memberships
        .filter((m) => writable.aziendaIds.includes(m.aziendaId))
        .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
  const only = !user.master && choices.length === 1 ? choices[0]! : null;
  return { choices: only ? [] : choices, only };
}

export const loadIntervento = (req: Request) =>
  getIntervento(scope(req, 'interventi:read'), String(req.params.id));

export const puoScrivere = (req: Request, row: InterventoFull) =>
  !row.confermatoAt && canIn(principalOf(req).user, 'interventi:write', row.aziendaId);

interface FormView {
  intervento: InterventoFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
}

function renderForm(res: Response, status: number, view: FormView): void {
  const numero = view.intervento ? numeroModulo(view.intervento.numero) : null;
  res.status(status).render('interventi/form', {
    titleKey: 'interventi.new',
    title: numero ? res.locals.t('interventi.numero', { n: numero }) : undefined,
    scripts: [],
    gruppi: GRUPPI_VOCI,
    codice: codiceVoce,
    maxCampo: MAX_CAMPO,
    turni: TURNI,
    numero,
    ...view,
  });
}

interventiRouter.get('/interventi', read, async (req, res) => {
  const readScope = scope(req, 'interventi:read');
  const azienda = aziendaFilterOf(req, readScope);
  const [page, aziende] = await Promise.all([
    listInterventi({ scope: readScope, azienda, page: req.query.p }),
    aziendeOf(req, readScope),
  ]);
  res.render('interventi/list', {
    titleKey: 'interventi.list',
    page,
    numero: numeroModulo,
    aziende,
    aziendaFilter: azienda ?? '',
  });
});

interventiRouter.get('/interventi/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerNuovo(req);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  renderForm(res, 200, {
    intervento: null,
    values: { data: businessDay(), tecnici: principalOf(req).user.name },
    errors: {},
    base: '',
    aziende: choices,
    azienda:
      only?.id ??
      (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : ''),
  });
});

interventiRouter.post('/interventi', write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const parsed = parseIntervento(body);
  const { choices, only } = await aziendePerNuovo(req);
  const azienda = only ?? choices.find((a) => a.id === body.azienda) ?? null;
  if (!parsed.ok || !azienda) {
    renderForm(res, 422, {
      intervento: null,
      values: formValuesDalBody(body),
      errors: { ...(azienda ? {} : { azienda: 'azienda' }), ...(parsed.ok ? {} : parsed.errors) },
      base: '',
      aziende: choices,
      azienda: only?.id ?? (typeof body.azienda === 'string' ? body.azienda : ''),
    });
    return;
  }
  const created = await createIntervento(parsed.data, principalOf(req).user.id, azienda.id);
  setFlash(res, 'ok', 'interventi.flash.creato', { n: numeroModulo(created.numero) });
  res.redirect(303, `/interventi/${created.id}`);
});

interventiRouter.get('/interventi/:id', read, async (req, res) => {
  const row = await loadIntervento(req);
  if (!row) return notFound(req, res);
  const tecnico = firmaSalvata(row.firmaTecnico);
  const cliente = firmaSalvata(row.firmaCliente);
  // Потвърденият лист навън — само с непокътнат печат: иначе нито PDF, нито имейл (interventi-invio.ts).
  const sigillo = row.confermatoAt ? sigilloIntatto(row) : null;
  res.render('interventi/show', {
    titleKey: 'interventi.titolo',
    title: res.locals.t('interventi.numero', { n: numeroModulo(row.numero) }),
    intervento: row,
    numero: numeroModulo(row.numero),
    gruppi: GRUPPI_VOCI,
    codice: codiceVoce,
    voci: valoriVoci(row.voci),
    firme: {
      tecnico: tecnico ? pathFirma(tecnico) : null,
      cliente: cliente ? pathFirma(cliente) : null,
    },
    modifica: puoScrivere(req, row),
    sigillo,
    impronta: sigillo && row.impronta ? improntaLeggibile(row.impronta) : null,
    invia: sigillo === true && canIn(principalOf(req).user, 'interventi:write', row.aziendaId),
  });
});

interventiRouter.get('/interventi/:id/modifica', write, async (req, res) => {
  const row = await loadIntervento(req);
  if (!row || !canIn(principalOf(req).user, 'interventi:write', row.aziendaId))
    return notFound(req, res);
  if (row.confermatoAt) {
    setFlash(res, 'info', 'interventi.chiuso');
    res.redirect(303, `/interventi/${row.id}`);
    return;
  }
  renderForm(res, 200, {
    intervento: row,
    values: formValuesFromIntervento(row),
    errors: {},
    base: row.updatedAt.toISOString(),
    aziende: [],
    azienda: row.aziendaId,
  });
});

interventiRouter.post('/interventi/:id', write, requireCsrf, async (req, res) => {
  const row = await loadIntervento(req);
  if (!row || !canIn(principalOf(req).user, 'interventi:write', row.aziendaId))
    return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  if (row.confermatoAt) {
    setFlash(res, 'error', 'interventi.chiuso');
    res.redirect(303, `/interventi/${row.id}`);
    return;
  }
  const parsed = parseIntervento(body);
  const again = (status: number, errors: FieldErrors, conflict = false) =>
    renderForm(res, status, {
      intervento: row,
      values: formValuesDalBody(body),
      errors,
      base: conflict ? row.updatedAt.toISOString() : base,
      aziende: [],
      azienda: row.aziendaId,
      conflict,
    });
  if (!parsed.ok) return again(422, parsed.errors);
  const esito = await updateIntervento(
    scope(req, 'interventi:write'),
    row.id,
    base,
    parsed.data,
    principalOf(req).user.id,
  );
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'chiuso') {
    setFlash(res, 'error', 'interventi.chiuso');
    res.redirect(303, `/interventi/${row.id}`);
    return;
  }
  if (esito === 'conflict') return again(409, {}, true);
  setFlash(res, 'ok', 'interventi.flash.salvato');
  res.redirect(303, `/interventi/${row.id}`);
});
