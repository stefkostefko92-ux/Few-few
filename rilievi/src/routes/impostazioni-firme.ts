import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { writeAudit } from '../audit.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import { informativaSchema } from '../legale/informativa.js';
import { notFound, pathSezione, renderImpostazioni } from './impostazioni-vista.js';

/**
 * „Informativa per chi firma“ (собственикът, 12 ноември 2026 — точка D4): ADMIN на фирмата (и MASTER) пише
 * информацията по чл. 13 GDPR, която клиентът чете преди подписа; „Torna al modello“ я трие (null —
 * моделът с данните на фирмата). Одит `AZIENDA_INFORMATIVA` без текста.
 */
export const impostazioniFirmeRouter: Router = Router();

impostazioniFirmeRouter.post(
  '/impostazioni/informativa',
  requireCapability('aziende:settings'),
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = principalOf(req).user;
    const aziende = await aziendeImpostabili(user);
    const azienda = aziende.find((a) => a.id === body.azienda);
    if (!azienda) return notFound(req, res);
    let testo: string | null = null;
    if (body.azione !== 'ripristina') {
      const parsed = informativaSchema.safeParse(typeof body.testo === 'string' ? body.testo : '');
      if (!parsed.success) {
        return renderImpostazioni(res, 422, {
          sezione: 'firme',
          aziende,
          azienda,
          informativa: {
            valore: typeof body.testo === 'string' ? body.testo.slice(0, 4000) : '',
            propria: azienda.informativaFirme !== null,
            errore: true,
          },
        });
      }
      testo = parsed.data;
    }
    await prisma.$transaction(async (tx) => {
      await tx.azienda.update({ where: { id: azienda.id }, data: { informativaFirme: testo } });
      await writeAudit(
        {
          actorId: user.id,
          action: 'AZIENDA_INFORMATIVA',
          aziendaId: azienda.id,
          targetType: 'azienda',
          targetId: azienda.id,
          meta: { modello: testo === null },
        },
        tx,
      );
    });
    setFlash(res, 'ok', testo === null ? 'flash.informativaModello' : 'flash.informativaSalvata');
    res.redirect(303, pathSezione('firme', azienda.id));
  },
);
