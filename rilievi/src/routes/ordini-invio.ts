import type { StatoOrdine } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import { mailLimiter } from '../http/limits.js';
import { fornitoriDi } from '../ordini/fornitori.js';
import {
  aggiornaOrdine,
  destinatarioSchema,
  elencoOrdini,
  inviaOrdine,
  messaggioSchema,
  notaSchema,
} from '../ordini/invio.js';
import { moduliDellaScheda, slotDiPath } from '../ordini/modulo-scheda.js';
import { schedaTitle } from '../schede/format.js';
import type { SchedaFull } from '../schede/service.js';
import { loadScheda, notFound, scope } from './schede-shared.js';

/**
 * Поръчките към доставчиците от портала (точка C2; ordini/invio.ts): формата „Invia al fornitore“ за модул на
 * картата (доставчик от адресника или написан), пращането, състоянието (потвърдена, отменена) и
 * `/ordini` — всички поръчки в обхвата, по състояние. Пращат и сменят състоянието, които пишат картата.
 */
export const ordiniInvioRouter: Router = Router();
const write = requireCapability('schede:write');

const STATI: readonly StatoOrdine[] = ['INVIATO', 'CONFERMATO', 'ANNULLATO'];

interface ValoriInvio {
  modulo: string;
  fornitore: string;
  nome: string;
  email: string;
  messaggio: string;
}

async function renderInvio(
  req: Request,
  res: Response,
  status: number,
  scheda: SchedaFull,
  valori: ValoriInvio,
  errore: boolean,
): Promise<void> {
  res.status(status).render('schede/invio-ordine', {
    scheda,
    ident: schedaTitle(scheda, res.locals.t),
    moduli: moduliDellaScheda(scheda),
    fornitori: await fornitoriDi(scheda.aziendaId),
    valori,
    errore,
  });
}

/** Картата, ако човекът пише в нейната фирма и не е в кошчето. */
async function schedaScrivibile(req: Request): Promise<SchedaFull | null> {
  const scheda = await loadScheda(req);
  if (!scheda || scheda.deletedAt) return null;
  return canIn(principalOf(req).user, 'schede:write', scheda.aziendaId) ? scheda : null;
}

ordiniInvioRouter.get('/schede/:id/ordini/invia', write, async (req, res) => {
  const scheda = await schedaScrivibile(req);
  if (!scheda) return notFound(req, res);
  const modulo = typeof req.query.modulo === 'string' ? req.query.modulo : '';
  await renderInvio(
    req,
    res,
    200,
    scheda,
    { modulo, fornitore: '', nome: '', email: '', messaggio: '' },
    false,
  );
});

ordiniInvioRouter.post(
  '/schede/:id/ordini/invia',
  write,
  mailLimiter,
  requireCsrf,
  async (req, res) => {
    const scheda = await schedaScrivibile(req);
    if (!scheda) return notFound(req, res);
    const body = req.body as Record<string, unknown>;
    const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
    const valori: ValoriInvio = {
      modulo: s('modulo'),
      fornitore: s('fornitore'),
      nome: s('nome').slice(0, 120),
      email: s('email').slice(0, 254),
      messaggio: s('messaggio').slice(0, 2000),
    };
    const slot = slotDiPath(valori.modulo);
    const rubrica = valori.fornitore
      ? (await fornitoriDi(scheda.aziendaId)).find((f) => f.id === valori.fornitore)
      : undefined;
    const destinatario = destinatarioSchema.safeParse(
      rubrica
        ? { nome: rubrica.nome, email: rubrica.email }
        : { nome: valori.nome, email: valori.email },
    );
    const messaggio = messaggioSchema.safeParse(valori.messaggio);
    if (!slot || !destinatario.success || !messaggio.success || (valori.fornitore && !rubrica)) {
      return renderInvio(req, res, 422, scheda, valori, true);
    }
    const esito = await inviaOrdine({
      scheda,
      slot,
      destinatario: destinatario.data,
      messaggio: messaggio.data,
      actor: principalOf(req).user,
    });
    setFlash(res, esito === 'sent' ? 'ok' : 'error', `flusso.invio.flash.${esito}`);
    res.redirect(303, `/schede/${encodeURIComponent(scheda.id)}#ordini`);
  },
);

ordiniInvioRouter.post('/ordini/:id/stato', write, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const stato = body.stato === 'CONFERMATO' || body.stato === 'ANNULLATO' ? body.stato : null;
  const nota = notaSchema.safeParse(typeof body.nota === 'string' ? body.nota : '');
  const torna =
    typeof body.scheda === 'string'
      ? `/schede/${encodeURIComponent(body.scheda)}#ordini`
      : '/ordini';
  if (!stato || !nota.success) {
    setFlash(res, 'error', 'flusso.ordini.flash.no');
    return res.redirect(303, torna);
  }
  const fatto = await aggiornaOrdine(
    scope(req, 'schede:write'),
    String(req.params.id),
    stato,
    nota.data,
    principalOf(req).user.id,
  );
  setFlash(
    res,
    fatto ? 'ok' : 'error',
    fatto ? 'flusso.ordini.flash.ok' : 'flusso.ordini.flash.no',
  );
  res.redirect(303, torna);
});

ordiniInvioRouter.get('/ordini', requireCapability('schede:read'), async (req, res) => {
  const stato = STATI.find((s) => s === req.query.stato) ?? null;
  res.render('schede/ordini', {
    righe: await elencoOrdini(scope(req, 'schede:read'), stato),
    stato,
    stati: STATI,
  });
});
