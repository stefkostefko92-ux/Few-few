import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  principalOf,
  requireCapability,
  requireCapabilityPerTogliere,
  requireCsrf,
} from '../auth/guards.js';
import { scopePerTogliere } from '../auth/scope.js';
import { aziendaLogo } from '../aziende/service.js';
import { improntaFinale, nomeFileBuono, pdfDelBuono } from '../buoni/documento.js';
import type { ErroriBuono, FirmeRichieste } from '../buoni/form.js';
import { postoFinale, tipoPosto } from '../buoni/posti.js';
import { chiuso, type BuonoFull } from '../buoni/elenco.js';
import { eliminaBuono, firmeFinali, registraInvioBuono } from '../buoni/service.js';
import { FIRME_FINALI } from '../buoni/voci.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { mailLimiter, pdfLimiter } from '../http/limits.js';
import { firmaDalForm, type Firma } from '../interventi/firma.js';
import { sendMail } from '../mail/mailer.js';
import { buonoMail } from '../mail/templates.js';
import { loadBuono, puoScrivere, puoTogliere, vistaFoglio } from './buoni.js';
import { informativaDi } from './firma-copia.js';
import { scope } from './interventi.js';
import { notFound } from './schede-shared.js';

/**
 * „Buono di lavoro“ навън и подписите долу: подписите на пазача, на главния техник, на геометъра и на
 * началника на работилницата — на страницата на листа (виждат какво подписват; всеки по избор), PDF/A-ът,
 * писмото с него и изтриването (само на лист без подписи).
 */
export const buoniFirmeRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');

/** Подписите долу от формата на страницата: новите и махнатият (бутонът „Togli la firma“). */
function firmeDalBody(
  body: Record<string, unknown>,
): { ok: true; firme: FirmeRichieste } | { ok: false; errors: ErroriBuono } {
  const nuove = new Map<string, Firma>();
  const errors: ErroriBuono = {};
  for (const key of FIRME_FINALI) {
    const parsed = firmaDalForm(body[`fin-${key}-firma`]);
    if (!parsed.ok) errors[`fin-${key}-firma`] = 'invalid';
    else if (parsed.firma) nuove.set(postoFinale(key), parsed.firma);
  }
  const togli = new Set(
    (Array.isArray(body.togli) ? body.togli : [body.togli]).filter(
      (v): v is string => tipoPosto(v) === 'finale',
    ),
  );
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, firme: { nuove, togli } };
}

async function renderShow(
  req: Request,
  res: Response,
  row: BuonoFull,
  view: { values: Record<string, string>; errors: ErroriBuono },
) {
  res.status(422).render('buoni/show', {
    titleKey: 'buoni.titolo',
    ...vistaFoglio(row),
    modifica: puoScrivere(req, row),
    elimina: puoTogliere(req, row),
    informativa: await informativaDi(row.aziendaId),
    chiuso: chiuso(row),
    impronta: improntaFinale(row),
    base: row.updatedAt.toISOString(),
    scripts: ['firma'],
    ...view,
  });
}

buoniFirmeRouter.post('/buoni/:id/firme', write, requireCsrf, async (req, res) => {
  const row = await loadBuono(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const values = Object.fromEntries(
    FIRME_FINALI.map((k) => [
      `fin-${k}-firma`,
      typeof body[`fin-${k}-firma`] === 'string'
        ? String(body[`fin-${k}-firma`]).slice(0, 70_000)
        : '',
    ]),
  );
  const parsed = firmeDalBody(body);
  if (!parsed.ok) return renderShow(req, res, row, { values, errors: parsed.errors });
  const esito = await firmeFinali({
    scope: scope(req, 'interventi:write'),
    id: row.id,
    base: typeof body.base === 'string' ? body.base : '',
    firme: parsed.firme,
    actorId: principalOf(req).user.id,
  });
  if (esito.esito === 'missing') return notFound(req, res);
  if (esito.esito === 'conflict') {
    // Листът се е сменил, докато е бил на екрана: прочита се и се подписва наново.
    setFlash(res, 'error', 'buoni.flash.conflittoFirme');
    res.redirect(303, `/buoni/${row.id}#firme`);
    return;
  }
  if (esito.esito === 'firme') {
    const errors: ErroriBuono = {};
    for (const [posto, codice] of Object.entries(esito.errori))
      errors[`fin-${posto.slice(2)}-firma`] = codice;
    return renderShow(req, res, row, { values, errors });
  }
  setFlash(res, 'ok', 'buoni.flash.firme');
  res.redirect(303, `/buoni/${row.id}#firme`);
});

/** PDF-ът на листа такъв, какъвто е сега — подписите с проверката им. */
async function pdfDi(res: Response, row: BuonoFull): Promise<{ pdf: Buffer; filename: string }> {
  const logo = row.azienda.logoType ? await aziendaLogo(row.aziendaId) : null;
  const pdf = await pdfDelBuono(row, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
  });
  return { pdf, filename: nomeFileBuono(row) };
}

buoniFirmeRouter.get('/buoni/:id/pdf', read, pdfLimiter, async (req, res) => {
  const row = await loadBuono(req);
  if (!row) return notFound(req, res);
  const { pdf, filename } = await pdfDi(res, row);
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

const emailSchema = z.string().trim().max(254).email();

buoniFirmeRouter.post('/buoni/:id/invia', write, mailLimiter, requireCsrf, async (req, res) => {
  const row = await loadBuono(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  const to = emailSchema.safeParse((req.body as Record<string, unknown>).email);
  if (!to.success) {
    setFlash(res, 'error', 'buoni.flash.emailNonValida');
    res.redirect(303, `/buoni/${row.id}`);
    return;
  }
  const { pdf, filename } = await pdfDi(res, row);
  const result = await sendMail(
    buonoMail({ to: to.data, numero: row.numero ?? '', azienda: row.azienda.name, pdf, filename }),
  );
  if (result === 'sent') {
    await registraInvioBuono(principalOf(req).user.id, row);
    setFlash(res, 'ok', 'buoni.flash.inviato', { email: to.data });
  } else {
    setFlash(
      res,
      'error',
      result === 'disabled' ? 'buoni.flash.mailDisattivata' : 'buoni.flash.nonInviato',
    );
  }
  res.redirect(303, `/buoni/${row.id}`);
});

const togli = requireCapabilityPerTogliere('interventi:write');

buoniFirmeRouter.post('/buoni/:id/elimina', togli, requireCsrf, async (req, res) => {
  const row = await loadBuono(req);
  if (!row || !puoTogliere(req, row)) return notFound(req, res);
  const esito = await eliminaBuono(
    scopePerTogliere(principalOf(req).user, 'interventi:write'),
    row.id,
    principalOf(req).user.id,
  );
  if (esito === 'missing') return notFound(req, res);
  if (esito === 'firmato') {
    setFlash(res, 'error', 'buoni.flash.firmato');
    res.redirect(303, `/buoni/${row.id}`);
    return;
  }
  setFlash(res, 'ok', 'buoni.flash.eliminato');
  res.redirect(303, '/buoni');
});
