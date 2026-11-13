import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  principalOf,
  requireCapability,
  requireCapabilityPerTogliere,
  requireCsrf,
} from '../auth/guards.js';
import { intestazioneDi } from '../aziende/dati.js';
import { aziendaLogo } from '../aziende/service.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { mailLimiter, pdfLimiter } from '../http/limits.js';
import { sendMail } from '../mail/mailer.js';
import { preventivoMail } from '../mail/templates.js';
import { nomeFilePreventivo, pdfDelPreventivo } from '../preventivi/documento.js';
import type { PreventivoFull } from '../preventivi/elenco.js';
import { cambiaStato, eliminaPreventivo, isStato, registraInvio } from '../preventivi/service.js';
import { loadPreventivo, puoScrivere, puoTogliere } from './preventivi-vista.js';
import { notFound } from './schede-shared.js';

/**
 * Офертата навън: PDF/A-ът (всеки, който я вижда), писмото до клиента с PDF-а (пише офертите; отговорът
 * — до пратилия; адресът не се пази, одитът — без него; черновата става „Inviato“), смяната на състоянието
 * (само по позволен преход) и изтриването на чернова.
 */
export const preventiviAzioniRouter: Router = Router();

const read = requireCapability('preventivi:read');
const write = requireCapability('preventivi:write');

async function pdfDi(
  res: Response,
  row: PreventivoFull,
): Promise<{ pdf: Buffer; filename: string }> {
  const logo = row.azienda.logoType ? await aziendaLogo(row.aziendaId) : null;
  const pdf = await pdfDelPreventivo(row, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
  });
  return { pdf, filename: nomeFilePreventivo(row.numero) };
}

preventiviAzioniRouter.get('/preventivi/:id/pdf', read, pdfLimiter, async (req, res) => {
  const row = await loadPreventivo(req);
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

const invioSchema = z.object({
  email: z.string().trim().max(254).email(),
  // Първо новите редове (браузърът праща CRLF, а в `maxlength` го брои за един знак), после дължината.
  messaggio: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, '\n').trim())
    .pipe(z.string().max(2000))
    .optional(),
});

preventiviAzioniRouter.post(
  '/preventivi/:id/invia',
  write,
  mailLimiter,
  requireCsrf,
  async (req, res) => {
    const row = await loadPreventivo(req);
    if (!row || !puoScrivere(req, row)) return notFound(req, res);
    const parsed = invioSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(res, 'error', 'preventivi.flash.emailNonValida');
      res.redirect(303, `/preventivi/${row.id}#invia`);
      return;
    }
    const user = principalOf(req).user;
    const { pdf, filename } = await pdfDi(res, row);
    const result = await sendMail(
      preventivoMail({
        to: parsed.data.email,
        replyTo: user.email,
        numero: row.numero,
        azienda: intestazioneDi(row.azienda.name, row.azienda.datiSocietari).nome,
        mittente: user.name,
        oggetto: row.oggetto,
        messaggio: parsed.data.messaggio || null,
        pdf,
        filename,
      }),
    );
    if (result === 'sent') {
      await registraInvio(user.id, row.aziendaId, row.id);
      setFlash(res, 'ok', 'preventivi.flash.inviato', { email: parsed.data.email });
    } else {
      setFlash(
        res,
        'error',
        result === 'disabled' ? 'preventivi.flash.mailDisattivata' : 'preventivi.flash.nonInviato',
      );
    }
    res.redirect(303, `/preventivi/${row.id}`);
  },
);

preventiviAzioniRouter.post('/preventivi/:id/stato', write, requireCsrf, async (req, res) => {
  const row = await loadPreventivo(req);
  if (!row || !puoScrivere(req, row)) return notFound(req, res);
  const body = req.body as Record<string, unknown>;
  const a = body.stato;
  // Само върху видяната версия (одитът от 12 ноември 2026): колега е сменил офертата междувременно — не се
  // отбелязва „Accettato“ на нещо невидяно.
  const ok =
    isStato(a) &&
    body.base === row.updatedAt.toISOString() &&
    (await cambiaStato({
      id: row.id,
      aziendaId: row.aziendaId,
      da: row.stato,
      a,
      actorId: principalOf(req).user.id,
    }));
  setFlash(res, ok ? 'ok' : 'error', ok ? 'preventivi.flash.stato' : 'preventivi.flash.statoNo');
  res.redirect(303, `/preventivi/${row.id}`);
});

const togli = requireCapabilityPerTogliere('preventivi:write');

preventiviAzioniRouter.post('/preventivi/:id/elimina', togli, requireCsrf, async (req, res) => {
  const row = await loadPreventivo(req);
  if (!row || !puoTogliere(req, row)) return notFound(req, res);
  if (!(await eliminaPreventivo(principalOf(req).user.id, row.aziendaId, row.id))) {
    setFlash(res, 'error', 'preventivi.flash.nonEliminabile');
    res.redirect(303, `/preventivi/${row.id}`);
    return;
  }
  setFlash(res, 'ok', 'preventivi.flash.eliminato', { n: row.numero });
  res.redirect(303, '/preventivi');
});
