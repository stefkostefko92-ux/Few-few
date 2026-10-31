import { Router } from 'express';
import { allegatiDi } from '../allegati/service.js';
import { fotoPerPdf, fotoPerStampa, sezioniFoto } from '../allegati/stampa.js';
import { principalOf, requireCapability } from '../auth/guards.js';
import { aziendaLogo } from '../aziende/service.js';
import { config } from '../config.js';
import { pdfLimiter } from '../http/limits.js';
import { riepilogoModuli } from '../ordini/riepilogo.js';
import { displaySections, schedaTitle } from '../schede/format.js';
import { sezioniStampate } from '../schede/ordine.js';
import { pdfFileName, renderSchedaPdf } from '../schede/pdf.js';
import { fogliDi } from '../schizzi/service.js';
import { loadScheda, notFound } from './schede-shared.js';

/**
 * Листът на картата: страницата за печат и PDF-ът — едно и също съдържание (разделите, които картата
 * печата, модулите, скиците, снимките). Виждат ги всички, които виждат картата; изтритата — само кошчето.
 */
export const schedeStampaRouter: Router = Router();

const read = requireCapability('schede:read');

schedeStampaRouter.get('/schede/:id/stampa', read, async (req, res) => {
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
    // „Impianto“ е в заглавната лента и в табелата — не се печата втори път; изключените в картата —
    // никак.
    printed: sezioniStampate(sections, scheda.sezioniEscluse),
    // Попълненото в модулите — само в тези, които картата иска (`moduliStampati`).
    riepilogo: riepilogoModuli(scheda),
    // Листовете на скицника — при отметката на картата, след модулите и преди снимките.
    schizzi: scheda.schizziStampati ? await fogliDi(scheda.id) : [],
    // Снимките накрая — отметнатите в иконките в края на формата, по разделите.
    foto: fotoPerStampa(
      sezioniFoto(scheda.azienda.ordineSezioni, res.locals.t),
      await allegatiDi(scheda.id),
    ),
    autoPrint: req.query.auto === '1',
  });
});

schedeStampaRouter.get('/schede/:id/pdf', read, pdfLimiter, async (req, res) => {
  const scheda = await loadScheda(req);
  if (!scheda) return notFound(req, res);
  const logo = scheda.azienda.logoType ? await aziendaLogo(scheda.aziendaId) : null;
  const foto = await fotoPerPdf(
    scheda,
    sezioniFoto(scheda.azienda.ordineSezioni, res.locals.t),
    await allegatiDi(scheda.id),
  );
  const pdf = await renderSchedaPdf(scheda, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    generatedBy: principalOf(req).user.name,
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
    schizzi: scheda.schizziStampati ? await fogliDi(scheda.id) : [],
    foto,
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
