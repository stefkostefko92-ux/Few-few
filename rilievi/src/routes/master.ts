import { Router } from 'express';
import { requireCapability } from '../auth/guards.js';
import { prisma } from '../db.js';
import { CAMPI_EMISSIONE, sigilloValido } from '../legale/sigillo.js';
import { panoramica, SERIE } from '../master/panoramica.js';
import { statoSistema } from '../master/sistema.js';

/**
 * Конзолата на MASTER (собственикът, 10 ноември 2026 — „Espandi le funzioni di master con tutto quello
 * che ti viene in mente“): числата на портала, дейността по седмици, най-активните фирми, здравето на
 * системата, последните изтеглени изчисления (с проверката на печата) и последните действия на портала.
 * Само `aziende:manage` (MASTER); договорите, проверката и съобщенията — в своите рутери.
 */
export const masterRouter: Router = Router();
const manage = requireCapability('aziende:manage');

masterRouter.get('/master', manage, async (_req, res) => {
  const now = new Date();
  const [dati, sistema, emissioni, registro] = await Promise.all([
    panoramica(now),
    statoSistema(now),
    prisma.emissioneCalcolo.findMany({ orderBy: { at: 'desc' }, take: 6 }),
    // Входовете и изходите са шум тук — те са в регистъра.
    prisma.auditLog.findMany({
      where: { action: { notIn: ['LOGIN', 'LOGOUT'] } },
      orderBy: { at: 'desc' },
      take: 8,
      select: {
        id: true,
        at: true,
        action: true,
        actor: { select: { name: true } },
        azienda: { select: { name: true } },
      },
    }),
  ]);
  const massimo = Math.max(1, ...dati.settimane.map((s) => s.totale));
  res.set('Cache-Control', 'no-store').render('master/index', {
    dati,
    sistema,
    massimo,
    serie: Object.keys(SERIE),
    emissioni: emissioni.map((e) => ({
      id: e.id,
      at: e.at,
      calcolo: e.calcolo,
      impronta: e.impronta,
      azienda: e.aziendaNome,
      integro: sigilloValido(e, CAMPI_EMISSIONE),
    })),
    registro,
  });
});
