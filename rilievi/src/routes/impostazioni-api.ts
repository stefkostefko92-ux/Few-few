import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf, requireUser } from '../auth/guards.js';
import { aziendeDaAdmin, inSolaLettura } from '../auth/scope.js';
import { chiaviDi, creaChiave, revocaChiave } from '../api/chiavi.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
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

/**
 * Отмяната е отнемане на достъп, не настройка: по роля ADMIN във фирмата (и MASTER), не по `aziende:settings` —
 * остава и при изтекъл абонамент (одитът от 12 ноември 2026: ключът четеше до година, а ADMIN не можеше да го
 * спре; условията, чл. 4.1 и 12.5). Тогава връща към „Abbonamento“, единствения раздел, който фирмата вижда.
 */
impostazioniApiRouter.post(
  '/impostazioni/api/:id/revoca',
  requireUser,
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = principalOf(req).user;
    const wanted = typeof body.azienda === 'string' ? body.azienda : '';
    const azienda =
      wanted && (user.master || aziendeDaAdmin(user).includes(wanted))
        ? await prisma.azienda.findFirst({
            where: { id: wanted, deactivatedAt: null },
            select: { id: true },
          })
        : null;
    if (!azienda) return notFound(req, res);
    if (!(await revocaChiave(user.id, azienda.id, String(req.params.id))))
      return notFound(req, res);
    setFlash(res, 'ok', 'api.revocata');
    res.redirect(
      303,
      inSolaLettura(user, azienda.id)
        ? `/impostazioni/abbonamento?azienda=${encodeURIComponent(azienda.id)}`
        : pathSezione('api', azienda.id),
    );
  },
);
