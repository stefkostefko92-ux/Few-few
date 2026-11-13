import { Router } from 'express';
import { config } from '../config.js';
import { apriInChrome, samsungInternet, sistemaDi } from '../pwa/sistema.js';

/**
 * „Installa l'app“ (`/app`): как се слага порталът на началния екран на всяко устройство — бутонът на
 * Chrome и Edge, когато браузърът го предлага (public/js/installa.js), и стъпките за iPhone/iPad, Android
 * и компютър. Публична (стига до нея и входът), без данни; не се индексира, както целият портал.
 * Стъпките на устройството идват отворени от сървъра — отговорът зависи от User-Agent.
 */
export const installaRouter: Router = Router();

installaRouter.get('/app', (req, res) => {
  res.vary('User-Agent');
  res.render('app/installa', {
    titleKey: 'installa.title',
    scripts: ['installa'],
    sistema: sistemaDi(req.get('user-agent')),
    // Samsung Internet: инсталирането оттам Android го бележи „non sicura“ — към Chrome.
    samsung: samsungInternet(req.get('user-agent')),
    chromeUrl: apriInChrome(config().PUBLIC_BASE_URL, '/app'),
  });
});
