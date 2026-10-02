import { Router } from 'express';
import { isProduction } from '../config.js';
import { outbox } from '../mail/mailer.js';

/**
 * Кутията с писма за разработка и e2e тестове. Съществува само при RENDETTO_DEV_OUTBOX=1 И извън
 * продукция — в продукция маршрутът изобщо не се закача (виж server.ts).
 */
export const devRouter: Router = Router();

devRouter.get('/__dev/outbox', (_req, res) => {
  if (isProduction()) {
    res.status(404).end();
    return;
  }
  res.set('Cache-Control', 'no-store').json(outbox.slice(-50));
});
