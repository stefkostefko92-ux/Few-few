import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { allAziendeNames } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { schedaTitle } from '../schede/format.js';
import { highlight } from '../schede/search.js';
import { getScheda, listSchede, purgeScheda, restoreScheda } from '../schede/service.js';
import { aziendaFilterOf, notFound, queryOf, scope } from './schede-shared.js';

/** Кошчето: изтритите карти в обхвата — възстановяване и окончателно изтриване (ADMIN и нагоре). */
export const cestinoRouter: Router = Router();

const trash = requireCapability('schede:trash');

cestinoRouter.get('/cestino', trash, async (req, res) => {
  const query = queryOf(req);
  const azienda = aziendaFilterOf(req);
  const [page, aziende] = await Promise.all([
    listSchede({ scope: scope(req), azienda, query, page: req.query.p, trash: true }),
    scope(req).all ? allAziendeNames() : Promise.resolve([]),
  ]);
  res.render('schede/trash', { page, query, highlight, aziende, aziendaFilter: azienda ?? '' });
});

cestinoRouter.post('/cestino/:id/ripristina', trash, requireCsrf, async (req, res) => {
  const ok = await restoreScheda(scope(req), String(req.params.id), principalOf(req).user.id);
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaRestored');
  res.redirect(303, `/schede/${encodeURIComponent(String(req.params.id))}`);
});

cestinoRouter.get('/cestino/:id/elimina', trash, async (req, res) => {
  const scheda = await getScheda(scope(req), String(req.params.id), true);
  if (!scheda || !scheda.deletedAt) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'purge' });
});

cestinoRouter.post('/cestino/:id/elimina', trash, requireCsrf, async (req, res) => {
  const ok = await purgeScheda(scope(req), String(req.params.id), principalOf(req).user.id);
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaPurged');
  res.redirect(303, '/cestino');
});
