import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { mailLimiter } from '../http/limits.js';
import { sendMail } from '../mail/mailer.js';
import { schedaMail } from '../mail/templates-schede.js';
import { schedaTitle } from '../schede/format.js';
import { invioSchema, MAX_PDF_EMAIL, registraInvioScheda, troppoGrande } from '../schede/invio.js';
import { loadScheda, notFound } from './schede-shared.js';
import { pdfDellaScheda } from './schede-stampa.js';

/**
 * „Invia per email“ на страницата на записаната карта (schede/invio.ts): PDF-ът ѝ — прикачен, до адрес, написан
 * в момента; отговорът — до пратилия. Праща, който пише карти във фирмата ѝ (карта в кошчето — не); таванът на
 * писмата е общият (`mailLimiter`, 20/ч. на акаунт). Записва се само тръгналото писмо, без адреса.
 */
export const schedeInvioRouter: Router = Router();

const write = requireCapability('schede:write');

schedeInvioRouter.post('/schede/:id/invia', write, mailLimiter, requireCsrf, async (req, res) => {
  const scheda = await loadScheda(req);
  const user = principalOf(req).user;
  if (!scheda || scheda.deletedAt || !canIn(user, 'schede:write', scheda.aziendaId))
    return notFound(req, res);
  const parsed = invioSchema.safeParse(req.body);
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path[0];
    setFlash(
      res,
      'error',
      campo === 'messaggio' ? 'scheda.flash.messaggioLungo' : 'scheda.flash.emailNonValida',
    );
    res.redirect(303, `/schede/${scheda.id}#invia`);
    return;
  }
  const { pdf, name } = await pdfDellaScheda(req, res, scheda);
  if (troppoGrande(pdf.length)) {
    setFlash(res, 'error', 'scheda.flash.pdfTroppoGrande', {
      mb: Math.ceil(pdf.length / (1024 * 1024)),
      max: MAX_PDF_EMAIL / (1024 * 1024),
    });
    res.redirect(303, `/schede/${scheda.id}#invia`);
    return;
  }
  const messaggio = parsed.data.messaggio || null;
  const result = await sendMail(
    schedaMail({
      to: parsed.data.email,
      replyTo: user.email,
      impianto: schedaTitle(scheda, res.locals.t),
      indirizzo: scheda.indirizzo,
      azienda: scheda.azienda.name,
      mittente: user.name,
      messaggio,
      pdf,
      filename: name,
    }),
  );
  if (result === 'sent') {
    await registraInvioScheda(user.id, scheda, { messaggio: messaggio !== null });
    setFlash(res, 'ok', 'scheda.flash.inviata', { email: parsed.data.email });
  } else {
    setFlash(
      res,
      'error',
      result === 'disabled' ? 'scheda.flash.mailDisattivata' : 'scheda.flash.nonInviata',
    );
  }
  res.redirect(303, `/schede/${scheda.id}`);
});
