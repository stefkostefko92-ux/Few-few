import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { setFlash } from '../http/flash.js';
import {
  daApprovare,
  decidiApprovazione,
  inviaApprovazione,
  MAX_NOTA,
} from '../schede/approvazione.js';
import { scope } from './schede-shared.js';

/**
 * Одобрението на картите (точка C7; schede/approvazione.ts): „Invia per approvazione“ — който пише картата;
 * „Approva“/„Respingi“ — който има `schede:approve` във фирмата ѝ (обхватът го решава); `/approvazioni` —
 * пратените карти за одобрение. Всичко връща на картата с бележка какво е станало.
 */
export const schedeApprovazioneRouter: Router = Router();

const nota = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const v = raw
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTA);
  return v === '' ? null : v;
};

schedeApprovazioneRouter.post(
  '/schede/:id/approvazione/invia',
  requireCapability('schede:write'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const esito = await inviaApprovazione(scope(req, 'schede:write'), id, principalOf(req).user.id);
    // Всяко действие казва какво е станало, не „Fatto.“ (одитът на италианския, 12 ноември 2026).
    setFlash(
      res,
      esito === 'ok' ? 'ok' : 'error',
      `flusso.approvazione.flash.${esito === 'ok' ? 'inviata' : esito}`,
    );
    res.redirect(303, `/schede/${encodeURIComponent(id)}`);
  },
);

schedeApprovazioneRouter.post(
  '/schede/:id/approvazione/decidi',
  requireCapability('schede:approve'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const body = req.body as Record<string, unknown>;
    const decisione =
      body.decisione === 'approva' ? 'approva' : body.decisione === 'respingi' ? 'respingi' : null;
    if (!decisione) {
      setFlash(res, 'error', 'flusso.approvazione.flash.stato');
      return res.redirect(303, `/schede/${encodeURIComponent(id)}`);
    }
    const esito = await decidiApprovazione(
      scope(req, 'schede:approve'),
      id,
      principalOf(req).user,
      decisione,
      nota(body.nota),
      typeof body.base === 'string' ? body.base : '',
    );
    setFlash(
      res,
      esito === 'ok' ? 'ok' : 'error',
      `flusso.approvazione.flash.${esito === 'ok' ? (decisione === 'approva' ? 'approvata' : 'respinta') : esito}`,
    );
    res.redirect(303, `/schede/${encodeURIComponent(id)}`);
  },
);

schedeApprovazioneRouter.get(
  '/approvazioni',
  requireCapability('schede:approve'),
  async (req, res) => {
    res.render('schede/approvazioni', { righe: await daApprovare(scope(req, 'schede:approve')) });
  },
);
