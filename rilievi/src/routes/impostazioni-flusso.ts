import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { writeAudit } from '../audit.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import {
  aggiungiFornitore,
  fornitoreSchema,
  fornitoriDi,
  togliFornitore,
} from '../ordini/fornitori.js';
import { notFound, pathSezione, renderImpostazioni } from './impostazioni-vista.js';

/**
 * Настройките на работния поток (собственикът, 12 ноември 2026 — точки C2 и C7): адресникът на
 * доставчиците (раздел „Fornitori“) и одобрението на картите (в раздел „Scheda“). Пишат администраторът на
 * фирмата и MASTER (`aziende:settings`).
 */
export const impostazioniFlussoRouter: Router = Router();
const settings = requireCapability('aziende:settings');

async function aziendaDi(req: Parameters<typeof principalOf>[0]) {
  const body = req.body as Record<string, unknown>;
  const aziende = await aziendeImpostabili(principalOf(req).user);
  return { aziende, azienda: aziende.find((a) => a.id === body.azienda), body };
}

impostazioniFlussoRouter.post(
  '/impostazioni/fornitori',
  settings,
  requireCsrf,
  async (req, res) => {
    const { aziende, azienda, body } = await aziendaDi(req);
    if (!azienda) return notFound(req, res);
    const parsed = fornitoreSchema.safeParse({ nome: body.nome ?? '', email: body.email ?? '' });
    if (!parsed.success) {
      return renderImpostazioni(res, 422, {
        sezione: 'fornitori',
        aziende,
        azienda,
        fornitori: await fornitoriDi(azienda.id),
        nuovoFornitore: {
          nome: typeof body.nome === 'string' ? body.nome.slice(0, 120) : '',
          email: typeof body.email === 'string' ? body.email.slice(0, 254) : '',
          errore: true,
        },
      });
    }
    const esito = await aggiungiFornitore(principalOf(req).user, azienda.id, parsed.data);
    setFlash(res, esito === 'ok' ? 'ok' : 'error', `flusso.fornitori.flash.${esito}`);
    res.redirect(303, pathSezione('fornitori', azienda.id));
  },
);

impostazioniFlussoRouter.post(
  '/impostazioni/fornitori/togli',
  settings,
  requireCsrf,
  async (req, res) => {
    const { azienda, body } = await aziendaDi(req);
    if (!azienda || typeof body.id !== 'string') return notFound(req, res);
    await togliFornitore(principalOf(req).user, azienda.id, body.id);
    setFlash(res, 'ok', 'flusso.fornitori.flash.tolto');
    res.redirect(303, pathSezione('fornitori', azienda.id));
  },
);

impostazioniFlussoRouter.post(
  '/impostazioni/approvazione',
  settings,
  requireCsrf,
  async (req, res) => {
    const { azienda, body } = await aziendaDi(req);
    if (!azienda) return notFound(req, res);
    const attiva = body.attiva === '1';
    await prisma.$transaction(async (tx) => {
      await tx.azienda.update({ where: { id: azienda.id }, data: { approvazioneSchede: attiva } });
      await writeAudit(
        {
          actorId: principalOf(req).user.id,
          action: 'AZIENDA_APPROVAZIONE',
          aziendaId: azienda.id,
          targetType: 'azienda',
          targetId: azienda.id,
          meta: { attiva },
        },
        tx,
      );
    });
    setFlash(
      res,
      'ok',
      attiva
        ? 'flusso.approvazione.impostazione.flashOn'
        : 'flusso.approvazione.impostazione.flashOff',
    );
    res.redirect(303, pathSezione('scheda', azienda.id));
  },
);
