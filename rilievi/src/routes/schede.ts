import { Router, type Request } from 'express';
import { config } from '../config.js';
import { isPartial, principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { spansAziende } from '../auth/scope.js';
import { ordineSezioniDi } from '../aziende/sezioni.js';
import { FISSE } from '../schede/ordine.js';
import { aziendaLogo } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { businessDay } from '../time.js';
import { discrepanzeDi } from '../ordini/collegati.js';
import { riepilogoModuli } from '../ordini/riepilogo.js';
import {
  displaySections,
  emptyFormValues,
  formValuesFromScheda,
  schedaTitle,
} from '../schede/format.js';
import { pdfFileName, renderSchedaPdf } from '../schede/pdf.js';
import { listSchede } from '../schede/list.js';
import { highlight } from '../schede/search.js';
import {
  createScheda,
  getScheda,
  trashScheda,
  updateScheda,
  type SchedaFull,
} from '../schede/service.js';
import { formValuesFromBody, parseScheda, type FieldErrors } from '../schede/validation.js';
import {
  AZIENDA_ERROR_KEY,
  aziendeForNew,
  controlloDiscrepanze,
  renderForm,
} from './schede-form.js';
import { aziendaFilterOf, aziendeOf, notFound, queryOf, scope } from './schede-shared.js';

export const schedeRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const remove = requireCapability('schede:delete');

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

schedeRouter.get('/schede/nuova', write, async (req, res) => {
  const { choices, only } = await aziendeForNew(req);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  const azienda =
    only?.id ??
    (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : '');
  renderForm(req, res, 200, {
    scheda: null,
    values: emptyFormValues(businessDay()),
    errors: {},
    base: '',
    conflict: false,
    aziende: choices,
    azienda,
    ordineSezioni: await ordineSezioniDi(azienda || null),
  });
});

schedeRouter.post('/schede', write, requireCsrf, async (req, res) => {
  const user = principalOf(req).user;
  const body = req.body as Record<string, unknown>;
  const parsed = parseScheda(body);
  // Само фирма, в която човекът пише (MASTER — всяка активна); с една — винаги тя, каквото и да е пратил.
  const { choices, only } = await aziendeForNew(req);
  const azienda = only ?? choices.find((a) => a.id === body.azienda) ?? null;
  // Редът на разделите — на избраната фирма, само ако е измежду позволените.
  const ordineSezioni = await ordineSezioniDi(azienda?.id ?? null);
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
      ordineSezioni,
    });
    return;
  }
  const discrepanze = controlloDiscrepanze(res, body, null);
  if (discrepanze.manca) {
    // Картата и модулите казват различни неща: записът чака потвърждение на точно тези разлики.
    renderForm(req, res, 422, {
      scheda: null,
      values: formValuesFromBody(body),
      errors: {},
      base: '',
      conflict: false,
      aziende: choices,
      azienda: azienda.id,
      conferma: true,
      ordineSezioni,
    });
    return;
  }
  const scheda = await createScheda(
    { ...parsed.data, discrepanzeConfermate: discrepanze.impronta },
    user.id,
    azienda.id,
  );
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
    sections: displaySections(scheda, res.locals.t, res.locals.fmt, scheda.azienda.ordineSezioni),
    // Записани с потвърждение (или отпреди проверката) — да се виждат и след записа.
    discrepanze: discrepanzeDi(formValuesFromScheda(scheda, res.locals.fmt), res.locals.t),
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
  // Потвърдените при последния запис разлики не се питат пак — само нови или променени.
  const discrepanze = controlloDiscrepanze(res, body, scheda.discrepanzeConfermate);
  if (discrepanze.manca) {
    renderForm(req, res, 422, {
      ...formView,
      values: formValuesFromBody(body),
      errors: {},
      conflict: false,
      conferma: true,
    });
    return;
  }
  const outcome = await updateScheda(
    scope(req, 'schede:write'),
    scheda.id,
    base,
    { ...parsed.data, discrepanzeConfermate: discrepanze.impronta },
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
  const sections = displaySections(
    scheda,
    res.locals.t,
    res.locals.fmt,
    scheda.azienda.ordineSezioni,
  );
  res.render('schede/print', {
    scheda,
    ident: schedaTitle(scheda, res.locals.t),
    sections,
    // „Impianto“ и „Dati di targa“ са в заглавната лента и в табелата — не се печатат втори път.
    printed: sections.filter((section) => !FISSE.includes(section.key)),
    // Попълненото в модулите — само ако картата го иска (`riepilogoOrdini`).
    riepilogo: riepilogoModuli(scheda),
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
