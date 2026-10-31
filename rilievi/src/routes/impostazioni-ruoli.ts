import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { setRuoli, parseRuoli } from '../aziende/ruoli.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { setFlash } from '../http/flash.js';
import { notFound, renderImpostazioni } from './impostazioni.js';

/**
 * Имената и правата на ролите на фирмата (собственикът, 30 октомври 2026). Пишат администраторът ѝ и
 * MASTER (`aziende:settings`); фирма извън обхвата — 404. Правата важат от следващата заявка на всеки
 * човек във фирмата (сесията чете членствата при всяка заявка).
 */
export const impostazioniRuoliRouter: Router = Router();
const settings = requireCapability('aziende:settings');

impostazioniRuoliRouter.post('/impostazioni/ruoli', settings, requireCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const user = principalOf(req).user;
  const aziende = await aziendeImpostabili(user);
  const azienda = aziende.find((a) => a.id === body.azienda);
  if (!azienda) return notFound(req, res);
  const parsed = parseRuoli(body, (role) => res.locals.t(`role.${role}`));
  if (!parsed.ok) {
    return renderImpostazioni(res, 422, {
      aziende,
      azienda,
      ruoli: { values: parsed.valori, errors: parsed.errors },
    });
  }
  if (!(await setRuoli(user, azienda.id, parsed.nomi, parsed.permessi))) return notFound(req, res);
  setFlash(res, 'ok', 'flash.ruoliSaved');
  res.redirect(303, `/impostazioni?azienda=${encodeURIComponent(azienda.id)}#h-ruoli`);
});
