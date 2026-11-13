import { Router } from 'express';
import { config } from '../config.js';
import { deviceOf, isSamsungInternet, openInChromeUrl } from '../pwa/device.js';

/**
 * „Инсталирай приложението“ (`/prilozhenie`): бутонът на Chrome и Edge, когато браузърът го предлага
 * (public/js/install.js), и стъпките за iPhone/iPad, Android и компютър. Публична (стига до нея и
 * входът), без данни, `noindex` като цялото приложение. Стъпките на устройството идват отворени от
 * сървъра — отговорът зависи от User-Agent.
 */
export function installRouter(): Router {
  const router = Router();
  router.get('/prilozhenie', (req, res) => {
    const userAgent = req.get('user-agent');
    res.vary('User-Agent');
    res.render('app/install', {
      device: deviceOf(userAgent),
      samsung: isSamsungInternet(userAgent),
      chromeUrl: openInChromeUrl(config().PUBLIC_BASE_URL, '/prilozhenie'),
      scripts: ['install'],
    });
  });
  return router;
}
