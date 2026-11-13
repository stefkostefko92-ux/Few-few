import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { ROOT } from '../paths.js';
import { manifestFor } from '../pwa/manifest.js';

/**
 * Манифестът и service worker-ът на приложението (src/pwa/manifest.ts). Монтирани са преди сесията —
 * без бисквитки и без база, еднакви за всички. И двата се питат наново при всяко отваряне (`no-cache`):
 * нова версия на иконите или на работника стига веднага. Работникът е в корена, за да обхваща целия
 * сайт (обхватът му е папката, от която идва).
 */
export function pwaRouter(): Router {
  const router = Router();
  const serviceWorker = readFileSync(join(ROOT, 'public', 'js', 'sw.js'));

  router.get(['/manifest.webmanifest', '/en/manifest.webmanifest'], (req, res) => {
    const locale = req.path.startsWith('/en/') ? 'en' : 'bg';
    res
      .set('Cache-Control', 'no-cache')
      .type('application/manifest+json')
      .send(JSON.stringify(manifestFor(locale, String(res.locals.v))));
  });

  router.get('/sw.js', (_req, res) => {
    res
      .set('Cache-Control', 'no-cache')
      .set('Service-Worker-Allowed', '/')
      .type('text/javascript')
      .send(serviceWorker);
  });

  return router;
}
