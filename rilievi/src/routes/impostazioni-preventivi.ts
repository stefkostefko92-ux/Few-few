import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { writeAudit } from '../audit.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import {
  condizioniSchema,
  MAX_CONDIZIONI,
  setCondizioniPredefinite,
} from '../preventivi/azienda.js';
import { informativaSchema, MAX_INFORMATIVA } from '../legale/informativa.js';
import { notFound, pathSezione, renderImpostazioni } from './impostazioni-vista.js';

/**
 * „Preventivi“ в настройките (C1): условията, с които започва всяка нова оферта (плащане, срокове,
 * гаранция) — до 2000 знака, празно — без; и информацията по чл. 13 и 14 GDPR в края на всяка оферта
 * (собственикът, 14 ноември 2026) — текстът на фирмата до 4000 знака, „Torna al modello“ — моделът (null).
 * Пише ADMIN на фирмата (и MASTER), само при включени оферти. Одит `AZIENDA_PREVENTIVI_CONDIZIONI` и
 * `AZIENDA_INFORMATIVA` (`documento: preventivi`) — без текста.
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

impostazioniPreventiviRouter.post(
  '/impostazioni/preventivi/informativa',
  requireCapability('aziende:settings'),
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = principalOf(req).user;
    const aziende = await aziendeImpostabili(user);
    const azienda = aziende.find((a) => a.id === body.azienda);
    if (!azienda || !azienda.preventiviAttivi) return notFound(req, res);
    let testo: string | null = null;
    if (body.azione !== 'ripristina') {
      const parsed = informativaSchema.safeParse(typeof body.testo === 'string' ? body.testo : '');
      if (!parsed.success) {
        return renderImpostazioni(res, 422, {
          sezione: 'preventivi',
          aziende,
          azienda,
          informativaPreventivi: {
            valore: typeof body.testo === 'string' ? body.testo.slice(0, MAX_INFORMATIVA) : '',
            propria: azienda.informativaPreventivi !== null,
            errore: true,
          },
        });
      }
      testo = parsed.data;
    }
    await prisma.$transaction(async (tx) => {
      await tx.azienda.update({
        where: { id: azienda.id },
        data: { informativaPreventivi: testo },
      });
      await writeAudit(
        {
          actorId: user.id,
          action: 'AZIENDA_INFORMATIVA',
          aziendaId: azienda.id,
          targetType: 'azienda',
          targetId: azienda.id,
          meta: { modello: testo === null, documento: 'preventivi' },
        },
        tx,
      );
    });
    setFlash(res, 'ok', testo === null ? 'flash.informativaModello' : 'flash.informativaSalvata');
    res.redirect(303, pathSezione('preventivi', azienda.id));
  },
);
