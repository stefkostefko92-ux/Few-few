import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { setFlash } from '../http/flash.js';
import {
  condizioniSchema,
  MAX_CONDIZIONI,
  setCondizioniPredefinite,
} from '../preventivi/azienda.js';
import { notFound, pathSezione, renderImpostazioni } from './impostazioni-vista.js';

/**
 * „Preventivi“ в настройките (C1): условията, с които започва всяка нова оферта (плащане, срокове,
 * гаранция) — до 2000 знака, празно — без. Пише ADMIN на фирмата (и MASTER), само при включени оферти.
 * Одит `AZIENDA_PREVENTIVI_CONDIZIONI` без текста.
 */
export const impostazioniPreventiviRouter: Router = Router();

impostazioniPreventiviRouter.post(
  '/impostazioni/preventivi',
  requireCapability('aziende:settings'),
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = principalOf(req).user;
    const aziende = await aziendeImpostabili(user);
    const azienda = aziende.find((a) => a.id === body.azienda);
    if (!azienda || !azienda.preventiviAttivi) return notFound(req, res);
    const parsed = condizioniSchema.safeParse(body.condizioni ?? '');
    if (!parsed.success) {
      return renderImpostazioni(res, 422, {
        sezione: 'preventivi',
        aziende,
        azienda,
        preventivi: {
          valore:
            typeof body.condizioni === 'string'
              ? body.condizioni.slice(0, MAX_CONDIZIONI + 100)
              : '',
          errore: true,
        },
      });
    }
    if (!(await setCondizioniPredefinite(user, azienda.id, parsed.data))) return notFound(req, res);
    setFlash(res, 'ok', 'preventivi.flash.condizioni');
    res.redirect(303, pathSezione('preventivi', azienda.id));
  },
);
