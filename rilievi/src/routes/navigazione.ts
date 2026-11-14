import { Router } from 'express';
import { isPartial, principalOf, requireUser } from '../auth/guards.js';
import { canAnywhere } from '../auth/scope.js';
import { cerca, trovato } from '../cerca/service.js';
import { menuPer } from '../http/menu.js';

/**
 * „Nuovo“ и търсенето (собственикът, 10 ноември 2026 — проучването на менюто): `/nuovo` е мястото, към
 * което води „Nuovo“ в лентата долу (какво може да създаде човекът, с описание), а `/cerca` — едното
 * търсене на портала: страница без JavaScript, парче HTML за прозореца Ctrl K (`X-Partial: 1`,
 * public/js/cerca.js).
 */
export const navigazioneRouter: Router = Router();

navigazioneRouter.get('/nuovo', requireUser, (req, res) => {
  const user = principalOf(req).user;
  const menu = menuPer((capability) => canAnywhere(user, capability));
  res.render('navigazione/nuovo', { voci: menu.nuovo });
});

navigazioneRouter.get('/cerca', requireUser, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const risultati = await cerca(principalOf(req).user, q, res.locals.t);
  if (isPartial(req)) {
    res.set('Cache-Control', 'no-store');
    res.render('navigazione/_risultati', {
      r: risultati,
      trovato: trovato(risultati),
      parziale: true,
    });
    return;
  }
  res.render('navigazione/cerca', { r: risultati, trovato: trovato(risultati), parziale: false });
});
