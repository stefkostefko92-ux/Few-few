import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { aziendeImpostabili, setOrdineSezioni } from '../aziende/sezioni.js';
import { setFlash } from '../http/flash.js';
import type { SectionKey } from '../schede/fields.js';
import {
  FISSE,
  ordineEffettivo,
  parseMossa,
  parseOrdine,
  sposta,
  type Verso,
} from '../schede/ordine.js';

/**
 * Настройките на фирмата — редът на разделите на картата. Администраторът на фирмата (и MASTER) мести
 * разделите нагоре и надолу без JavaScript: всеки бутон праща целия ред, страницата се връща с новия ред
 * незаписан, „Salva“ го записва (един запис в одита). Фирма извън обхвата — 404.
 */
export const impostazioniRouter: Router = Router();
const settings = requireCapability('aziende:settings');

type Azienda = Awaited<ReturnType<typeof aziendeImpostabili>>[number];

function render(
  res: Response,
  status: number,
  view: {
    aziende: Azienda[];
    azienda: Azienda;
    ordine: SectionKey[];
    modificato: boolean;
    focus?: { key: SectionKey; verso: Verso } | null;
    error?: string | null;
  },
): void {
  res
    .status(status)
    .render('impostazioni/index', { focus: null, error: null, fisse: FISSE, ...view });
}

function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}

impostazioniRouter.get('/impostazioni', settings, async (req, res) => {
  const aziende = await aziendeImpostabili(principalOf(req).user);
  const wanted = typeof req.query.azienda === 'string' ? req.query.azienda : null;
  const azienda = wanted ? aziende.find((a) => a.id === wanted) : aziende[0];
  if (!azienda) return notFound(req, res);
  render(res, 200, {
    aziende,
    azienda,
    ordine: ordineEffettivo(azienda.ordineSezioni),
    modificato: false,
  });
});

impostazioniRouter.post('/impostazioni/sezioni', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  if (!azienda) return notFound(req, res);
  const back = `/impostazioni?azienda=${encodeURIComponent(azienda.id)}`;
  if (body.ripristina === '1') {
    await setOrdineSezioni(user, azienda.id, null);
    setFlash(res, 'ok', 'flash.sezioniReset');
    return res.redirect(303, back);
  }
  const ordine = parseOrdine(body.ordine);
  if (!ordine) {
    return render(res, 400, {
      aziende,
      azienda,
      ordine: ordineEffettivo(azienda.ordineSezioni),
      modificato: false,
      error: 'impostazioni.error',
    });
  }
  const mossa = parseMossa(body.sposta);
  if (mossa) {
    return render(res, 200, {
      aziende,
      azienda,
      ordine: sposta(ordine, mossa.key, mossa.verso),
      modificato: true,
      focus: mossa,
    });
  }
  if (body.salva !== '1') {
    return render(res, 400, {
      aziende,
      azienda,
      ordine: ordineEffettivo(azienda.ordineSezioni),
      modificato: false,
      error: 'impostazioni.error',
    });
  }
  await setOrdineSezioni(user, azienda.id, ordine);
  setFlash(res, 'ok', 'flash.sezioniSaved');
  res.redirect(303, back);
});
