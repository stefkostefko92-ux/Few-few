import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { can } from '../auth/roles.js';
import { isPartial, principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { activeAzienda, activeAziende, allAziendeNames, aziendaLogo } from '../aziende/service.js';
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
import { aziendaFilterOf, notFound, queryOf, scope } from './schede-shared.js';

export const schedeRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const remove = requireCapability('schede:delete');

/** Ключът на грешката „избери фирма“ във формата на MASTER. */
const AZIENDA_ERROR_KEY = 'azienda';

schedeRouter.get('/schede', read, async (req, res) => {
  const query = queryOf(req);
  const azienda = aziendaFilterOf(req);
  const [page, aziende] = await Promise.all([
    listSchede({ scope: scope(req), azienda, query, page: req.query.p }),
    scope(req).all ? allAziendeNames() : Promise.resolve([]),
  ]);
  const view = { page, query, highlight, aziende, aziendaFilter: azienda ?? '' };
  if (isPartial(req)) {
    res.render('schede/_results', view);
    return;
  }
  res.render('schede/list', view);
});

/** Картата от адреса, в обхвата; изтритата — само за тези, които виждат кошчето. */
async function loadScheda(req: Request): Promise<SchedaFull | null> {
  const canTrash = can(principalOf(req).user.role, 'schede:trash');
  return getScheda(scope(req), String(req.params.id), canTrash);
}

interface FormView {
  scheda: SchedaFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  conflict: boolean;
  /** Само за MASTER при нова карта: фирмите за избор и избраната. */
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
}

function renderForm(res: Response, status: number, view: FormView): void {
  res.status(status).render('schede/form', {
    ...view,
    sections: SECTIONS,
    identifiersErrorKey: IDENTIFIERS_ERROR_KEY,
    aziendaErrorKey: AZIENDA_ERROR_KEY,
    // Кои полета с условие се виждат при отварянето (app.js ги следи после, докато се пише).
    active: activeFields((key) => view.values[key]),
    misureRows: misureFormRows(view.values, view.errors),
    misuraTemplate: misuraTemplateRow(),
    maxMisure: MAX_MISURE,
    misuraOf,
  });
}

schedeRouter.get('/schede/nuova', write, async (req, res) => {
  const aziende = scope(req).all ? await activeAziende() : [];
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  renderForm(res, 200, {
    scheda: null,
    values: emptyFormValues(businessDay()),
    errors: {},
    base: '',
    conflict: false,
    aziende,
    azienda: aziende.some((a) => a.id === preset)
      ? preset
      : aziende.length === 1
        ? aziende[0]!.id
        : '',
  });
});

schedeRouter.post('/schede', write, requireCsrf, async (req, res) => {
  const user = principalOf(req).user;
  const userScope = scope(req);
  const body = req.body as Record<string, unknown>;
  const parsed = parseScheda(body);
  // MASTER избира фирмата (активна); всеки друг пише в своята, каквото и да е пратил.
  const azienda = userScope.all ? await activeAzienda(body.azienda) : { id: userScope.aziendaId };
  if (!parsed.ok || !azienda) {
    const aziende = userScope.all ? await activeAziende() : [];
    const errors: FieldErrors = azienda ? {} : { [AZIENDA_ERROR_KEY]: 'azienda' };
    renderForm(res, 422, {
      scheda: null,
      values: formValuesFromBody(body),
      errors: { ...errors, ...(parsed.ok ? {} : parsed.errors) },
      base: '',
      conflict: false,
      aziende,
      azienda: typeof body.azienda === 'string' ? body.azienda : '',
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
    ident: schedaTitle(scheda, res.locals.t),
    sections: displaySections(scheda, res.locals.t, res.locals.fmt),
  });
});

schedeRouter.get('/schede/:id/modifica', write, async (req, res) => {
  const scheda = await getScheda(scope(req), String(req.params.id));
  if (!scheda) return notFound(req, res);
  renderForm(res, 200, {
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
  const scheda = await getScheda(scope(req), String(req.params.id));
  if (!scheda) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parseScheda(body);
  const formView = { scheda, base, aziende: [], azienda: scheda.aziendaId };
  if (!parsed.ok) {
    renderForm(res, 422, {
      ...formView,
      values: formValuesFromBody(body),
      errors: parsed.errors,
      conflict: false,
    });
    return;
  }
  const outcome = await updateScheda(
    scope(req),
    scheda.id,
    base,
    parsed.data,
    principalOf(req).user.id,
  );
  if (outcome === 'missing') return notFound(req, res);
  if (outcome === 'conflict') {
    // Въведеното остава на екрана; човекът решава след като види новата версия.
    renderForm(res, 409, {
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
  const scheda = await getScheda(scope(req), String(req.params.id));
  if (!scheda) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'trash' });
});

schedeRouter.post('/schede/:id/elimina', remove, requireCsrf, async (req, res) => {
  const ok = await trashScheda(scope(req), String(req.params.id), principalOf(req).user.id);
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaTrashed');
  res.redirect(303, '/schede');
});
