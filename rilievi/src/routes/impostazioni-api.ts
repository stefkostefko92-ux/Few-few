import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { chiaviDi, creaChiave, revocaChiave } from '../api/chiavi.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { setFlash } from '../http/flash.js';
import { notFound, pathSezione, renderImpostazioni } from './impostazioni-vista.js';

/**
 * „Chiavi API“ в настройките (точка D2): администраторът на фирмата (и MASTER) създава ключ с име — показан
 * веднъж, на страницата на отговора (`no-store`), после го няма никъде — и отменя ключ. Одит без ключа.
 */
export const impostazioniApiRouter: Router = Router();
const settings = requireCapability('aziende:settings');

const nomeDa = (raw: unknown): string | null => {
  const v =
    typeof raw === 'string'
      ? raw
          .replace(/\p{Cc}/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  return v && v.length <= 80 ? v : null;
};

impostazioniApiRouter.post('/impostazioni/api', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  if (!azienda) return notFound(req, res);
  const nome = nomeDa(body.nome);
  const vista = async (status: number, extra: { chiaveNuova?: string; erroreChiave?: string }) => {
    res.set('Cache-Control', 'no-store');
    renderImpostazioni(res, status, {
      sezione: 'api',
      aziende,
      azienda,
      chiaviApi: await chiaviDi(azienda.id),
      ...extra,
    });
  };
  if (!nome) return vista(422, { erroreChiave: 'nome' });
  const esito = await creaChiave(user.id, azienda.id, nome);
  if (esito.esito !== 'ok')
    return esito.esito === 'missing' ? notFound(req, res) : vista(422, { erroreChiave: 'piene' });
  return vista(200, { chiaveNuova: esito.chiave });
});

impostazioniApiRouter.post(
  '/impostazioni/api/:id/revoca',
  settings,
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const aziende = await aziendeImpostabili(principalOf(req).user);
    const azienda = aziende.find((a) => a.id === body.azienda);
    if (!azienda) return notFound(req, res);
    if (!(await revocaChiave(principalOf(req).user.id, azienda.id, String(req.params.id))))
      return notFound(req, res);
    setFlash(res, 'ok', 'api.revocata');
    res.redirect(303, pathSezione('api', azienda.id));
  },
);
