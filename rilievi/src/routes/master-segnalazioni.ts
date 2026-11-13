import type { EsitoSegnalazione } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { prisma } from '../db.js';
import { setFlash } from '../http/flash.js';
import {
  decidiSegnalazione,
  elencoSegnalazioni,
  ESITI,
  registraAutorita,
  registraIniziativa,
  registraRiesame,
} from '../segnalazioni/servizio.js';

/**
 * „Segnalazioni“ в конзолата на MASTER — отговорника за модерирането (собственикът, 12 ноември 2026; условията
 * 2026-11-13, чл. 25.4): опашката на сигналите, целият сигнал, решението с мотивите (при премахване или
 * ограничаване — и полетата по чл. 17, пар. 3), прегледът (чл. 25.7) и уведомяването на органите (чл. 18).
 * Само `aziende:manage`; за всеки друг — 403.
 */
export const masterSegnalazioniRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/segnalazioni';

const notFound = (req: Request, res: Response) =>
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');

/** Текст от формата: без управляващи знаци освен редовете, отрязан до `max`. */
const testo = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        .replace(/[^\P{Cc}\n]/gu, '')
        .trim()
        .slice(0, max)
    : '';

masterSegnalazioniRouter.get(PATH, manage, async (_req, res) => {
  res.render('master/segnalazioni', await elencoSegnalazioni());
});

// Проверка по собствена инициатива (чл. 25.6): случаят се отваря тук и се решава като сигнал.
masterSegnalazioniRouter.post(`${PATH}/iniziativa`, manage, requireCsrf, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const dove = testo(b.dove, 2000);
  const motivo = testo(b.motivo, 5000);
  if (dove.length < 5 || motivo.length < 20) {
    setFlash(res, 'error', 'segnalazioni.master.iniziativa.errore');
    return res.redirect(303, `${PATH}#h-iniziativa`);
  }
  const id = await registraIniziativa(principalOf(req).user.id, { dove, motivo });
  res.redirect(303, `${PATH}/${id}`);
});

async function scheda(
  req: Request,
  res: Response,
  status: number,
  id: string,
  errore: string | null = null,
  valori: Record<string, string> = {},
): Promise<void> {
  const s = await prisma.segnalazione.findUnique({
    where: { id },
    include: { decisaBy: { select: { name: true } } },
  });
  if (!s) return notFound(req, res);
  const aziende =
    s.stato === 'RICEVUTA' || s.stato === 'IN_ESAME'
      ? await prisma.azienda.findMany({
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
          take: 2000,
        })
      : [];
  res.set('Cache-Control', 'no-store');
  res.status(status).render('master/segnalazione', { s, aziende, esiti: ESITI, errore, valori });
}

masterSegnalazioniRouter.get(`${PATH}/:id`, manage, (req, res) =>
  scheda(req, res, 200, String(req.params.id)),
);

masterSegnalazioniRouter.post(`${PATH}/:id/decisione`, manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const b = req.body as Record<string, unknown>;
  const esito = ESITI.find((e) => e === b.esito) as EsitoSegnalazione | undefined;
  const valori = {
    esito: esito ?? '',
    motivazione: testo(b.motivazione, 5000),
    azienda: typeof b.azienda === 'string' ? b.azienda.slice(0, 40) : '',
    misura: testo(b.misura, 500),
    fatti: testo(b.fatti, 5000),
    fondamento: testo(b.fondamento, 500),
  };
  const m = 'segnalazioni.master.errore.';
  if (!esito) return scheda(req, res, 422, id, `${m}esito`, valori);
  if (valori.motivazione.length < 20) return scheda(req, res, 422, id, `${m}motivazione`, valori);
  const misura = esito === 'RIMOSSO' || esito === 'LIMITATO';
  if (
    misura &&
    (!valori.azienda ||
      valori.misura.length < 10 ||
      valori.fatti.length < 10 ||
      valori.fondamento.length < 5)
  )
    return scheda(req, res, 422, id, `${m}misura`, valori);
  const fatto = await decidiSegnalazione(principalOf(req).user.id, id, {
    esito,
    motivazione: valori.motivazione,
    aziendaId: misura ? valori.azienda : null,
    misura: misura ? valori.misura : null,
    fatti: misura ? valori.fatti : null,
    fondamento: misura ? valori.fondamento : null,
  });
  if (fatto === 'assente') return notFound(req, res);
  if (fatto === 'giaDecisa') return scheda(req, res, 409, id, `${m}giaDecisa`, valori);
  if (fatto === 'azienda') return scheda(req, res, 422, id, `${m}azienda`, valori);
  setFlash(res, 'ok', 'segnalazioni.master.flash.decisa');
  res.redirect(303, `${PATH}/${encodeURIComponent(id)}`);
});

masterSegnalazioniRouter.post(`${PATH}/:id/riesame`, manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const esito = testo((req.body as Record<string, unknown>).esito, 5000);
  if (esito.length < 20)
    return scheda(req, res, 422, id, 'segnalazioni.master.errore.riesame', { riesame: esito });
  if (!(await registraRiesame(principalOf(req).user.id, id, esito))) return notFound(req, res);
  setFlash(res, 'ok', 'segnalazioni.master.flash.riesame');
  res.redirect(303, `${PATH}/${encodeURIComponent(id)}`);
});

masterSegnalazioniRouter.post(`${PATH}/:id/autorita`, manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const autorita = testo((req.body as Record<string, unknown>).autorita, 200).replace(/\n/g, ' ');
  if (autorita.length < 3)
    return scheda(req, res, 422, id, 'segnalazioni.master.errore.autorita', {});
  if (!(await registraAutorita(id, autorita))) return notFound(req, res);
  setFlash(res, 'ok', 'segnalazioni.master.flash.autorita');
  res.redirect(303, `${PATH}/${encodeURIComponent(id)}`);
});
