import { Router } from 'express';

/**
 * „Installa l'app“ (`/app`): как се слага порталът на началния екран на всяко устройство — бутонът на
 * Chrome и Edge, когато браузърът го предлага (public/js/installa.js), и стъпките за iPhone/iPad, Android
 * и компютър. Публична (стига до нея и входът), без данни; не се индексира, както целият портал.
 */
export const installaRouter: Router = Router();

installaRouter.get('/app', (_req, res) => {
  res.render('app/installa', { titleKey: 'installa.title', scripts: ['installa'] });
});
