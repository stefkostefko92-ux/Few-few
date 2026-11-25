import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { annotazioniDa, salvaAnnotazioni } from '../allegati/annotazioni.js';
import { allegatoDi } from '../allegati/service.js';
import { getScheda } from '../schede/service.js';
import { notFound, scope } from './schede-shared.js';

/**
 * Анотациите върху снимка на картата (C5): листът от редактора на скицника, пратен от страницата на формата
 * (`public/js/annotazioni.js`, `fetch` — формата на картата остава отворена с написаното). Пише, който пише
 * карти във фирмата, не в кошчето; само на готова снимка. Празен лист — без анотации; неверен — 422.
 * Отговорът е JSON: страницата обновява плочката сама.
 */
export const allegatiAnnotazioniRouter: Router = Router();

allegatiAnnotazioniRouter.post(
  '/schede/:id/allegati/:aid/annotazioni',
  requireCapability('schede:write'),
  requireCsrf,
  async (req, res) => {
    const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
    const allegato =
      scheda && !scheda.deletedAt ? await allegatoDi(scheda.id, String(req.params.aid)) : null;
    if (!scheda || !allegato || allegato.tipo !== 'FOTO' || allegato.stato !== 'PRONTO')
      return notFound(req, res);
    const raw = (req.body as Record<string, unknown>).foglio;
    if (typeof raw !== 'string') {
      res.status(422).set('Cache-Control', 'no-store').json({ ok: false });
      return;
    }
    const foglio = annotazioniDa(raw);
    // Неверният лист не се записва; празният („Svuota“, всичко изтрито) маха анотациите.
    if (!foglio && !/^\s*(\{\s*"e"\s*:\s*\[\s*\]\s*\})?\s*$/.test(raw)) {
      res.status(422).set('Cache-Control', 'no-store').json({ ok: false });
      return;
    }
    const ok = await salvaAnnotazioni({
      actorId: principalOf(req).user.id,
      aziendaId: scheda.aziendaId,
      schedaId: scheda.id,
      allegatoId: allegato.id,
      foglio,
    });
    if (!ok) return notFound(req, res);
    res.set('Cache-Control', 'no-store').json({ ok: true, annotazioni: foglio });
  },
);
