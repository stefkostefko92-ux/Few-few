import { Router } from 'express';
import { isPartial, principalOf, requireCsrf, requireUser, safeNext } from '../auth/guards.js';
import { config } from '../config.js';
import { segnaLette } from '../novita/registro.js';
import { inizioGiorno, perGiorno, ULTIMO_AGGIORNAMENTO, VOCI } from '../novita/voci.js';
import { novitaRss } from '../seo/feed.js';
import { FEED_NOVITA_PATH, NOVITA_PATH } from '../seo/paths.js';
import { novitaStructuredData } from '../seo/structured-data.js';
import { publicCache, siteLocals } from './site.js';

/**
 * Новините: публичната страница `/novita` (по дни, всяка новина с котвата си), емисията `/novita.xml` и
 * „Ho capito“ на прозореца в портала (src/novita/popup.ts).
 */
export const novitaRouter: Router = Router();

novitaRouter.get(NOVITA_PATH, (req, res) => {
  publicCache(req, res);
  const locals = siteLocals(req, NOVITA_PATH);
  res.render('site/novita', {
    ...locals,
    jsonLd: novitaStructuredData(res.locals.t, locals.canonical ?? ''),
    giorni: perGiorno(VOCI).map((giorno) => ({ ...giorno, quando: inizioGiorno(giorno.data) })),
    aggiornato: inizioGiorno(ULTIMO_AGGIORNAMENTO),
    feed: FEED_NOVITA_PATH,
  });
});

novitaRouter.get(FEED_NOVITA_PATH, (_req, res) => {
  res
    .type('application/rss+xml')
    .set('Cache-Control', 'public, max-age=3600')
    .send(novitaRss(config().PUBLIC_BASE_URL));
});

/**
 * „Ho capito“: прочетено до сега. От прозореца с JavaScript — без страница (204); без него — обратно на
 * страницата, от която е дошъл (само наш път — `safeNext`).
 */
novitaRouter.post('/novita/lette', requireUser, requireCsrf, async (req, res) => {
  await segnaLette(principalOf(req).user.id);
  if (isPartial(req)) {
    res.status(204).end();
    return;
  }
  res.redirect(303, safeNext((req.body as Record<string, unknown>).torna));
});
