import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { can } from '../auth/roles.js';
import {
  isPartial,
  principalOf,
  requireCapability,
  requireCsrf,
  sendError,
} from '../auth/guards.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { businessDay } from '../time.js';
import { SECTIONS } from '../schede/fields.js';
import {
  displaySections,
  emptyFormValues,
  formValuesFromScheda,
  schedaTitle,
} from '../schede/format.js';
import { pdfFileName, renderSchedaPdf } from '../schede/pdf.js';
import { highlight, MAX_QUERY_LENGTH } from '../schede/search.js';
import {
  createScheda,
  getScheda,
  listSchede,
  purgeScheda,
  restoreScheda,
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

export const schedeRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const remove = requireCapability('schede:delete');
const trash = requireCapability('schede:trash');

function queryOf(req: Request): string {
  const q = req.query.q;
  return typeof q === 'string' ? q.slice(0, MAX_QUERY_LENGTH) : '';
}

schedeRouter.get('/schede', read, async (req, res) => {
  const query = queryOf(req);
  const page = await listSchede({ query, page: req.query.p });
  const view = { page, query, highlight };
  if (isPartial(req)) {
    res.render('schede/_results', view);
    return;
  }
  res.render('schede/list', view);
});

function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}

/** Схемата от адреса; изтритата — само за тези, които виждат кошчето. */
async function loadScheda(req: Request): Promise<SchedaFull | null> {
  const canTrash = can(principalOf(req).user.role, 'schede:trash');
  return getScheda(String(req.params.id), canTrash);
}

interface FormView {
  scheda: SchedaFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  conflict: boolean;
}

function renderForm(res: Response, status: number, view: FormView): void {
  res.status(status).render('schede/form', {
    ...view,
    sections: SECTIONS,
    identifiersErrorKey: IDENTIFIERS_ERROR_KEY,
  });
}

schedeRouter.get('/schede/nuova', write, (_req, res) => {
  renderForm(res, 200, {
    scheda: null,
    values: emptyFormValues(businessDay()),
    errors: {},
    base: '',
    conflict: false,
  });
});

schedeRouter.post('/schede', write, requireCsrf, async (req, res) => {
  const parsed = parseScheda(req.body);
  if (!parsed.ok) {
    renderForm(res, 422, {
      scheda: null,
      values: formValuesFromBody(req.body),
      errors: parsed.errors,
      base: '',
      conflict: false,
    });
    return;
  }
  const scheda = await createScheda(parsed.data, principalOf(req).user.id);
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
  const scheda = await getScheda(String(req.params.id));
  if (!scheda) return notFound(req, res);
  renderForm(res, 200, {
    scheda,
    values: formValuesFromScheda(scheda, res.locals.fmt),
    errors: {},
    base: scheda.updatedAt.toISOString(),
    conflict: false,
  });
});

schedeRouter.post('/schede/:id', write, requireCsrf, async (req, res) => {
  const scheda = await getScheda(String(req.params.id));
  if (!scheda) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parseScheda(body);
  if (!parsed.ok) {
    renderForm(res, 422, {
      scheda,
      values: formValuesFromBody(body),
      errors: parsed.errors,
      base,
      conflict: false,
    });
    return;
  }
  const outcome = await updateScheda(scheda.id, base, parsed.data, principalOf(req).user.id);
  if (outcome === 'missing') return notFound(req, res);
  if (outcome === 'conflict') {
    // Въведеното остава на екрана; човекът решава след като види новата версия.
    renderForm(res, 409, {
      scheda,
      values: formValuesFromBody(body),
      errors: {},
      base,
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
  const pdf = await renderSchedaPdf(scheda, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    generatedBy: principalOf(req).user.name,
    fontDir: config().PDF_FONT_DIR,
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
  const scheda = await getScheda(String(req.params.id));
  if (!scheda) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'trash' });
});

schedeRouter.post('/schede/:id/elimina', remove, requireCsrf, async (req, res) => {
  const ok = await trashScheda(String(req.params.id), principalOf(req).user.id);
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaTrashed');
  res.redirect(303, '/schede');
});

schedeRouter.get('/cestino', trash, async (req, res) => {
  const query = queryOf(req);
  const page = await listSchede({ query, page: req.query.p, trash: true });
  res.render('schede/trash', { page, query, highlight });
});

schedeRouter.post('/cestino/:id/ripristina', trash, requireCsrf, async (req, res) => {
  const ok = await restoreScheda(String(req.params.id), principalOf(req).user.id);
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaRestored');
  res.redirect(303, `/schede/${encodeURIComponent(String(req.params.id))}`);
});

schedeRouter.get('/cestino/:id/elimina', trash, async (req, res) => {
  const scheda = await getScheda(String(req.params.id), true);
  if (!scheda || !scheda.deletedAt) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'purge' });
});

schedeRouter.post('/cestino/:id/elimina', trash, requireCsrf, async (req, res) => {
  const ok = await purgeScheda(String(req.params.id), principalOf(req).user.id);
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaPurged');
  res.redirect(303, '/cestino');
});
