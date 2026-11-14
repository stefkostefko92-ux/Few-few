// Инсталируемото приложение (src/pwa.js): манифестът, service worker-ът и страницата /app.
// Монтира се ПРЕДИ express.static: /sw.js трябва да се пита наново при всяко отваряне
// (`no-cache`), иначе статиката би го закешира за 7 дни и поправка в него не би стигнала.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { baseUrl } from '../config.js';
import { deviceOf, isSamsungInternet, manifest, openInChrome } from '../pwa.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_WORKER = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'));

// assetVer идва от app.js (хешът на статиката) — иконите в манифеста носят версията.
export default function pwaRoutes(assetVer) {
  const router = Router();

  router.get('/manifest.webmanifest', (req, res) => {
    res
      .set('Cache-Control', 'no-cache')
      .type('application/manifest+json')
      .send(JSON.stringify(manifest(assetVer)));
  });

  router.get('/sw.js', (req, res) => {
    res
      .set('Cache-Control', 'no-cache')
      .set('Service-Worker-Allowed', '/')
      .type('text/javascript')
      .send(SERVICE_WORKER);
  });

  return router;
}

// „Инсталирай приложението“ — стъпките на устройството идват отворени от сървъра. Монтира се
// след общите locals (user, siteBase, icon…), както всяка страница.
export function installPage() {
  const router = Router();
  router.get('/app', (req, res) => {
    const ua = req.get('user-agent');
    res.vary('User-Agent');
    res.render('app', {
      title: 'Инсталирай приложението',
      pageMeta: {
        description:
          'Сложи Vizitka на началния екран на телефона или на компютъра: отваря се с едно докосване, в свой прозорец, без лентите на браузъра. iPhone, Android, Windows и Mac.',
        keywords:
          'Vizitka приложение, Carbon Stealth, инсталирай Vizitka, дигитална визитка приложение, PWA, начален екран, QR визитка',
      },
      // Помощна страница — не е отделно намерение за търсене (тънко съдържание, зависи от устройството).
      noindex: true,
      device: deviceOf(ua),
      samsung: isSamsungInternet(ua),
      chromeUrl: openInChrome(baseUrl(req), '/app'),
    });
  });

  return router;
}
