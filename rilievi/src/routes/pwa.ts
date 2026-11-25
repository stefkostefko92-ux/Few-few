import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import { translatorFor } from '../i18n.js';
import { ROOT } from '../paths.js';
import { manifestDi } from '../pwa/manifest.js';

/**
 * Приложението на началния екран (src/pwa/manifest.ts): манифестът и service worker-ът. Монтирани са
 * преди сесията — без бисквитки и без база, еднакви за всички. И двата се питат наново при всяко
 * отваряне (`no-cache`): нова версия на иконите или на работника стига веднага. Работникът е в корена,
 * за да обхваща целия сайт (обхватът му е папката, от която идва).
 */
export const pwaRouter: Router = Router();

const t = translatorFor('it');
const SERVICE_WORKER = readFileSync(join(ROOT, 'public', 'js', 'sw.js'));

pwaRouter.get('/manifest.webmanifest', (_req, res) => {
  res
    .set('Cache-Control', 'no-cache')
    .type('application/manifest+json')
    .send(JSON.stringify(manifestDi(t, String(res.locals.v))));
});

pwaRouter.get('/sw.js', (_req, res) => {
  res.set('Cache-Control', 'no-cache').type('text/javascript').send(SERVICE_WORKER);
});
