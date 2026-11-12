import type { AmbienteRevolut } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { leggiConfig, registraIlWebhook, salvaConfig } from '../pagamenti/config.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { attivaPiano, creaPiano, leggiPiano, tuttiIPiani } from '../pagamenti/piani.js';
import { riconcilia } from '../pagamenti/riconcilia.js';
import { ErroreRevolut } from '../pagamenti/revolut.js';

/**
 * „Pagamenti“ в конзолата на MASTER (#31): Revolut Business вкл./изкл., sandbox/продукция, ключът (само се пише),
 * webhook-ът с един бутон, плановете (добавяне, изключване — без триене) и последните плащания със сверка на ръка.
 * Само `aziende:manage`.
 */
export const masterPagamentiRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/pagamenti';

async function vista(
  res: Response,
  status: number,
  extra: { errore?: string | null; erroreConfig?: string | null } = {},
): Promise<void> {
  const [cfg, piani, pagamenti] = await Promise.all([
    leggiConfig(),
    tuttiIPiani(),
    prisma.pagamento.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        aziendaNome: true,
        livello: true,
        mesi: true,
        totaleCent: true,
        stato: true,
      },
    }),
  ]);
  res.status(status).render('master/pagamenti', {
    cfg: {
      attivo: cfg.attivo,
      ambiente: cfg.ambiente,
      haChiave: cfg.chiave !== null,
      webhook: cfg.webhookId !== null && cfg.webhookSegreto !== null,
      updatedAt: cfg.updatedAt,
      updatedBy: cfg.updatedBy,
    },
    piani,
    pagamenti,
    euro: formatoEuro,
    errore: extra.errore ?? null,
    erroreConfig: extra.erroreConfig ?? null,
  });
}

const corpo = (req: Request) => req.body as Record<string, unknown>;

masterPagamentiRouter.get(PATH, manage, (_req, res) => vista(res, 200));

masterPagamentiRouter.post(PATH, manage, requireCsrf, async (req, res) => {
  const b = corpo(req);
  const ambiente: AmbienteRevolut = b.ambiente === 'PRODUZIONE' ? 'PRODUZIONE' : 'SANDBOX';
  const raw = typeof b.chiave === 'string' ? b.chiave.trim() : '';
  if (raw.length > 300 || /\s|\p{Cc}/u.test(raw))
    return vista(res, 422, { erroreConfig: 'pagamenti.master.senzaChiave' });
  const esito = await salvaConfig(principalOf(req).user.id, {
    attivo: b.attivo === '1',
    ambiente,
    chiave: raw === '' ? null : raw,
  });
  if (esito === 'senzaChiave')
    return vista(res, 422, { erroreConfig: 'pagamenti.master.senzaChiave' });
  setFlash(res, 'ok', 'pagamenti.master.salvato');
  res.redirect(303, PATH);
});

masterPagamentiRouter.post(`${PATH}/webhook`, manage, requireCsrf, async (req, res) => {
  try {
    const esito = await registraIlWebhook(principalOf(req).user.id);
    if (esito === 'senzaChiave') setFlash(res, 'error', 'pagamenti.master.senzaChiave');
    else setFlash(res, 'ok', 'pagamenti.master.webhookOk');
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    setFlash(res, 'error', 'pagamenti.master.webhookErrore', { codice: String(error.stato) });
  }
  res.redirect(303, PATH);
});

masterPagamentiRouter.post(`${PATH}/piani`, manage, requireCsrf, async (req, res) => {
  const dati = leggiPiano(corpo(req));
  if (!dati) return vista(res, 422, { errore: 'pagamenti.master.pianoErrore' });
  await creaPiano(principalOf(req).user.id, dati);
  setFlash(res, 'ok', 'pagamenti.master.pianoCreato');
  res.redirect(303, `${PATH}#h-piani`);
});

masterPagamentiRouter.post(`${PATH}/piani/:id`, manage, requireCsrf, async (req, res) => {
  await attivaPiano(principalOf(req).user.id, String(req.params.id), corpo(req).attivo === '1');
  res.redirect(303, `${PATH}#h-piani`);
});

masterPagamentiRouter.post(`${PATH}/:id/verifica`, manage, requireCsrf, async (req, res) => {
  const stato = await riconcilia(String(req.params.id));
  if (stato) setFlash(res, 'info', `pagamenti.master.statoPagamento.${stato}`);
  res.redirect(303, `${PATH}#h-pagamenti`);
});
