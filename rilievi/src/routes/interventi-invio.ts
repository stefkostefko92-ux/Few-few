import { Router, type Response } from 'express';
import { z } from 'zod';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { aziendaLogo } from '../aziende/service.js';
import { config } from '../config.js';
import { setFlash } from '../http/flash.js';
import { mailLimiter, pdfLimiter } from '../http/limits.js';
import { renderInterventoPdf } from '../interventi/pdf.js';
import { numeroModulo, registraInvio, type InterventoFull } from '../interventi/service.js';
import { sendMail } from '../mail/mailer.js';
import { interventoMail } from '../mail/templates.js';
import { dayFromDate } from '../time.js';
import { loadIntervento } from './interventi.js';
import { notFound } from './schede-shared.js';

/**
 * Потвърденият лист за интервенция навън: PDF-ът (изтегляне или в браузъра) и писмото с него на адрес,
 * който човекът пише. Черновата няма нито едното, нито другото.
 */
export const interventiInvioRouter: Router = Router();

const read = requireCapability('interventi:read');
const write = requireCapability('interventi:write');

/** Потвърденият лист като PDF; черновата няма PDF (подписите и съдържанието още се менят). */
async function pdfDi(
  res: Response,
  row: InterventoFull,
): Promise<{ pdf: Buffer; filename: string }> {
  const logo = row.azienda.logoType ? await aziendaLogo(row.aziendaId) : null;
  const pdf = await renderInterventoPdf(row, {
    t: res.locals.t,
    fmt: res.locals.fmt,
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
  });
  const filename = `modulo-intervento-${numeroModulo(row.numero)}-${dayFromDate(row.data)}.pdf`;
  return { pdf, filename };
}

interventiInvioRouter.get('/interventi/:id/pdf', read, pdfLimiter, async (req, res) => {
  const row = await loadIntervento(req);
  if (!row || !row.confermatoAt) return notFound(req, res);
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

interventiInvioRouter.post(
  '/interventi/:id/invia',
  write,
  mailLimiter,
  requireCsrf,
  async (req, res) => {
    const row = await loadIntervento(req);
    if (
      !row ||
      !row.confermatoAt ||
      !canIn(principalOf(req).user, 'interventi:write', row.aziendaId)
    )
      return notFound(req, res);
    const to = emailSchema.safeParse((req.body as Record<string, unknown>).email);
    if (!to.success) {
      setFlash(res, 'error', 'interventi.flash.emailNonValida');
      res.redirect(303, `/interventi/${row.id}`);
      return;
    }
    const { pdf, filename } = await pdfDi(res, row);
    const result = await sendMail(
      interventoMail({
        to: to.data,
        numero: numeroModulo(row.numero),
        data: res.locals.fmt.day(row.data),
        azienda: row.azienda.name,
        pdf,
        filename,
      }),
    );
    if (result === 'sent') {
      await registraInvio(principalOf(req).user.id, row);
      setFlash(res, 'ok', 'interventi.flash.inviato', { email: to.data });
    } else {
      setFlash(
        res,
        'error',
        result === 'disabled' ? 'interventi.flash.mailDisattivata' : 'interventi.flash.nonInviato',
      );
    }
    res.redirect(303, `/interventi/${row.id}`);
  },
);
