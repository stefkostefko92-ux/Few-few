import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { datiSalvati } from '../aziende/dati.js';
import { testataDi } from '../aziende/intestazione.js';
import { activeAziende } from '../aziende/service.js';
import {
  formValuesDalBody,
  formValuesFromCartello,
  MAX_TESTO,
  parseCartello,
} from '../cartelli/form.js';
import { modelloDi } from '../cartelli/modelli.js';
import { renderCartello, type DatiCartello } from '../cartelli/pdf.js';
import {
  createCartello,
  deleteCartello,
  getCartello,
  listCartelli,
  updateCartello,
  type CartelloFull,
} from '../cartelli/service.js';
import { misuraVista, vistaCartello } from '../cartelli/vista.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter, vistaLimiter } from '../http/limits.js';
import type { FieldErrors, FormValues } from '../schede/field-parsers.js';
import { businessDay, dayFromDate } from '../time.js';
import { scope } from './interventi.js';
import { aziendaFilterOf, aziendeOf, notFound } from './schede-shared.js';

/**
 * Табелите „Avviso di fermo impianto“ (раздел „Assistenza elevatori“): списък, нова, страница, редакция,
 * изтриване и PDF. Правата са тези на листовете за интервенция — четат ги всички във фирмата, пише
 * техникът (OPERATORE нагоре). Обхватът е по фирма; чужда табела — 404. Облеклото е шаблонът, избран в
 * настройките на фирмата, а главата — логото и данните ѝ към момента на PDF-а.
 */
export const cartelliRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');

const loadCartello = (req: Request) =>
  getCartello(scope(req, 'interventi:read'), String(req.params.id));

const puoScrivere = (req: Request, row: { aziendaId: string }) =>
  canIn(principalOf(req).user, 'interventi:write', row.aziendaId);

/** Фирмите, в които човекът може да създаде табела (като при листа за интервенция). */
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

interface FormView {
  cartello: CartelloFull | null;
  values: FormValues;
  errors: FieldErrors;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
}

function renderForm(res: Response, status: number, view: FormView): void {
  res.status(status).render('cartelli/form', {
    titleKey: view.cartello ? 'cartelli.modifica' : 'cartelli.new',
    maxTesto: MAX_TESTO,
    ...view,
  });
}

cartelliRouter.get('/cartelli', read, async (req, res) => {
  const readScope = scope(req, 'interventi:read');
  const azienda = aziendaFilterOf(req, readScope);
  const [page, aziende] = await Promise.all([
    listCartelli({ scope: readScope, azienda, page: req.query.p }),
    aziendeOf(req, readScope),
  ]);
  res.render('cartelli/list', {
    titleKey: 'cartelli.list',
    page,
    aziende,
    aziendaFilter: azienda ?? '',
  });
});

cartelliRouter.get('/cartelli/nuovo', write, async (req, res) => {
  const { choices, only } = await aziendePerNuovo(req);
  const preset = typeof req.query.azienda === 'string' ? req.query.azienda : '';
  renderForm(res, 200, {
    cartello: null,
    values: { data: businessDay() },
    errors: {},
    base: '',
    aziende: choices,
    azienda:
      only?.id ??
      (choices.some((a) => a.id === preset) ? preset : choices.length === 1 ? choices[0]!.id : ''),
  });
});

cartelliRouter.post('/cartelli', write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const parsed = parseCartello(body);
  const { choices, only } = await aziendePerNuovo(req);
  const azienda = only ?? choices.find((a) => a.id === body.azienda) ?? null;
  if (!parsed.ok || !azienda) {
    renderForm(res, 422, {
      cartello: null,
      values: formValuesDalBody(body),
      errors: { ...(azienda ? {} : { azienda: 'azienda' }), ...(parsed.ok ? {} : parsed.errors) },
      base: '',
      aziende: choices,
      azienda: only?.id ?? (typeof body.azienda === 'string' ? body.azienda : ''),
    });
    return;
  }
  const created = await createCartello(parsed.data, principalOf(req).user.id, azienda.id);
  setFlash(res, 'ok', 'cartelli.flash.creato');
  res.redirect(303, `/cartelli/${created.id}`);
});

cartelliRouter.get('/cartelli/:id', read, async (req, res) => {
  const row = await loadCartello(req);
  if (!row) return notFound(req, res);
  const modello = modelloDi(row.azienda.cartelloModello);
  res.render('cartelli/show', {
    titleKey: 'cartelli.titolo',
    cartello: row,
    modello: { id: modello.id, titolo: modello.titolo, ...misuraVista(modello) },
    // Без лого или без данни главата на табелата е непълна — страницата казва какво липсва и кой го слага.
    manca: {
      logo: !row.azienda.logoType,
      dati: datiSalvati(row.azienda.datiSocietari) === null,
    },
    modifica: puoScrivere(req, row),
    impostazioni: canIn(principalOf(req).user, 'aziende:settings', row.aziendaId),
  });
});

cartelliRouter.get('/cartelli/:id/modifica', write, async (req, res) => {
  const row = await loadCartello(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  renderForm(res, 200, {
    cartello: row,
    values: formValuesFromCartello(row),
    errors: {},
    base: row.updatedAt.toISOString(),
    aziende: [],
    azienda: row.aziendaId,
  });
});

cartelliRouter.post('/cartelli/:id', write, requireCsrf, async (req, res) => {
  const row = await loadCartello(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const base = typeof body.base === 'string' ? body.base : '';
  const parsed = parseCartello(body);
  const again = (status: number, errors: FieldErrors, conflict = false) =>
    renderForm(res, status, {
      cartello: row,
      values: formValuesDalBody(body),
      errors,
      base: conflict ? row.updatedAt.toISOString() : base,
      aziende: [],
      azienda: row.aziendaId,
      conflict,
    });
  if (!parsed.ok) return again(422, parsed.errors);
  const esito = await updateCartello(
    scope(req, 'interventi:write'),
    row.id,
    base,
    parsed.data,
    principalOf(req).user.id,
  );
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'conflict') return again(409, {}, true);
  setFlash(res, 'ok', 'cartelli.flash.salvato');
  res.redirect(303, `/cartelli/${row.id}`);
});

cartelliRouter.post('/cartelli/:id/elimina', write, requireCsrf, async (req, res) => {
  const row = await loadCartello(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  if (!(await deleteCartello(scope(req, 'interventi:write'), row.id, principalOf(req).user.id)))
    return notFound(req, res);
  setFlash(res, 'ok', 'cartelli.flash.eliminato');
  res.redirect(303, '/cartelli');
});

const datiDi = (res: Response, row: CartelloFull): DatiCartello => ({
  data: res.locals.fmt.day(row.data),
  indirizzo: row.indirizzo ?? '',
  citta: row.citta ?? '',
  ubicazione: row.ubicazione ?? '',
  testo: row.testo,
});

/** Картинката на табелата — самият PDF с логото и данните горе (cartelli/vista.ts). */
cartelliRouter.get('/cartelli/:id/anteprima.webp', read, vistaLimiter, async (req, res) => {
  const row = await loadCartello(req);
  if (!row) return notFound(req, res);
  const webp = await vistaCartello(
    modelloDi(row.azienda.cartelloModello),
    datiDi(res, row),
    await testataDi(row.azienda),
    config().PDF_FONT_DIR,
  );
  res
    .status(200)
    .set({ 'Content-Type': 'image/webp', 'Content-Length': String(webp.length) })
    .end(webp);
});

cartelliRouter.get('/cartelli/:id/pdf', read, pdfLimiter, async (req, res) => {
  const row = await loadCartello(req);
  if (!row) return notFound(req, res);
  const pdf = await renderCartello(
    modelloDi(row.azienda.cartelloModello),
    datiDi(res, row),
    await testataDi(row.azienda),
    config().PDF_FONT_DIR,
  );
  const filename = `cartello-fermo-impianto-${dayFromDate(row.data)}.pdf`;
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    })
    .end(pdf);
});
