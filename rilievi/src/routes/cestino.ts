import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { setFlash } from '../http/flash.js';
import { schedaTitle } from '../schede/format.js';
import { highlight } from '../schede/search.js';
import { getScheda, listSchede, purgeScheda, restoreScheda } from '../schede/service.js';
import { aziendaFilterOf, aziendeOf, notFound, queryOf, scope } from './schede-shared.js';

/**
 * Кошчето: изтритите карти от фирмите, в които човекът е ADMIN и нагоре (MASTER — всички) —
 * възстановяване и окончателно изтриване.
 */
export const cestinoRouter: Router = Router();

const trash = requireCapability('schede:trash');

cestinoRouter.get('/cestino', trash, async (req, res) => {
  const query = queryOf(req);
  const trashScope = scope(req, 'schede:trash');
  const azienda = aziendaFilterOf(req, trashScope);
  const [page, aziende] = await Promise.all([
    listSchede({ scope: trashScope, azienda, query, page: req.query.p, trash: true }),
    aziendeOf(req, trashScope),
  ]);
  res.render('schede/trash', { page, query, highlight, aziende, aziendaFilter: azienda ?? '' });
});

cestinoRouter.post('/cestino/:id/ripristina', trash, requireCsrf, async (req, res) => {
  const ok = await restoreScheda(
    scope(req, 'schede:trash'),
    String(req.params.id),
    principalOf(req).user.id,
  );
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaRestored');
  res.redirect(303, `/schede/${encodeURIComponent(String(req.params.id))}`);
});

cestinoRouter.get('/cestino/:id/elimina', trash, async (req, res) => {
  const trashScope = scope(req, 'schede:trash');
  const scheda = await getScheda(trashScope, String(req.params.id), trashScope);
  if (!scheda || !scheda.deletedAt) return notFound(req, res);
  res.render('schede/confirm', { scheda, ident: schedaTitle(scheda, res.locals.t), mode: 'purge' });
});

cestinoRouter.post('/cestino/:id/elimina', trash, requireCsrf, async (req, res) => {
  const ok = await purgeScheda(
    scope(req, 'schede:trash'),
    String(req.params.id),
    principalOf(req).user.id,
  );
  if (!ok) return notFound(req, res);
  setFlash(res, 'ok', 'flash.schedaPurged');
  res.redirect(303, '/cestino');
});
