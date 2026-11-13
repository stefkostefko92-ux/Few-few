import { Router, type Response } from 'express';
import { urlDiscord } from '../allarmi/discord.js';
import { leggiAllarmi, provaAllarmi, salvaAllarmi } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { setFlash } from '../http/flash.js';
import { confermaPassword } from './conferma-password.js';

/**
 * „Allarmi“ в конзолата на MASTER (собственикът, 12 ноември 2026): алармите на портала към канал в Discord —
 * вкл./изкл., адресът на webhook-а (само се пише; съдържа токена му — пази се шифрован и не се показва), пробно
 * съобщение. Всяка промяна — само с паролата: откраднатата сесия не заглушава алармите. Само `aziende:manage`.
 */
export const masterAllarmiRouter: Router = Router();
const manage = requireCapability('aziende:manage');
const PATH = '/master/allarmi';

async function vista(res: Response, status: number, errore: string | null = null): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.status(status).render('master/allarmi', { stato: await leggiAllarmi(), errore });
}

masterAllarmiRouter.get(PATH, manage, (_req, res) => vista(res, 200));

masterAllarmiRouter.post(PATH, manage, requireCsrf, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const scritto = typeof b.url === 'string' ? b.url.trim() : '';
  const url = scritto === '' ? null : urlDiscord(scritto);
  // Написаното не се връща на страницата: адресът е тайна, и грешен.
  if (scritto !== '' && !url) return vista(res, 422, 'allarmi.errore.url');
  const conferma = await confermaPassword(req, res);
  if (conferma === 'bloccato') return;
  if (conferma === 'errata') return vista(res, 422, 'allarmi.errore.password');
  const esito = await salvaAllarmi(principalOf(req).user.id, { attivo: b.attivo === '1', url });
  if (esito === 'senzaUrl') return vista(res, 422, 'allarmi.errore.senzaUrl');
  setFlash(res, 'ok', 'allarmi.salvato');
  res.redirect(303, PATH);
});

masterAllarmiRouter.post(`${PATH}/prova`, manage, requireCsrf, async (req, res) => {
  const esito = await provaAllarmi();
  await writeAudit({
    actorId: principalOf(req).user.id,
    action: 'ALLARMI_PROVA',
    aziendaId: null,
    targetType: 'allarmi',
    targetId: 'discord',
    meta: { esito: String(esito) },
  });
  if (esito === 'spenti') setFlash(res, 'info', 'allarmi.prova.spenti');
  else if (esito === 'rete') setFlash(res, 'error', 'allarmi.prova.rete');
  else if (esito >= 200 && esito < 300) setFlash(res, 'ok', 'allarmi.prova.ok');
  else setFlash(res, 'error', 'allarmi.prova.errore', { codice: String(esito) });
  res.redirect(303, PATH);
});
