import { Router } from 'express';
import { requireUser } from '../auth/guards.js';
import { config } from '../config.js';
import { markNewsRead } from '../news/registry.js';
import { NEWS_FEED_PATHS, newsRss } from '../news/feed.js';

/**
 * „Какво ново“: емисиите (публични) и „Разбрах“ в прозореца на приложението (src/news/popup.ts). Самата
 * страница е на витрината (src/seo/pages.ts — `news`).
 */
export function newsFeedRouter(): Router {
  const router = Router();
  for (const locale of ['bg', 'en'] as const) {
    router.get(NEWS_FEED_PATHS[locale], (_req, res) => {
      res
        .type('application/rss+xml')
        .set('Cache-Control', 'public, max-age=3600')
        .send(newsRss(config().PUBLIC_BASE_URL, locale));
    });
  }
  return router;
}

/** Само наш път в приложението — „Разбрах“ без JavaScript връща там, откъдето е дошъл. */
function safeBack(value: unknown): string {
  return typeof value === 'string' &&
    /^\/(app|admin)(\/[\w\-./?=&%]*)?$/.test(value) &&
    value.length <= 300
    ? value
    : '/app';
}

/** „Разбрах“: с JavaScript — без страница (204); без него — обратно (CSRF е общ — mount.ts). */
export function newsReadRouter(): Router {
  const router = Router();
  router.post('/app/kakvo-novo/procheteni', requireUser(), async (req, res) => {
    await markNewsRead(req.principal!.user.id);
    if (req.get('x-partial') === '1') {
      res.status(204).end();
      return;
    }
    res.redirect(303, safeBack((req.body as Record<string, unknown>)['back']));
  });
  return router;
}
