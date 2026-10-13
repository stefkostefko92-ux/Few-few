import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { isPartial, principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { roleIn, spansAziende } from '../auth/scope.js';
import { aziendaLogo } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { businessDay } from '../time.js';
import { activeFields, SECTIONS } from '../schede/fields.js';
import { MAX_MISURE, misuraOf, misuraTemplateRow, misureFormRows } from '../schede/misure.js';
import {
  displaySections,
  emptyFormValues,
  formValuesFromScheda,
  schedaTitle,
} from '../schede/format.js';
import { pdfFileName, renderSchedaPdf } from '../schede/pdf.js';
import { highlight } from '../schede/search.js';
import {
  createScheda,
  getScheda,
  listSchede,
  trashScheda,
  updateScheda,
  type SchedaFull,
} from '../schede/service.js';
import {
  formValuesFromBody,
  IDENTIFIERS_ERROR_KEY,
  parseScheda,
  type FieldErrors,
  type FormValues,
} from '../schede/validation.js';
import { moduloFieldOf, withPrefill } from '../ordini/form.js';
import { SLOTS } from '../ordini/registry.js';
import {
  aziendaFilterOf,
  aziendeOf,
  notFound,
  queryOf,
  scope,
  writableAziende,
} from './schede-shared.js';

export const schedeRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const remove = requireCapability('schede:delete');

/** Ключът на грешката „избери фирма“ във формата (MASTER или човек в няколко фирми). */
const AZIENDA_ERROR_KEY = 'azienda';

schedeRouter.get('/schede', read, async (req, res) => {
  const query = queryOf(req);
  const readScope = scope(req, 'schede:read');
  const azienda = aziendaFilterOf(req, readScope);
  const [page, aziende] = await Promise.all([
    listSchede({ scope: readScope, azienda, query, page: req.query.p }),
    aziendeOf(req, readScope),
  ]);
  const view = { page, query, highlight, aziende, aziendaFilter: azienda ?? '' };
  if (isPartial(req)) {
    res.render('schede/_results', view);
    return;
  }
  res.render('schede/list', view);
});

/** Картата от адреса, в обхвата; изтритата — само за тези, които виждат кошчето на нейната фирма. */
async function loadScheda(req: Request): Promise<SchedaFull | null> {
  return getScheda(scope(req, 'schede:read'), String(req.params.id), scope(req, 'schede:trash'));
}

interface FormView {
  scheda: SchedaFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  conflict: boolean;
  /** При нова карта: фирмите за избор (MASTER или човек в няколко фирми) и избраната. */
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
}

function renderForm(req: Request, res: Response, status: number, view: FormView): void {
  const user = principalOf(req).user;
  // Модулите на доставчиците: при първото отваряне — от огледа, от фирмата и от човека, който пише
  // (ролята му в ТАЗИ фирма).
  const aziendaId = view.scheda?.aziendaId || view.azienda || null;
  const role = roleIn(user, aziendaId);
  const values = withPrefill(view.values, {
    azienda:
      view.scheda?.azienda.name ??
      user.memberships.find((m) => m.aziendaId === aziendaId)?.aziendaName ??
      '',
    utente: user.name,
    ruolo: role ? res.locals.t(`role.${role}`) : '',
    email: user.email,
  });
  res.status(status).render('schede/form', {
    ...view,
    showAzienda: spansAziende(scope(req, 'schede:read')),
    values,
    sections: SECTIONS,
    identifiersErrorKey: IDENTIFIERS_ERROR_KEY,
    aziendaErrorKey: AZIENDA_ERROR_KEY,
    // Кои полета с условие се виждат при отварянето (app.js ги следи после, докато се пише).
    active: activeFields((key) => view.values[key]),
    misureRows: misureFormRows(view.values, view.errors),
    misuraTemplate: misuraTemplateRow(),
    maxMisure: MAX_MISURE,
    misuraOf,
    moduli: SLOTS,
    moduloFieldOf,
  });
}

/**
 * Фирмите за нова карта: MASTER избира всяка активна; човек с право на запис в една фирма пише винаги
 * в нея (без избор); в няколко — избира.
 */
async function aziendeForNew(req: Request) {
  const choices = await writableAziende(req);
  const only = !principalOf(req).user.master && choices.length === 1 ? choices[0]! : null;
  return { choices: only ? [] : choices, only };
}

schedeRouter.get('/schede/nuova', write, async (req, res) => {
  const { choices, only } = await aziendeForNew(req);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  renderForm(req, res, 200, {
    scheda: null,
    values: emptyFormValues(businessDay()),
    errors: {},
    base: '',
    conflict: false,
    aziende: choices,
    azienda:
      only?.id ??
      (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : ''),
  });
});

schedeRouter.post('/schede', write, requireCsrf, async (req, res) => {
  const user = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const parsed = parseScheda(body);
  // Само фирма, в която човекът пише (MASTER — всяка активна); с една — винаги тя, каквото и да е пратил.
  const { choices, only } = await aziendeForNew(req);
  const azienda = only ?? choices.find((a) => a.id === body.azienda) ?? null;
  if (!parsed.ok || !azienda) {
    const errors: FieldErrors = azienda ? {} : { [AZIENDA_ERROR_KEY]: 'azienda' };
    renderForm(req, res, 422, {
      scheda: null,
      values: formValuesFromBody(body),
      errors: { ...errors, ...(parsed.ok ? {} : parsed.errors) },
      base: '',
      conflict: false,
      aziende: choices,
      azienda: only?.id ?? (typeof body.azienda === 'string' ? body.azienda : ''),
    });
    return;
  }
  const scheda = await createScheda(parsed.data, user.id, azienda.id);
  setFlash(res, 'ok', 'flash.schedaCreated');
  res.redirect(303, `/schede/${scheda.id}`);
});

schedeRouter.get('/schede/:id', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  res.render('schede/show', {
    scheda,
    showAzienda: spansAziende(scope(req, 'schede:read')),
    ident: schedaTitle(scheda, res.locals.t),
    sections: displaySections(scheda, res.locals.t, res.locals.fmt),
  });
});

schedeRouter.get('/schede/:id/modifica', write, async (req, res) => {
  const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  renderForm(req, res, 200, {
    scheda,
    values: formValuesFromScheda(scheda, res.locals.fmt),
    errors: {},
    base: scheda.updatedAt.toISOString(),
    conflict: false,
    aziende: [],
    azienda: scheda.aziendaId,
  });
});

schedeRouter.post('/schede/:id', write, requireCsrf, async (req, res) => {
  const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parseScheda(body);
  const formView = { scheda, base, aziende: [], azienda: scheda.aziendaId };
  if (!parsed.ok) {
    renderForm(req, res, 422, {
      ...formView,
      values: formValuesFromBody(body),
      errors: parsed.errors,
      conflict: false,
    });
    return;
  }
  const outcome = await updateScheda(
    scope(req, 'schede:write'),
    scheda.id,
    base,
    parsed.data,
    principalOf(req).user.id,
  );
  if (outcome === 'missing') return notFound(req, res);
  if (outcome === 'conflict') {
    // Въведеното остава на екрана; човекът решава след като види новата версия.
    renderForm(req, res, 409, {
      ...formView,
      values: formValuesFromBody(body),
      errors: {},
      conflict: true,
    });
    return;
  }
  setFlash(res, 'ok', 'flash.schedaSaved');
  res.redirect(303, `/schede/${scheda.id}`);
});

schedeRouter.get('/schede/:id/stampa', read, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  res.render('schede/print', {
    scheda,
    ident: schedaTitle(scheda, res.locals.t),
    sections: displaySections(scheda, res.locals.t, res.locals.fmt),
    autoPrint: req.query.auto === '1',
  });
});

schedeRouter.get('/schede/:id/pdf', read, pdfLimiter, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  const logo = scheda.azienda.logoType ? await aziendaLogo(scheda.aziendaId) : null;
  const pdf = await renderSchedaPdf(scheda, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    generatedBy: principalOf(req).user.name,
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
  });
  const name = pdfFileName(scheda);
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

schedeRouter.get('/schede/:id/elimina', remove, async (req, res) => {
  const scheda = await getScheda(scope(req, 'schede:delete'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'trash' });
});

schedeRouter.post('/schede/:id/elimina', remove, requireCsrf, async (req, res) => {
  const ok = await trashScheda(
    scope(req, 'schede:delete'),
    String(req.params.id),
    principalOf(req).user.id,
  );
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaTrashed');
  res.redirect(303, '/schede');
});
