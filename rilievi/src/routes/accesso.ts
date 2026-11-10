import { Router } from 'express';
import { account2faRouter } from './account-2fa.js';
import { accountColoriRouter } from './account-colori.js';
import { accountRouter } from './account.js';
import { authCodiceRouter } from './auth-codice.js';
import { authRouter } from './auth.js';
import { calcoloElencoRouter } from './calcolo-argano-elenco.js';
import { calcoloLiberoRouter } from './calcolo-argano-libero.js';
import { calcoloArganoRouter } from './calcolo-argano.js';

/**
 * Групите рутери, които server.ts закача на едно място (в този ред): входът (паролата, кодът на 2FA,
 * поканите, новата парола) и профилът; изчислението за аргано (на картата, страницата в менюто, без
 * карта — `/calcolo-argano/nuovo` преди `/calcolo-argano/:id`).
 */
export const accessoRouter: Router = Router();
accessoRouter.use(
  authRouter,
  authCodiceRouter,
  accountRouter,
  accountColoriRouter,
  account2faRouter,
);

export const calcoloRouter: Router = Router();
calcoloRouter.use(calcoloArganoRouter, calcoloElencoRouter, calcoloLiberoRouter);
